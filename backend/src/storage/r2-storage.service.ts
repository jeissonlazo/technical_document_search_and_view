import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';
import { AppError } from '../common/app-error';
import type { ObjectStorage, StoredObject } from './storage.types';

@Injectable()
export class R2StorageService implements ObjectStorage {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    const r2 = config.getOrThrow<{
      accountId: string;
      accessKeyId: string;
      secretAccessKey: string;
      bucket: string;
      endpoint: string;
      region: string;
      forcePathStyle: boolean;
      signedUrlTtlSeconds: number;
    }>('r2');

    this.bucket = r2.bucket;
    this.endpoint = r2.endpoint;
    this.signedUrlTtlSeconds = r2.signedUrlTtlSeconds;
    this.configured = Boolean(r2.endpoint && r2.accessKeyId && r2.secretAccessKey);

    this.client = new S3Client({
      region: r2.region,
      endpoint: r2.endpoint || undefined,
      forcePathStyle: r2.forcePathStyle,
      credentials:
        r2.accessKeyId && r2.secretAccessKey
          ? { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey }
          : undefined,
    });
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new AppError(
        'STORAGE_UNAVAILABLE',
        'El almacenamiento R2 no está configurado.',
        503,
        true,
      );
    }
  }

  async put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void> {
    this.assertConfigured();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      this.logger.error(`No se pudo subir ${key} a R2`, error instanceof Error ? error.stack : String(error));
      throw new AppError('STORAGE_UNAVAILABLE', 'No se pudo guardar el archivo en R2.', 503, true);
    }
  }

  async get(key: string, range?: string): Promise<StoredObject> {
    this.assertConfigured();
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: range,
        }),
      );

      if (!result.Body) {
        throw new AppError('STORAGE_OBJECT_NOT_FOUND', 'El objeto no existe en R2.', 404, false);
      }

      return {
        body: result.Body as Readable,
        contentType: result.ContentType,
        contentLength: result.ContentLength,
        contentRange: result.ContentRange,
        acceptRanges: result.AcceptRanges,
        etag: result.ETag,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (isNotFound(error)) {
        throw new AppError('STORAGE_OBJECT_NOT_FOUND', 'El objeto no existe en R2.', 404, false);
      }
      this.logger.error(`No se pudo leer ${key} de R2`, error instanceof Error ? error.stack : String(error));
      throw new AppError('STORAGE_UNAVAILABLE', 'No se pudo leer el archivo desde R2.', 503, true);
    }
  }

  async delete(key: string): Promise<void> {
    this.assertConfigured();
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.warn(`No se pudo borrar ${key} de R2: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getSignedUrl(key: string, contentType?: string, expiresInSeconds?: number): Promise<string> {
    this.assertConfigured();
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: expiresInSeconds ?? this.signedUrlTtlSeconds },
    );
  }

  async health(): Promise<boolean> {
    if (!this.configured) return false;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return true;
    } catch {
      return false;
    }
  }
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
}
