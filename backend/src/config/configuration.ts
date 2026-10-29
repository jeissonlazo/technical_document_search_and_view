export default () => {
  const accountId = process.env.R2_ACCOUNT_ID ?? '';
  const endpoint =
    process.env.R2_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    frontendOrigin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:4200',
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL ?? '',
    redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
    elasticsearchNode: process.env.ELASTICSEARCH_NODE ?? 'http://localhost:9200',
    elasticsearchIndex: process.env.ELASTICSEARCH_INDEX ?? 'documents',
    elasticsearchIndexVersion: process.env.ELASTICSEARCH_INDEX_VERSION ?? 'v2',
    elasticsearchApiKey: process.env.ELASTICSEARCH_API_KEY ?? '',
    sessionSecret: process.env.SESSION_SECRET ?? 'dev-only-change-me-please',
    sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 604800),
    authUserCacheTtlSeconds: Number(process.env.AUTH_USER_CACHE_TTL_SECONDS ?? 30),
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
      maxBatchTotalBytes: Number(process.env.MAX_BATCH_TOTAL_MB ?? 100) * 1024 * 1024,
    },
    workerConcurrency: Number(process.env.WORKER_CONCURRENCY ?? 2),
    outbox: {
      reconcileIntervalMs: Number(process.env.OUTBOX_RECONCILE_INTERVAL_MS ?? 15_000),
      stuckAfterMs: Number(process.env.OUTBOX_STUCK_AFTER_MS ?? 120_000),
      maxAttempts: Number(process.env.OUTBOX_MAX_ATTEMPTS ?? 10),
    },
    processing: {
      maxTextChars: Number(process.env.MAX_TEXT_CHARS ?? 2_000_000),
      timeoutMs: Number(process.env.PROCESSING_TIMEOUT_MS ?? 60_000),
    },
    queue: {
      operationTimeoutMs: Number(process.env.QUEUE_OPERATION_TIMEOUT_MS ?? 2_000),
    },
  };
};
