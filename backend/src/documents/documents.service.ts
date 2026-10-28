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
import { validate, type ValidationError } from 'class-validator';
import { AppError } from '../common/app-error';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage, type StoredObject } from '../storage/storage.types';
import { CreateDocumentDto } from './documents.dto';

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.markdown', '.docx']);

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly outbox: OutboxService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async create(
    userId: string,
    file: Express.Multer.File | undefined,
    dto: CreateDocumentDto,
    idempotencyKey?: string,
  ): Promise<DocumentMetadata> {
    const key = idempotencyKey ? validateIdempotencyKey(idempotencyKey) : null;
    if (key) {
      const existing = await this.prisma.document.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
      });
      if (existing) return toMetadata(existing);
    }

    if (!file) {
      throw new AppError('FILE_REQUIRED', 'No se recibió ningún archivo.', 422, false);
    }
    if (!file.buffer?.length) {
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

    const originalFilename = validateFilename(file.originalname);
    const extension = extname(originalFilename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new AppError(
        'UNSUPPORTED_FILE_TYPE',
        'El formato no está admitido. Sube TXT, PDF, Markdown o DOCX.',
        415,
        false,
      );
    }

    this.validateContent(file.buffer, extension);

    const documentId = randomUUID();
    const bucket = this.config.getOrThrow<string>('r2.bucket');
    const objectKey = `documents/${userId}/${documentId}/original${extension}`;
    const normalizedTextKey = `documents/${userId}/${documentId}/normalized.txt`;
    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const mime = file.mimetype || mimeForExtension(extension);

    await this.storage.put(objectKey, file.buffer, mime);

    let document: PrismaDocument;
    try {
      document = await this.prisma.$transaction(async (tx) => {
        const created = await tx.document.create({
          data: {
            id: documentId,
            userId,
            title: dto.title.trim(),
            description: dto.description?.trim() || null,
            author: dto.author?.trim() || null,
            category: dto.category?.trim() || null,
            version: dto.version?.trim() || null,
            tags: splitTags(dto.tags),
            originalFilename,
            idempotencyKey: key,
            mime,
            size: file.size,
            checksum,
            bucket,
            objectKey,
            normalizedTextKey,
            status: 'PROCESSING',
          },
        });

        await tx.outboxEvent.create({ data: { documentId: created.id } });
        return created;
      });
    } catch (error) {
      await this.storage.delete(objectKey);

      // Dos cargas concurrentes con la misma Idempotency-Key: gana la primera.
      if (key && (error as { code?: string }).code === 'P2002') {
        const existing = await this.prisma.document.findUnique({
          where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
        });
        if (existing) return toMetadata(existing);
      }

      throw error;
    }

    // El outbox ya es durable. Si Redis está caído, el reconciliador lo publicará.
    try {
      await this.outbox.dispatchDocument(document.id);
    } catch {
      // El evento queda PENDING; no se bloquea la respuesta inicial.
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
      throw new AppError('FILE_REQUIRED', 'No se recibió ningún archivo en el lote.', 422, false);
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
          stopAtFirstError: true,
        });
        if (validationErrors.length > 0) {
          const messages = formatValidationErrors(validationErrors);
          throw new AppError(
            'INVALID_METADATA',
            messages.length
              ? messages.join(' ')
              : 'Revisa los metadatos obligatorios del archivo.',
            422,
            false,
            { index, fields: messages.join(' | ') },
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

    const updated = await this.prisma.$transaction(async (tx) => {
      const doc = await tx.document.update({
        where: { id: document.id },
        data: {
          status: 'PROCESSING',
          errorCode: null,
          errorMessage: null,
          indexedAt: null,
        },
      });
      await tx.outboxEvent.create({ data: { documentId: doc.id } });
      return doc;
    });

    try {
      await this.outbox.dispatchDocument(updated.id);
    } catch {
      // El reconciliador reintentará la publicación.
    }

    return toMetadata(updated);
  }

  private async findOwned(userId: string, id: string): Promise<PrismaDocument> {
    const document = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!document) {
      throw new AppError('DOCUMENT_NOT_FOUND', 'El documento no existe o no tienes acceso.', 404, false);
    }
    return document;
  }

  private validateContent(buffer: Buffer, extension: string): void {
    if (extension === '.pdf' && buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new AppError('FILE_CORRUPTED', 'El PDF está dañado o no se puede leer.', 422, false);
    }

    if (extension === '.docx' && buffer.subarray(0, 2).toString('latin1') !== 'PK') {
      throw new AppError('DOCX_CORRUPTED', 'El documento Word está dañado o no se puede leer.', 422, false);
    }

    if (['.txt', '.md', '.markdown'].includes(extension)) {
      const text = buffer.toString('utf8');
      if (text.includes('\uFFFD')) {
        throw new AppError(
          'UNSUPPORTED_ENCODING',
          'El archivo no está en UTF-8. Guarda el texto en UTF-8 y vuelve a intentarlo.',
          422,
          false,
        );
      }
      if (!text.trim()) {
        throw new AppError('EMPTY_FILE', 'El archivo está vacío.', 422, false);
      }
    }
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

const RESERVED_FILENAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim();
  if (key.length < 8 || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new AppError(
      'INVALID_IDEMPOTENCY_KEY',
      'El encabezado Idempotency-Key debe tener entre 8 y 128 caracteres seguros.',
      400,
      false,
    );
  }
  return key;
}

export function validateFilename(raw: string): string {
  const filename = (raw ?? '').normalize('NFC').trim();

  if (!filename) {
    throw new AppError('INVALID_FILENAME', 'El archivo no tiene un nombre válido.', 422, false);
  }

  if (filename.length > 200) {
    throw new AppError(
      'INVALID_FILENAME',
      'El nombre del archivo no puede superar 200 caracteres.',
      422,
      false,
    );
  }

  if (
    filename === '.' ||
    filename === '..' ||
    filename.includes('/') ||
    filename.includes('\\') ||
    /[\u0000-\u001F\u007F<>:"|?*\u202A-\u202E\u2066-\u2069]/.test(filename)
  ) {
    throw new AppError(
      'INVALID_FILENAME',
      'El nombre del archivo no es válido: no puede contener rutas ni caracteres especiales.',
      422,
      false,
    );
  }

  if (/[. ]$/.test(filename)) {
    throw new AppError(
      'INVALID_FILENAME',
      'El nombre del archivo no puede terminar en punto ni en espacio.',
      422,
      false,
    );
  }

  const basename = filename.split('.')[0].toUpperCase();
  if (RESERVED_FILENAMES.has(basename)) {
    throw new AppError(
      'INVALID_FILENAME',
      'El nombre del archivo está reservado por el sistema operativo.',
      422,
      false,
    );
  }

  return filename;
}

function formatValidationErrors(errors: ValidationError[]): string[] {
  return errors.flatMap((error) => {
    const own = error.constraints ? Object.values(error.constraints) : [];
    const children = error.children?.length ? formatValidationErrors(error.children) : [];
    return [...own, ...children];
  });
}

function splitTags(tags?: string): string[] {  if (!tags) return [];
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
    trackingId: document.id,
    title: document.title,
    description: document.description,
    author: document.author,
    category: document.category,
    version: document.version,
    tags: document.tags,
    originalFilename: document.originalFilename,
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
