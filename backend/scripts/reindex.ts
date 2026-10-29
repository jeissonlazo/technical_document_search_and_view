import { Client } from '@elastic/elasticsearch';
import {
  DOCUMENT_INDEX_PROPERTIES,
  DOCUMENT_INDEX_SETTINGS,
} from '../src/search/document-index.mapping';

type AliasMap = Record<string, unknown>;

/**
 * Reconstruye el índice de búsqueda con el mapeo actual y mueve el alias.
 *
 * `_reindex` copia `_source` a un índice nuevo, así que el motor vuelve a
 * analizar cada campo con los analizadores vigentes: es la única forma de
 * rellenar un subcampo recién añadido (como `title.prefix`), porque los
 * analizadores no se pueden añadir a un índice ya creado.
 *
 * Uso:
 *   tsx scripts/reindex.ts            → crea {alias}-{ELASTICSEARCH_INDEX_VERSION}
 *   tsx scripts/reindex.ts documents-v2 → crea el índice indicado
 */
async function main(): Promise<void> {
  const node = process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200';
  const alias = process.env.ELASTICSEARCH_INDEX ?? 'documents';
  const version = process.env.ELASTICSEARCH_INDEX_VERSION ?? 'v2';
  const apiKey = process.env.ELASTICSEARCH_API_KEY ?? '';

  const target = (process.argv[2] ?? '').trim() || `${alias}-${version}`;

  const client = new Client({
    node,
    ...(apiKey ? { auth: { apiKey } } : {}),
  });

  const currentIndex = await resolveCurrentIndex(client, alias, `${alias}-${version}`);

  if (currentIndex === target) {
    throw new Error(
      `El índice ${target} ya es el que sirve el alias ${alias}. ` +
        'Sube ELASTICSEARCH_INDEX_VERSION o pasa otro nombre para reindexar.',
    );
  }

  if (await client.indices.exists({ index: target })) {
    throw new Error(
      `El índice ${target} ya existe. Sube ELASTICSEARCH_INDEX_VERSION o pasa otro nombre.`,
    );
  }

  console.log(`Reindexando ${currentIndex ?? '(sin índice previo)'} → ${target}`);

  await client.indices.create({
    index: target,
    settings: DOCUMENT_INDEX_SETTINGS as never,
    mappings: { properties: DOCUMENT_INDEX_PROPERTIES as never },
  });

  let migrated = 0;
  if (currentIndex) {
    const result = await client.reindex({
      source: { index: currentIndex },
      dest: { index: target },
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
      wait_for_completion: true,
      refresh: true,
    });
    migrated = result.total ?? 0;

    if ((result.failures ?? []).length > 0) {
      throw new Error(
        `La reindexación dejó ${result.failures?.length} documentos fallidos. Se conserva el alias en ${currentIndex}.`,
      );
    }
  }

  const actions: Array<Record<string, unknown>> = [];
  if (currentIndex) {
    actions.push({ remove: { index: currentIndex, alias } });
  }
  actions.push({ add: { index: target, alias } });
  await client.indices.updateAliases({ actions });

  await client.indices.refresh({ index: target });

  const count = await client.count({ index: alias });
  const stats = await client.indices.stats({ index: alias, metric: ['store'] });
  const sizeBytes =
    (stats as { _all?: { total?: { store?: { size_in_bytes?: number } } } })._all?.total?.store
      ?.size_in_bytes ?? 0;

  console.log(
    `Reindexación completa: ${migrated} documentos copiados; indice ${target} ` +
      `con ${count.count} documentos y ${(sizeBytes / 1024 / 1024).toFixed(1)} MB; ` +
      `alias ${alias} → ${target}`,
  );
}

async function resolveCurrentIndex(
  client: Client,
  alias: string,
  fallback: string,
): Promise<string | null> {
  try {
    const aliases = (await client.indices.getAlias({ name: alias })) as AliasMap;
    const index = Object.keys(aliases)[0];
    if (index) return index;
  } catch (error) {
    const status = (error as { meta?: { statusCode?: number } }).meta?.statusCode;
    if (status !== 404) throw error;
  }

  if (await client.indices.exists({ index: fallback })) return fallback;
  return null;
}

main().catch((error) => {
  console.error('Reindexación fallida:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
