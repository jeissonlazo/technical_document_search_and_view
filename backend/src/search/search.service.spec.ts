jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => ({
    search: jest.fn(),
    indices: {},
  })),
}));

import { SearchService } from './search.service';

describe('SearchService', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'elasticsearchIndex') return 'documents';
      if (key === 'elasticsearchNode') return 'http://localhost:9200';
      return undefined;
    }),
    get: jest.fn(() => undefined),
  };

  let service: SearchService;
  let search: jest.Mock;

  beforeEach(() => {
    service = new SearchService(config as never);
    search = (service as unknown as { client: { search: jest.Mock } }).client.search;
    search.mockResolvedValue({
      hits: {
        total: { value: 2 },
        hits: [
          {
            _id: 'doc-1',
            _score: 4.2,
            _source: {
              title: 'Manual de arquitectura',
              description: 'Guía',
              author: 'Ana',
              category: 'Arquitectura',
              version: '1.0',
              tags: ['ddd'],
              mime: 'text/markdown',
              size: 120,
              createdAt: '2026-10-28T00:00:00.000Z',
              originalFilename: 'manual.md',
              status: 'INDEXED',
            },
            highlight: {
              content: ['<em>arquitectura</em> hexagonal'],
              title: ['Manual de <em>arquitectura</em>'],
            },
          },
        ],
      },
      aggregations: {
        categories: { buckets: [{ key: 'Arquitectura', doc_count: 1 }] },
        tags: { buckets: [{ key: 'ddd', doc_count: 1 }] },
        authors: { buckets: [{ key: 'Ana', doc_count: 1 }] },
      },
    });
  });

  it('pagina y mapea metadatos, highlight y facetas', async () => {
    const result = await service.search('user-1', {
      q: 'arquitectura',
      page: 2,
      pageSize: 10,
    });

    const request = search.mock.calls[0][0];
    expect(request.from).toBe(10);
    expect(request.size).toBe(10);
    expect(request.query.bool.filter).toEqual([
      { term: { userId: 'user-1' } },
      { term: { status: 'INDEXED' } },
    ]);
    expect(request.query.bool.must[0].multi_match.fuzziness).toBe('AUTO');
    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({
      id: 'doc-1',
      mime: 'text/markdown',
      size: 120,
      originalFilename: 'manual.md',
      status: 'INDEXED',
      highlight: {
        content: ['<em>arquitectura</em> hexagonal'],
        title: ['Manual de <em>arquitectura</em>'],
      },
    });
    expect(result.facets.categories).toEqual([{ value: 'Arquitectura', count: 1 }]);
  });

  it('usa match_phrase para una frase entre comillas', async () => {
    await service.search('user-1', {
      q: '"arquitectura hexagonal"',
      page: 1,
      pageSize: 20,
    });

    const request = search.mock.calls[0][0];
    const textQuery = request.query.bool.must[0].multi_match;
    expect(textQuery.type).toBe('phrase');
    expect(textQuery.query).toBe('arquitectura hexagonal');
    expect(textQuery.fuzziness).toBeUndefined();
  });

  it('aplica filtros de categoría, autor y etiquetas', async () => {
    await service.search('user-1', {
      q: 'manual',
      page: 1,
      pageSize: 20,
      category: 'Arquitectura',
      author: 'Ana',
      tags: ['ddd', 'api'],
    });

    const filters = search.mock.calls[0][0].query.bool.filter;
    expect(filters).toEqual([
      { term: { userId: 'user-1' } },
      { term: { status: 'INDEXED' } },
      { term: { category: 'Arquitectura' } },
      { terms: { tags: ['ddd', 'api'] } },
      { term: { 'author.keyword': 'Ana' } },
    ]);
  });
});
