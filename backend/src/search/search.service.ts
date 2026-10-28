import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import type { FacetBucket, SearchFacets, SearchHit, SearchResponse } from '@docs/shared';
import { AppError } from '../common/app-error';

export interface IndexableDocument {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  author?: string | null;
  category?: string | null;
  version?: string | null;
  tags: string[];
  createdAt: Date;
}

export interface SearchParams {
  q: string;
  page: number;
  pageSize: number;
  category?: string;
  tags?: string[];
  author?: string;
  sort?: 'relevance' | 'title' | 'date';
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Client;
  private readonly index: string;

  constructor(config: ConfigService) {
    this.index = config.getOrThrow<string>('elasticsearchIndex');
    const apiKey = config.get<string>('elasticsearchApiKey') ?? '';
    this.client = new Client({
      node: config.getOrThrow<string>('elasticsearchNode'),
      ...(apiKey ? { auth: { apiKey } } : {}),
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndex();
    } catch (error) {
      this.logger.warn(
        `Elasticsearch no está disponible al arrancar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async ensureIndex(): Promise<void> {
    const exists = await this.client.indices.exists({ index: this.index });
    if (exists) return;

    await this.client.indices.create({
      index: this.index,
      mappings: {
        properties: {
          title: {
            type: 'text',
            analyzer: 'spanish',
            fields: { keyword: { type: 'keyword', ignore_above: 512 } },
          },
          description: { type: 'text', analyzer: 'spanish' },
          content: { type: 'text', analyzer: 'spanish' },
          author: {
            type: 'text',
            analyzer: 'spanish',
            fields: { keyword: { type: 'keyword', ignore_above: 256 } },
          },
          category: { type: 'keyword' },
          version: { type: 'keyword' },
          tags: { type: 'keyword' },
          userId: { type: 'keyword' },
          status: { type: 'keyword' },
          createdAt: { type: 'date' },
        },
      },
    }).catch((error: unknown) => {
      const name = (error as { name?: string }).name;
      const message = error instanceof Error ? error.message : '';
      if (name === 'resource_already_exists_exception' || message.includes('resource_already_exists_exception')) {
        return;
      }
      throw error;
    });
  }

  async indexDocument(document: IndexableDocument, content: string): Promise<void> {
    try {
      await this.client.index({
        index: this.index,
        id: document.id,
        refresh: 'wait_for',
        document: {
          title: document.title,
          description: document.description ?? '',
          content,
          author: document.author ?? '',
          category: document.category ?? '',
          version: document.version ?? '',
          tags: document.tags,
          userId: document.userId,
          status: 'INDEXED',
          createdAt: document.createdAt.toISOString(),
        },
      });
    } catch (error) {
      throw toIndexingError(error);
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.client.delete({ index: this.index, id: documentId }, { ignore: [404] });
  }

  async search(userId: string, params: SearchParams): Promise<SearchResponse> {
    const page = Math.max(1, params.page);
    const pageSize = Math.min(100, Math.max(1, params.pageSize));
    const filters: any[] = [
      { term: { userId } },
      { term: { status: 'INDEXED' } },
    ];

    if (params.category) filters.push({ term: { category: params.category } });
    if (params.tags?.length) filters.push({ terms: { tags: params.tags } });
    if (params.author) filters.push({ term: { 'author.keyword': params.author } });

    const sort: any =
      params.sort === 'title'
        ? [{ 'title.keyword': { order: 'asc' } }]
        : params.sort === 'date'
          ? [{ createdAt: { order: 'desc' } }]
          : ['_score', { createdAt: 'desc' }];

    const response = await this.client.search({
      index: this.index,
      from: (page - 1) * pageSize,
      size: pageSize,
      track_total_hits: true,
      query: {
        bool: {
          must: params.q
            ? [
                {
                  multi_match: {
                    query: params.q,
                    fields: ['title^3', 'description^2', 'content'],
                    fuzziness: 'AUTO',
                  },
                },
              ]
            : [{ match_all: {} }],
          filter: filters,
        },
      },
      highlight: {
        pre_tags: ['<em>'],
        post_tags: ['</em>'],
        fields: {
          content: { fragment_size: 180, number_of_fragments: 3 },
          title: { number_of_fragments: 0 },
        },
      },
      aggs: {
        categories: { terms: { field: 'category', size: 20 } },
        tags: { terms: { field: 'tags', size: 30 } },
        authors: { terms: { field: 'author.keyword', size: 20 } },
      },
      sort,
    } as any);

    const hits = response.hits.hits.map((hit) => {
      const source = (hit._source ?? {}) as Record<string, unknown>;
      const highlight = (hit.highlight ?? {}) as Record<string, string[] | undefined>;
      return {
        id: hit._id ?? '',
        score: hit._score ?? null,
        title: String(source['title'] ?? ''),
        description: (source['description'] as string | null) ?? null,
        author: (source['author'] as string | null) ?? null,
        category: (source['category'] as string | null) ?? null,
        version: (source['version'] as string | null) ?? null,
        tags: Array.isArray(source['tags']) ? (source['tags'] as string[]) : [],
        highlight: {
          content: highlight['content'],
          title: highlight['title'],
        },
      } satisfies SearchHit;
    });

    const total =
      typeof response.hits.total === 'number'
        ? response.hits.total
        : (response.hits.total?.value ?? 0);

    const aggregations = (response.aggregations ?? {}) as Record<
      string,
      { buckets?: Array<{ key: string; doc_count: number }> }
    >;

    return {
      total,
      page,
      pageSize,
      items: hits,
      facets: {
        categories: toBuckets(aggregations['categories']),
        tags: toBuckets(aggregations['tags']),
        authors: toBuckets(aggregations['authors']),
      },
    };
  }

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }
}

function toBuckets(aggregation?: { buckets?: Array<{ key: string; doc_count: number }> }): FacetBucket[] {
  return (aggregation?.buckets ?? []).map((bucket) => ({
    value: bucket.key,
    count: bucket.doc_count,
  })) as SearchFacets['categories'];
}

function toIndexingError(error: unknown): AppError {
  const candidate = error as {
    meta?: { statusCode?: number };
    statusCode?: number;
  };
  const statusCode = candidate.meta?.statusCode ?? candidate.statusCode;

  if (statusCode && statusCode >= 400 && statusCode < 500) {
    return new AppError(
      'INDEXING_FAILED',
      'El motor de búsqueda rechazó el documento. Revisa su formato y contenido.',
      500,
      false,
    );
  }

  return new AppError(
    'SEARCH_ENGINE_UNAVAILABLE',
    'El motor de búsqueda no está disponible temporalmente. El sistema volverá a intentarlo.',
    503,
    true,
  );
}
