import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import type { Readable } from 'stream';
import type { Document as PrismaDocument } from '@prisma/client';
import type { DocumentMetadata } from '@docs/shared';
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
    status: document.status,
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
