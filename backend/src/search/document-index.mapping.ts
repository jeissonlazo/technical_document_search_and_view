/**
 * Ajustes de análisis del índice de documentos.
 *
 * A los campos de texto se les añade un subcampo `prefix` con un analizador
 * propio, porque el analizador `spanish` no sirve para buscar por prefijo:
 * reduce `arquitectura` a la raíz `arquitectur`, así que `arqui` solo podría
 * coincidir por distancia de edición (y no lo hace: está a 6 ediciones).
 *
 * - `prefix_index` indexa los prefijos de cada término con `edge_ngram` 3..20.
 * - `prefix_search` analiza la consulta sin n-gramas, de modo que lo tecleado
 *   (`arqui`) se compara literalmente contra los prefijos indexados.
 *
 * El stemmer se omite en ambos: un prefijo no depende de la raíz de la palabra.
 * Las stop words sí se filtran, para que consultas como `la de` no arrastren
 * coincidencias por prefijos vacíos.
 */
export const DOCUMENT_INDEX_SETTINGS = {
  analysis: {
    filter: {
      prefix_stopwords: { type: 'stop', stopwords: '_spanish_' },
      prefix_edge_ngram: { type: 'edge_ngram', min_gram: 3, max_gram: 20 },
    },
    analyzer: {
      prefix_index: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'prefix_stopwords', 'prefix_edge_ngram'],
      },
      prefix_search: {
        type: 'custom',
        tokenizer: 'standard',
        filter: ['lowercase', 'prefix_stopwords'],
      },
    },
  },
} as const;

/** Subcampo de prefijo que acompaña a cada campo de texto. */
const prefixField = {
  type: 'text',
  analyzer: 'prefix_index',
  search_analyzer: 'prefix_search',
} as const;

export const DOCUMENT_INDEX_PROPERTIES = {
  title: {
    type: 'text',
    analyzer: 'spanish',
    fields: {
      keyword: { type: 'keyword', ignore_above: 512 },
      prefix: prefixField,
    },
  },
  description: {
    type: 'text',
    analyzer: 'spanish',
    fields: { prefix: prefixField },
  },
  content: {
    type: 'text',
    analyzer: 'spanish',
    fields: { prefix: prefixField },
  },
  author: {
    type: 'text',
    analyzer: 'spanish',
    fields: { keyword: { type: 'keyword', ignore_above: 256 } },
  },
  metadata: {
    type: 'text',
    analyzer: 'spanish',
    fields: { prefix: prefixField },
  },
  mime: { type: 'keyword' },
  size: { type: 'long' },
  originalFilename: {
    type: 'text',
    analyzer: 'spanish',
    fields: { keyword: { type: 'keyword', ignore_above: 512 } },
  },
  category: { type: 'keyword' },
  categories: { type: 'keyword' },
  version: { type: 'keyword' },
  tags: { type: 'keyword' },
  userId: { type: 'keyword' },
  status: { type: 'keyword' },
  createdAt: { type: 'date' },
} as const;

/** Campos que resuelven la búsqueda por término y por aproximación. */
export const TEXT_SEARCH_FIELDS = [
  'title^3',
  'description^2',
  'content',
  'metadata^2',
] as const;

/**
 * Campos que resuelven la búsqueda por prefijo. Los pesos replican los de
 * `TEXT_SEARCH_FIELDS` para que el orden por relevancia se mantenga.
 */
export const PREFIX_SEARCH_FIELDS = [
  'title.prefix^3',
  'description.prefix^2',
  'content.prefix',
  'metadata.prefix^2',
] as const;

/** Longitud mínima de prefijo indexada (min_gram de edge_ngram). */
export const PREFIX_MIN_LENGTH = 3;
