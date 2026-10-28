import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import type { Readable } from 'stream';
import type { Document as PrismaDocument } from '@prisma/client';
import type {
  BatchUploadItemResult,
  BatchUploadResponse,
  DocumentMetadata,
} from '@docs/shared';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { OBJECT_STORAGE, type ObjectStorage, type StoredObject } from '../storage/storage.types';
import { CreateDocumentDto } from './documents.dto';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.markdown', '.docx']);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly queue: QueueService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async create(
    userId: string,
    file: Express.Multer.File | undefined,
    dto: CreateDocumentDto,
  ): Promise<DocumentMetadata> {
    if (!file || !file.buffer?.length) {
      throw new AppError('EMPTY_FILE', 'El archivo está vacío.', 422, false);
    }

    const maxSize = this.config.getOrThrow<number>('limits.maxFileSizeBytes');
    if (file.size > maxSize) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `El archivo supera el tamaño máximo permitido de ${Math.round(maxSize / 1024 / 1024)} MB.`,
        413,
        false,
        { maxSize },
      );
    }

    const extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new AppError(
        'UNSUPPORTED_FILE_TYPE',
        'El formato no está admitido. Sube TXT, PDF, Markdown o DOCX.',
        415,
        false,
      );
    }

    const documentId = randomUUID();
    const bucket = this.config.getOrThrow<string>('r2.bucket');
    const objectKey = `documents/${userId}/${documentId}/original${extension}`;
    const normalizedTextKey = `documents/${userId}/${documentId}/normalized.txt`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const mime = file.mimetype || mimeForExtension(extension);

    await this.storage.put(objectKey, file.buffer, mime);

    let document: PrismaDocument;
    try {
      document = await this.prisma.document.create({
        data: {
          id: documentId,
          userId,
          title: dto.title.trim(),
          description: dto.description?.trim() || null,
          author: dto.author?.trim() || null,
          category: dto.category?.trim() || null,
          version: dto.version?.trim() || null,
          tags: splitTags(dto.tags),
          mime,
          size: file.size,
          checksum,
          bucket,
          objectKey,
          normalizedTextKey,
        },
      });
    } catch (error) {
      await this.storage.delete(objectKey);
      throw error;
    }

    try {
      await this.queue.enqueue(document.id);
    } catch {
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          status: 'ERROR',
          errorCode: 'QUEUE_UNAVAILABLE',
          errorMessage: 'No se pudo iniciar el procesamiento.',
        },
      });
      throw new AppError(
        'QUEUE_UNAVAILABLE',
        'No se pudo iniciar el procesamiento. Intenta de nuevo.',
        503,
        true,
      );
    }

    return toMetadata(document);
  }

  async createBatch(
    userId: string,
    files: Express.Multer.File[] | undefined,
    metadataJson: string | undefined,
  ): Promise<BatchUploadResponse> {
    const batchFiles = files ?? [];
    if (batchFiles.length === 0) {
      throw new AppError('EMPTY_FILE', 'No se recibió ningún archivo en el lote.', 422, false);
    }

    const maxFiles = this.config.getOrThrow<number>('limits.maxBatchFiles');
    if (batchFiles.length > maxFiles) {
      throw new AppError(
        'BATCH_TOO_LARGE',
        `El lote supera el máximo de ${maxFiles} archivos.`,
        413,
        false,
        { maxFiles },
      );
    }

    const totalBytes = batchFiles.reduce((sum, file) => sum + file.size, 0);
    const maxTotalBytes = this.config.getOrThrow<number>('limits.maxBatchTotalBytes');
    if (totalBytes > maxTotalBytes) {
      throw new AppError(
        'BATCH_TOO_LARGE',
        `El lote supera el tamaño total permitido de ${Math.round(maxTotalBytes / 1024 / 1024)} MB.`,
        413,
        false,
        { maxTotalBytes },
      );
    }

    const metadata = parseBatchMetadata(metadataJson, batchFiles.length);
    const results: BatchUploadItemResult[] = [];

    for (let index = 0; index < batchFiles.length; index += 1) {
      const file = batchFiles[index];
      try {
        const dto = plainToInstance(CreateDocumentDto, metadata[index]);
        const validationErrors = await validate(dto, {
          whitelist: true,
          forbidNonWhitelisted: false,
        });
        if (validationErrors.length > 0) {
          throw new AppError(
            'INVALID_METADATA',
            'Revisa los metadatos obligatorios del archivo.',
            422,
            false,
            { index },
          );
        }

        const document = await this.create(userId, file, dto);
        results.push({
          index,
          filename: file.originalname,
          status: 'accepted',
          document,
        });
      } catch (error) {
        const appError =
          error instanceof AppError
            ? error
            : new AppError('INTERNAL_ERROR', 'No se pudo procesar el archivo.', 500, false);

        results.push({
          index,
          filename: file.originalname,
          status: 'failed',
          error: {
            code: appError.code,
            message: appError.message,
            retryable: appError.retryable,
          },
        });
      }
    }

    const accepted = results.filter((result) => result.status === 'accepted').length;
    return {
      total: batchFiles.length,
      accepted,
      failed: batchFiles.length - accepted,
      results,
    };
  }

  async findOne(userId: string, id: string) {
    const document = await this.findOwned(userId, id);
    let normalizedText: string | undefined;

    if (document.normalizedTextKey) {
      try {
        const object = await this.storage.get(document.normalizedTextKey);
        normalizedText = await streamToString(object.body);
      } catch {
        normalizedText = undefined;
      }
    }

    return { ...toMetadata(document), normalizedText };
  }

  async getContent(userId: string, id: string, range?: string): Promise<StoredObject & { mime: string }> {
    const document = await this.findOwned(userId, id);
    const object = await this.storage.get(document.objectKey, range);
    return { ...object, mime: document.mime };
  }

  async retry(userId: string, id: string): Promise<DocumentMetadata> {
    const document = await this.findOwned(userId, id);
    if (document.status !== 'ERROR') {
      throw new AppError('INVALID_STATE', 'Solo se pueden reintentar documentos en error.', 409, false);
    }

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: {
        status: 'RECEIVED',
        errorCode: null,
        errorMessage: null,
      },
    });

    await this.queue.enqueue(document.id, `${document.id}:${Date.now()}`);
    return toMetadata(updated);
  }

  private async findOwned(userId: string, id: string): Promise<PrismaDocument> {
    const document = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!document) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'El documento no existe o no tienes acceso.', 404, false);
    }
    return document;
  }
}

