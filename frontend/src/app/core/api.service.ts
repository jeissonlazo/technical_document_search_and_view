import {
  HttpClient,
  HttpEventType,
  HttpParams,
  HttpResponse,
} from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { filter, firstValueFrom, map, tap } from 'rxjs';
import type {
  DocumentMetadata,
  DocumentStatus,
  SearchResponse,
} from '@docs/shared';

export interface DocumentDetail extends DocumentMetadata {
  normalizedText?: string;
}

export interface UploadMetadata {
  title: string;
  description?: string;
  author?: string;
  category?: string;
  categories?: string[];
  version?: string;
  tags?: string;
}

export interface SearchParams {
  q: string;
  page?: number;
  pageSize?: number;
  category?: string;
  author?: string;
  tags?: string[];
  sort?: 'relevance' | 'title' | 'date';
}

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  async uploadDocument(
    file: File,
    metadata: UploadMetadata,
    onProgress?: (percent: number) => void,
    idempotencyKey?: string,
  ): Promise<DocumentMetadata> {
    const form = new FormData();
    form.append('file', file, file.name);

    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null && value !== '') {
        if (key === 'categories' && Array.isArray(value)) {
          if (value.length) form.append(key, JSON.stringify(value));
          continue;
        }
        form.append(key, String(value));
      }
    }

    return firstValueFrom(
      this.http
        .post<DocumentMetadata>('/api/documents', form, {
          reportProgress: true,
          observe: 'events',
          headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined,
        })
        .pipe(
          tap((event) => {
            if (event.type === HttpEventType.UploadProgress && event.total) {
              onProgress?.(Math.round((event.loaded / event.total) * 100));
            }
          }),
          filter((event): event is HttpResponse<DocumentMetadata> => event instanceof HttpResponse),
          map((response) => response.body as DocumentMetadata),
        ),
    );
  }

  getDocument(id: string): Promise<DocumentDetail> {
    return firstValueFrom(this.http.get<DocumentDetail>(`/api/documents/${id}`));
  }

  retryDocument(id: string): Promise<DocumentMetadata> {
    return firstValueFrom(this.http.post<DocumentMetadata>(`/api/documents/${id}/retry`, {}));
  }

  search(params: SearchParams): Promise<SearchResponse> {
    let httpParams = new HttpParams()
      .set('q', params.q)
      .set('page', String(params.page ?? 1))
      .set('pageSize', String(params.pageSize ?? 20));

    if (params.category) httpParams = httpParams.set('category', params.category);
    if (params.author) httpParams = httpParams.set('author', params.author);
    if (params.tags?.length) httpParams = httpParams.set('tags', params.tags.join(','));
    if (params.sort) httpParams = httpParams.set('sort', params.sort);

    return firstValueFrom(this.http.get<SearchResponse>('/api/search', { params: httpParams }));
  }

  contentUrl(id: string): string {
    return `/api/documents/${id}/content`;
  }

  getText(id: string): Promise<string> {
    return firstValueFrom(
      this.http.get(this.contentUrl(id), { responseType: 'text' }),
    );
  }

  getArrayBuffer(id: string): Promise<ArrayBuffer> {
    return firstValueFrom(
      this.http.get(this.contentUrl(id), { responseType: 'arraybuffer' }),
    );
  }

  createApiKey(name: string): Promise<{ key: string; apiKey: ApiKeyRecord }> {
    return firstValueFrom(this.http.post<{ key: string; apiKey: ApiKeyRecord }>('/api/api-keys', { name }));
  }

  listApiKeys(): Promise<ApiKeyRecord[]> {
    return firstValueFrom(this.http.get<ApiKeyRecord[]>('/api/api-keys'));
  }

  revokeApiKey(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`/api/api-keys/${id}`));
  }

  statusLabelKey(status: DocumentStatus): string {
    return `status.${status}`;
  }
}
