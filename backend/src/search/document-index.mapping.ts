export const DOCUMENT_INDEX_PROPERTIES = {
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
  metadata: { type: 'text', analyzer: 'spanish' },
  category: { type: 'keyword' },
  version: { type: 'keyword' },
  tags: { type: 'keyword' },
  userId: { type: 'keyword' },
  status: { type: 'keyword' },
  createdAt: { type: 'date' },
} as const;