function parseBatchMetadata(
  metadataJson: string | undefined,
  fileCount: number,
): Record<string, unknown>[] {
  if (!metadataJson) {
    throw new AppError(
      'INVALID_METADATA',
      'Falta el campo metadata con un arreglo de metadatos por archivo.',
      422,
      false,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(metadataJson.replace(/^\uFEFF/, ''));
  } catch {
    throw new AppError('INVALID_METADATA', 'El campo metadata no es un JSON válido.', 422, false);
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  if (items.length !== fileCount) {
    throw new AppError(
      'INVALID_METADATA',
      'La cantidad de metadatos debe coincidir con la cantidad de archivos.',
      422,
      false,
      { files: fileCount, metadata: items.length },
    );
  }

  return items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new AppError(
        'INVALID_METADATA',
        'Cada elemento de metadata debe ser un objeto.',
        422,
        false,
        { index },
      );
    }

    const record = { ...(item as Record<string, unknown>) };
    if (Array.isArray(record['tags'])) {
      record['tags'] = record['tags'].map((tag) => String(tag)).join(',');
    }
    return record;
  });
}

function splitTags(tags?: string): string[] {
  if (!tags) return [];
  return Array.from(
    new Set(
      tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ).slice(0, 20);
}

function mimeForExtension(extension: string): string {
  switch (extension) {
    case '.pdf':
      return 'application/pdf';
    case '.docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case '.md':
    case '.markdown':
      return 'text/markdown; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

export function toMetadata(document: PrismaDocument): DocumentMetadata {
  return {
    id: document.id,
    title: document.title,
    description: document.description,
    author: document.author,
    category: document.category,
    version: document.version,
    tags: document.tags,
    status: document.status as DocumentMetadata['status'],
    mime: document.mime,
    size: document.size,
    checksum: document.checksum,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    indexedAt: document.indexedAt?.toISOString() ?? null,
    errorCode: document.errorCode,
    errorMessage: document.errorMessage,
    contentUrl: `/api/documents/${document.id}/content`,
  };
}

export async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}
