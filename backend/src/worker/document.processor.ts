import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import type { Document as PrismaDocument } from '@prisma/client';
import type { Readable } from 'stream';
import { AppError } from '../common/app-error';
import { EventsService } from '../events/events.service';
import { ExtractionService } from '../extraction/extraction.service';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../storage/storage.types';

interface DocumentJob {
  documentId: string;
}

@Processor('documents', { concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) })
export class DocumentProcessor extends WorkerHost {
  private readonly timeoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: ExtractionService,
    private readonly search: SearchService,
    private readonly events: EventsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    config: ConfigService,
  ) {
    super();
    this.timeoutMs = config.get<number>('processing.timeoutMs') ?? 60_000;
  }

  async process(job: Job<DocumentJob>): Promise<void> {
    const document = await this.prisma.document.findUnique({
      where: { id: job.data.documentId },
    });
    if (!document) return;

    // Idempotencia: un reintento de un trabajo ya indexado no vuelve a procesarlo.
    if (document.status === 'INDEXED') return;

    await this.prisma.document.update({
      where: { id: document.id },
      data: { status: 'PROCESSING' },
    });

    await this.events.publish({
      type: 'document.status',
      documentId: document.id,
      userId: document.userId,
      status: 'PROCESSING',
      stage: 'extraction',
      attempt: job.attemptsMade + 1,
    });

    try {
      const text = await withTimeout(
        this.resolveText(document),
        this.timeoutMs,
        'La extracción de texto',
      );

      if (!document.normalizedTextKey) {
        throw new AppError('INTERNAL_ERROR', 'El documento no tiene clave de texto normalizado.', 500, false);
      }

      await this.storage.put(
        document.normalizedTextKey,
        Buffer.from(text, 'utf8'),
        'text/plain; charset=utf-8',
      );

      await withTimeout(
        this.search.indexDocument(
          {
            id: document.id,
            userId: document.userId,
            title: document.title,
            description: document.description,
            author: document.author,
            category: document.category,
            version: document.version,
            tags: document.tags,
            createdAt: document.createdAt,
          },
          text,
        ),
        this.timeoutMs,
        'La indexación',
      );

      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: 'INDEXED',
          indexedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });

      await this.events.publish({
        type: 'document.status',
        documentId: document.id,
        userId: document.userId,
        status: 'INDEXED',
        stage: 'indexing',
        attempt: job.attemptsMade + 1,
      });
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError('INTERNAL_ERROR', 'No se pudo procesar el documento.', 500, false);

      const totalAttempts = job.opts.attempts ?? 1;
      const isLastAttempt = job.attemptsMade + 1 >= totalAttempts;

      if (appError.retryable && !isLastAttempt) {
        // Mantener PROCESSING durante reintentos transitorios; ERROR es terminal.
        await this.prisma.document.update({
          where: { id: document.id },
          data: {
            status: 'PROCESSING',
            errorCode: appError.code,
            errorMessage: appError.message,
          },
        });

        await this.events.publish({
          type: 'document.status',
          documentId: document.id,
          userId: document.userId,
          status: 'PROCESSING',
          stage: 'retry',
          errorCode: appError.code,
          message: appError.message,
          retryable: true,
          attempt: job.attemptsMade + 1,
        });

        throw error;
      }

      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: 'ERROR',
          errorCode: appError.code,
          errorMessage: appError.message,
        },
      });

      await this.events.publish({
        type: 'document.status',
        documentId: document.id,
        userId: document.userId,
        status: 'ERROR',
        stage: 'processing',
        errorCode: appError.code,
        message: appError.message,
        retryable: appError.retryable,
        attempt: job.attemptsMade + 1,
      });

      if (!appError.retryable) {
        throw new UnrecoverableError(appError.message);
      }
      throw error;
    }
  }

  private async resolveText(document: PrismaDocument): Promise<string> {
    // En reintentos reutilizamos el texto ya normalizado, si existe.
    if (document.normalizedTextKey) {
      try {
        const normalized = await this.storage.get(document.normalizedTextKey);
        const text = (await streamToBuffer(normalized.body)).toString('utf8').trim();
        if (text) return text;
      } catch {
        // Si el objeto normalizado falta, se vuelve a extraer del original.
      }
    }

    const object = await this.storage.get(document.objectKey);
    const buffer = await streamToBuffer(object.body);
    return this.extraction.extract(buffer, document.mime, document.objectKey);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, stage: string): Promise<T> {
  if (timeoutMs <= 0) return promise;

  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new AppError(
          'PROCESSING_TIMEOUT',
          `${stage} superó el tiempo máximo de ${Math.round(timeoutMs / 1000)} s.`,
          504,
          true,
        ),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
