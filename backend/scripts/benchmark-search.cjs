const { writeFileSync } = require('node:fs');

const base = process.env.API_BASE_URL ?? process.env.E2E_BASE_URL ?? 'http://localhost:4200';
const email = process.env.SEED_USER_EMAIL ?? 'demo@example.com';
const password = process.env.SEED_USER_PASSWORD ?? 'ChangeMe123!';
const runs = Number(process.env.BENCH_RUNS ?? 5);
const delayMs = Number(process.env.BENCH_DELAY_MS ?? 1000);
const queries = (process.env.BENCH_QUERIES ?? 'arquitectura,manual,redes,pdf,datos,markdown')
  .split(',')
  .map((query) => query.trim())
  .filter(Boolean);

async function login() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Login falló (${response.status}): ${body.message ?? ''}`);

  const cookies = response.headers.getSetCookie?.() ?? [];
  const session = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  if (!session) throw new Error('No se recibió cookie de sesión');
  return session;
}

function parseServerTiming(header) {
  const timings = {};
  if (!header) return timings;
  for (const part of header.split(',')) {
    const [name, ...params] = part.trim().split(';');
    const duration = params.find((param) => param.trim().startsWith('dur='));
    if (duration) timings[name.trim()] = Number(duration.trim().slice(4));
  }
  return timings;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = ((sorted.length - 1) * p) / 100;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

async function measure(session, query) {
  const url = `${base}/api/search?q=${encodeURIComponent(query)}&page=1&pageSize=20`;
  const started = performance.now();
  const response = await fetch(url, { headers: { cookie: session } });
  const body = await response.json();
  const clientMs = performance.now() - started;
  if (!response.ok) {
    throw new Error(`Search ${query} falló (${response.status}): ${body.message ?? ''}`);
  }
  const timing = parseServerTiming(response.headers.get('server-timing'));
  return {
    query,
    clientMs,
    authMs: timing.auth ?? null,
    elasticsearchMs: timing.elasticsearch ?? null,
    postgresMs: timing.postgres ?? null,
    serverTotalMs: timing.total ?? null,
    hits: body.items?.length ?? 0,
    total: body.total ?? 0,
  };
}

async function main() {
  const session = await login();
  const samples = [];

  for (const query of queries) {
    // Calentamiento: no se contabiliza.
    await measure(session, query);
    await measure(session, query);

    for (let run = 0; run < runs; run += 1) {
      samples.push(await measure(session, query));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const metrics = ['clientMs', 'authMs', 'elasticsearchMs', 'postgresMs', 'serverTotalMs'];
  const summary = {};
  for (const metric of metrics) {
    const values = samples.map((sample) => sample[metric]).filter((value) => value !== null);
    summary[metric] = {
      p50: percentile(values, 50),
      p95: percentile(values, 95),
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    base,
    queries,
    runsPerQuery: runs,
    samples: samples.length,
    summary,
  };

  console.log(JSON.stringify(report, null, 2));
  writeFileSync('search-benchmark.json', JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Benchmark falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
