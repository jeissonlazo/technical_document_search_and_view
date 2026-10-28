/**
 * Tipos compartidos entre backend y frontend.
 * Este paquete es solo de tipos: no existe implementación en runtime.
 */

export type DocumentStatus = 'RECEIVED' | 'PROCESSING' | 'INDEXED' | 'ERROR';

export interface AuthUser {
  id: string;
  email: string;
  createdAt: string;
}

export interface DocumentMetadata {
  id: string;
  title: string;
  description?: string | null;
  author?: string | null;
  category?: string | null;
  version?: string | null;
  tags: string[];
  originalFilename?: string | null;
  status: DocumentStatus;
  mime: string;
  size: number;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  indexedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  contentUrl: string;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface SearchFacets {
  categories: FacetBucket[];
  tags: FacetBucket[];
  authors: FacetBucket[];
}

export interface SearchHit {
  id: string;
  score: number | null;
  title: string;
  description?: string | null;
  author?: string | null;
  category?: string | null;
  version?: string | null;
  tags: string[];
  highlight: {
    content?: string[];
    title?: string[];
  };
}

export interface SearchResponse {
  total: number;
  page: number;
  pageSize: number;
  items: SearchHit[];
  facets: SearchFacets;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  retryable: boolean;
  params?: Record<string, string | number | boolean | null>;
  supportRef?: string;
}

export interface BatchUploadError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface BatchUploadItemResult {
  index: number;
  filename: string;
  status: 'accepted' | 'failed';
  document?: DocumentMetadata;
  error?: BatchUploadError;
}

export interface BatchUploadResponse {
  total: number;
  accepted: number;
  failed: number;
  results: BatchUploadItemResult[];
}

export interface DocumentStatusEvent {
  type: 'document.status';
  documentId: string;
  userId: string;
  status: DocumentStatus;
  stage?: string;
  errorCode?: string | null;
  message?: string | null;
  retryable?: boolean;
  attempt?: number;
  timestamp: string;
}
