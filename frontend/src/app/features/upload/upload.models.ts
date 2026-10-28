import type { DocumentStatus } from '@docs/shared';

export type QueueStatus = DocumentStatus | 'PENDING' | 'UPLOADING';

export interface QueueItem {
  file: File;
  status: QueueStatus;
  progress: number;
  idempotencyKey: string;
  documentId?: string;
  error?: string;
}

export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 20;
