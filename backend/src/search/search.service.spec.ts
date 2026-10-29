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
    const { should } = request.query.bool;
    expect(should).toHaveLength(2);
    expect(should[0].multi_match.fuzziness).toBe('AUTO');
    expect(should[1].multi_match.fields).toEqual([
      'title.prefix^3',
      'description.prefix^2',
      'content.prefix',
      'metadata.prefix^2',
    ]);
    expect(request.query.bool.minimum_should_match).toBe(1);
    expect(request.query.bool.must).toBeUndefined();
    expect(request.highlight.fields['content.prefix']).toEqual({
      fragment_size: 180,
      number_of_fragments: 3,
    });
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
    const { should } = request.query.bool;
    expect(should).toHaveLength(1);
    expect(should[0].multi_match.type).toBe('phrase');
    expect(should[0].multi_match.query).toBe('arquitectura hexagonal');
    expect(should[0].multi_match.fuzziness).toBeUndefined();
  });

  it('busca por prefijo desde el min_gram indexado', async () => {
    await service.search('user-1', { q: 'arq', page: 1, pageSize: 20 });
    expect(search.mock.calls[0][0].query.bool.should).toHaveLength(2);

    search.mockClear();
    await service.search('user-1', { q: 'ar', page: 1, pageSize: 20 });
    // Por debajo de 3 caracteres ningún prefijo está indexado.
    expect(search.mock.calls[0][0].query.bool.should).toHaveLength(1);
  });

  it('devuelve todos los documentos cuando la consulta está vacía', async () => {
    await service.search('user-1', { q: '   ', page: 1, pageSize: 20 });
    const request = search.mock.calls[0][0];
    expect(request.query.bool.should).toBeUndefined();
    expect(request.query.bool.must).toEqual([{ match_all: {} }]);
  });

  it('usa el resaltado del subcampo de prefijo cuando no hay coincidencia literal', async () => {
    search.mockResolvedValueOnce({
      hits: {
        total: { value: 1 },
        hits: [
          {
            _id: 'doc-2',
            _score: 1.5,
            _source: { title: 'Manual', status: 'INDEXED' },
            highlight: { 'content.prefix': ['<em>arquitectura</em> hexagonal'] },
          },
        ],
      },
      aggregations: {},
    });

    const result = await service.search('user-1', { q: 'arqui', page: 1, pageSize: 20 });

    expect(result.items[0].highlight.content).toEqual(['<em>arquitectura</em> hexagonal']);
    expect(result.items[0].highlight.title).toBeUndefined();
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
      { term: { categories: 'Arquitectura' } },
      { terms: { tags: ['ddd', 'api'] } },
      { term: { 'author.keyword': 'Ana' } },
    ]);
  });
});

describe('SearchService.ensureIndex', () => {
  const config = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'elasticsearchIndex') return 'documents';
      if (key === 'elasticsearchNode') return 'http://localhost:9200';
      return undefined;
    }),
    get: jest.fn((key: string) => (key === 'elasticsearchIndexVersion' ? 'v2' : undefined)),
  };

  function withIndices(mocks: Record<string, jest.Mock>) {
    const service = new SearchService(config as never);
    (service as unknown as { client: { indices: unknown } }).client.indices = mocks;
    return service;
  }

  it('crea el índice con los settings de prefijo cuando no hay alias', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = withIndices({
      existsAlias: jest.fn().mockResolvedValue(false),
      exists: jest.fn().mockResolvedValue(false),
      create,
      putAlias: jest.fn().mockResolvedValue({}),
    });

    await service.ensureIndex();

    const request = create.mock.calls[0][0];
    expect(request.index).toBe('documents-v2');
    expect(request.settings.analysis.analyzer.prefix_index.filter).toContain('prefix_edge_ngram');
    expect(request.mappings.properties.title.fields.prefix.analyzer).toBe('prefix_index');
  });

  it('actualiza el mapeo cuando el índice existente ya tiene prefijos', async () => {
    const putMapping = jest.fn().mockResolvedValue({});
    const service = withIndices({
      existsAlias: jest.fn().mockResolvedValue(true),
      getMapping: jest.fn().mockResolvedValue({
        'documents-v2': { mappings: { properties: { title: { fields: { prefix: {} } } } } },
      }),
      putMapping,
    });

    await service.ensureIndex();

    expect(putMapping).toHaveBeenCalled();
  });

  it('avisa sin fallar si el índice existente no tiene los campos de prefijo', async () => {
    const putMapping = jest.fn().mockResolvedValue({});
    const service = withIndices({
      existsAlias: jest.fn().mockResolvedValue(true),
      getMapping: jest.fn().mockResolvedValue({
        'documents-v1': { mappings: { properties: { title: { type: 'text' } } } },
      }),
      putMapping,
    });

    await expect(service.ensureIndex()).resolves.toBeUndefined();
    expect(putMapping).not.toHaveBeenCalled();
  });
});
