import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import type { FacetBucket, SearchFacets, SearchHit, SearchResponse } from '@docs/shared';
import { AppError } from '../common/app-error';
import { DOCUMENT_INDEX_PROPERTIES } from './document-index.mapping';
import type { SearchTiming } from './search-timing';

export interface IndexableDocument {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  author?: string | null;
  category?: string | null;
  version?: string | null;
  tags: string[];
  mime: string;
  size: number;
  originalFilename?: string | null;
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
  private readonly indexVersion: string;

  constructor(config: ConfigService) {
    this.index = config.getOrThrow<string>('elasticsearchIndex');
    this.indexVersion = config.get<string>('elasticsearchIndexVersion') ?? 'v1';
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
    const aliasExists = await this.client.indices.existsAlias({ name: this.index });
    if (aliasExists) {
      await this.client.indices.putMapping({
        index: this.index,
        properties: DOCUMENT_INDEX_PROPERTIES as never,
      });
      return;
    }

    const concreteIndex = `${this.index}-${this.indexVersion}`;
    const concreteExists = await this.client.indices.exists({ index: concreteIndex });
    if (!concreteExists) {
      await this.client.indices
        .create({
          index: concreteIndex,
          mappings: { properties: DOCUMENT_INDEX_PROPERTIES as never },
        })
        .catch((error: unknown) => {
          const name = (error as { name?: string }).name;
          const message = error instanceof Error ? error.message : '';
          if (
            name === 'resource_already_exists_exception' ||
            message.includes('resource_already_exists_exception')
          ) {
            return;
          }
          throw error;
        });
    }

    await this.client.indices.putAlias({ index: concreteIndex, name: this.index });
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
          metadata: [document.author, document.category, document.version, ...document.tags]
            .filter((value): value is string => Boolean(value))
            .join(' '),
          mime: document.mime,
          size: document.size,
          originalFilename: document.originalFilename ?? '',
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

  async search(
    userId: string,
    params: SearchParams,
    timing: SearchTiming = {},
  ): Promise<SearchResponse> {
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

    const phrase = extractQuotedPhrase(params.q);
    const textQuery = phrase
      ? {
          multi_match: {
            query: phrase,
            type: 'phrase',
            slop: 0,
            fields: ['title^3', 'description^2', 'content', 'metadata^2'],
          },
        }
      : {
          multi_match: {
            query: params.q,
            fields: ['title^3', 'description^2', 'content', 'metadata^2'],
            fuzziness: 'AUTO',
          },
        };

    const elasticsearchStartedAt = performance.now();
    const response = await this.client.search({
      index: this.index,
      from: (page - 1) * pageSize,
      size: pageSize,
      track_total_hits: true,
      query: {
        bool: {
          must: params.q ? [textQuery] : [{ match_all: {} }],
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
    } as any).finally(() => {
      timing.elasticsearchMs = performance.now() - elasticsearchStartedAt;
    });

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
        mime: (source['mime'] as string | undefined) ?? undefined,
        size: typeof source['size'] === 'number' ? (source['size'] as number) : undefined,
        createdAt: (source['createdAt'] as string | undefined) ?? null,
        originalFilename: (source['originalFilename'] as string | null | undefined) ?? null,
        status: (source['status'] as SearchHit['status'] | undefined) ?? undefined,
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

/**
 * Reconoce una frase entre comillas para usar `match_phrase`.
 * Si no hay comillas, se mantiene la búsqueda por términos con fuzziness.
 */
function extractQuotedPhrase(query: string): string | null {
  const match = query.trim().match(/"([^"]+)"|“([^”]+)”/);
  return (match?.[1] ?? match?.[2] ?? '').trim() || null;
}
