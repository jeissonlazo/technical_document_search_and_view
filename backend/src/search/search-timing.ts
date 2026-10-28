export interface SearchTiming {
  startedAt?: number;
  authMs?: number;
  elasticsearchMs?: number;
  databaseMs?: number;
  totalMs?: number;
  hits?: number;
}
