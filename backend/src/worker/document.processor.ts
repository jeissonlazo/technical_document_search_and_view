import { Inject } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly extraction: ExtractionService,
    private readonly search: SearchService,
    private readonly events: EventsService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {
    super();
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
      const object = await this.storage.get(document.objectKey);
      const buffer = await streamToBuffer(object.body);
      const text = await this.extraction.extract(buffer, document.mime, document.objectKey);

      if (!document.normalizedTextKey) {
        throw new AppError('INTERNAL_ERROR', 'El documento no tiene clave de texto normalizado.', 500, false);
      }

      await this.storage.put(
        document.normalizedTextKey,
        Buffer.from(text, 'utf8'),
        'text/plain; charset=utf-8',
      );

      await this.search.indexDocument(
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
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
