import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  FRONTEND_ORIGIN: z.string().default('http://localhost:4200'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  DIRECT_URL: z.string().optional().default(''),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  ELASTICSEARCH_NODE: z.string().default('http://localhost:9200'),
  ELASTICSEARCH_INDEX: z.string().default('documents'),
  ELASTICSEARCH_INDEX_VERSION: z.string().default('v1'),
  ELASTICSEARCH_API_KEY: z.string().optional().default(''),
  SESSION_SECRET: z.string().min(16).default('dev-only-change-me-please'),
  SESSION_TTL_SECONDS: z.coerce.number().default(604800),
  AUTH_USER_CACHE_TTL_SECONDS: z.coerce.number().default(30),
  R2_ACCOUNT_ID: z.string().optional().default(''),
  R2_ACCESS_KEY_ID: z.string().optional().default(''),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(''),
  R2_BUCKET: z.string().default('technical-documents'),
  R2_ENDPOINT: z.string().optional().default(''),
  R2_REGION: z.string().default('auto'),
  R2_SIGNED_URL_TTL_SECONDS: z.coerce.number().default(300),
  MAX_FILE_SIZE_MB: z.coerce.number().default(25),
  MAX_BATCH_FILES: z.coerce.number().default(20),
  MAX_BATCH_TOTAL_MB: z.coerce.number().default(100),
  WORKER_CONCURRENCY: z.coerce.number().default(2),
  OUTBOX_RECONCILE_INTERVAL_MS: z.coerce.number().default(15_000),
  OUTBOX_STUCK_AFTER_MS: z.coerce.number().default(120_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().default(10),
  MAX_TEXT_CHARS: z.coerce.number().default(2_000_000),
  PROCESSING_TIMEOUT_MS: z.coerce.number().default(60_000),
  QUEUE_OPERATION_TIMEOUT_MS: z.coerce.number().default(2_000),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(`Configuración inválida: ${parsed.error.message}`);
  }
  return { ...config, ...parsed.data };
}
