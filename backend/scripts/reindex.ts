import { Client } from '@elastic/elasticsearch';
import { DOCUMENT_INDEX_PROPERTIES } from '../src/search/document-index.mapping';

type AliasMap = Record<string, unknown>;

async function main(): Promise<void> {
  const node = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
  const alias = process.env.ELASTICSEARCH_INDEX ?? 'documents';
  const version = process.env.ELASTICSEARCH_INDEX_VERSION ?? 'v1';
  const apiKey = process.env.ELASTICSEARCH_API_KEY ?? '';

  const client = new Client({
    node,
    ...(apiKey ? { auth: { apiKey } } : {}),
  });

  let currentIndex: string | undefined;
  let aliasExists = false;

  try {
    const aliases = (await client.indices.getAlias({ name: alias })) as AliasMap;
    currentIndex = Object.keys(aliases)[0];
    aliasExists = true;
  } catch (error) {
    const status = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (status !== 404) throw error;
  }

  if (!currentIndex) {
    const fallback = `${alias}-${version}`;
    if (await client.indices.exists({ index: fallback })) {
      currentIndex = fallback;
    }
  }

  if (!currentIndex) {
    throw new Error(`No existe el alias ${alias} ni el índice ${alias}-${version}.`);
  }

  const nextIndex = `${alias}-${new Date().toISOString().replace(/[-:.TZ]/g, '')}`;
  console.log(`Reindexando ${currentIndex} → ${nextIndex}`);

  await client.indices.create({
    index: nextIndex,
    mappings: { properties: DOCUMENT_INDEX_PROPERTIES as never },
  });

  const result = await client.reindex({
    source: {
      index: currentIndex,
      script: {
        lang: 'painless',
        source: `
          String metadata = '';
          if (ctx._source.author != null) { metadata += ctx._source.author + ' '; }
          if (ctx._source.category != null) { metadata += ctx._source.category + ' '; }
          if (ctx._source.version != null) { metadata += ctx._source.version + ' '; }
          if (ctx._source.tags != null) {
            for (def tag : ctx._source.tags) { metadata += tag + ' '; }
          }
          ctx._source.metadata = metadata.trim();
        `,
      },
    },
    dest: { index: nextIndex },
    wait_for_completion: true,
    refresh: true,
  });

  const actions: Array<Record<string, unknown>> = [];
  if (aliasExists) {
    actions.push({ remove: { index: currentIndex, alias } });
  }
  actions.push({ add: { index: nextIndex, alias } });
  await client.indices.updateAliases({ actions });

  console.log(
    `Reindexación completa: ${result.total ?? 0} documentos; alias ${alias} → ${nextIndex}`,
  );
}

main().catch((error) => {
  console.error('Reindexación fallida:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
