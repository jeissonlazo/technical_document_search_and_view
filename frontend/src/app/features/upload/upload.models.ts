import type { DocumentStatus } from '@docs/shared';

export type QueueStatus = DocumentStatus | 'PENDING' | 'UPLOADING';

export interface QueueItem {
  file: File;
  status: QueueStatus;
  progress: number;
  idempotencyKey: string;
  documentId?: string;
  error?: string;
  metadata: FileMetadata;
}

export interface FileMetadata {
  title: string;
  author: string;
  categories: string[];
  version: string;
  tags: string;
  useShared: boolean;
}

export type QueueFilter = 'all' | 'error' | 'active' | 'missing';

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 20;

export type UploadAlertKind = 'uploaded' | 'processing' | 'indexed' | 'retry' | 'error';

export interface UploadAlert {
  id: number;
  kind: UploadAlertKind;
  title: string;
  message: string;
}
