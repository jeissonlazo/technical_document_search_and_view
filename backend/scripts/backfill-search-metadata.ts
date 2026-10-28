import { Client } from '@elastic/elasticsearch';
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const client = new Client({
    node: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    ...(process.env.ELASTICSEARCH_API_KEY
      ? { auth: { apiKey: process.env.ELASTICSEARCH_API_KEY } }
      : {}),
  });
  const index = process.env.ELASTICSEARCH_INDEX ?? 'documents';

  const documents = await prisma.document.findMany({
    where: { status: 'INDEXED' },
    select: {
      id: true,
      mime: true,
      size: true,
      originalFilename: true,
      category: true,
      categories: true,
    },
  });

  const operations = documents.flatMap((document) => [
    { update: { _index: index, _id: document.id } },
    {
      doc: {
        mime: document.mime,
        size: document.size,
        originalFilename: document.originalFilename ?? '',
        category: document.category ?? '',
        categories: document.categories,
      },
    },
  ]);

  if (operations.length > 0) {
    await client.bulk({ operations: operations as never, refresh: true });
  }

  console.log(`Metadatos de búsqueda actualizados: ${documents.length} documentos`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Backfill falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
