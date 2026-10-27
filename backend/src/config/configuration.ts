export default () => {
  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const endpoint =
    process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200',
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    elasticsearchNode: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    elasticsearchIndex: process.env.ELASTICSEARCH_INDEX ?? 'documents-v1',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-change-me-please',
    sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 604800),
    r2: {
      accountId,
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      bucket: process.env.R2_BUCKET ?? 'technical-documents',
      endpoint,
      region: process.env.R2_REGION ?? 'auto',
      forcePathStyle: process.env.R2_FORCE_PATH_STYLE !== 'false',
      signedUrlTtlSeconds: Number(process.env.R2_SIGNED_URL_TTL_SECONDS ?? 300),
    },
    limits: {
      maxFileSizeBytes: Number(process.env.MAX_FILE_SIZE_MB ?? 25) * 1024 * 1024,
      maxBatchFiles: Number(process.env.MAX_BATCH_FILES ?? 20),
    },
    workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
  };
};
