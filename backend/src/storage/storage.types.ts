import type { Readable } from 'stream';

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface StoredObject {
  body: Readable;
  contentType?: string;
  contentLength?: number;
  contentRange?: string;
  acceptRanges?: string;
  etag?: string;
}

export interface ObjectStorage {
  put(key: string, body: Buffer | Uint8Array, contentType: string): Promise<void>;
  get(key: string, range?: string): Promise<StoredObject>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, contentType?: string, expiresInSeconds?: number): Promise<string>;
  health(): Promise<boolean>;
}
