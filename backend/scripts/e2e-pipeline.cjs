const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

const base = process.env.E2E_BASE_URL ?? 'http://localhost:4200';
const email = process.env.SEED_USER_EMAIL ?? 'demo@example.com';
const password = process.env.SEED_USER_PASSWORD ?? 'ChangeMe123!';

async function login() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Login falló (${response.status}): ${body.message ?? 'sin detalle'}`);
  }

  const cookies = response.headers.getSetCookie?.() ?? [];
  const session = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
  assert.ok(session, 'No se recibió cookie de sesión');
  assert.ok(body.csrfToken, 'No se recibió csrfToken');
  return { session, csrfToken: body.csrfToken };
}

function uploadForm(token) {
  const form = new FormData();
  form.append(
    'file',
    new Blob(
      [
        `Documento E2E ${token}\n\n` +
          'Token único para validar extracción, persistencia, cola, indexación y búsqueda.\n',
      ],
      { type: 'text/plain' },
    ),
    `e2e-${token}.txt`,
  );
  form.append('title', `E2E pipeline ${token}`);
  form.append('author', 'E2E');
  form.append('category', 'Integración');
  form.append('tags', 'e2e,pipeline');
  form.append('version', '1.0');
  return form;
}

async function upload(session, csrfToken, token, idempotencyKey) {
  const response = await fetch(`${base}/api/documents`, {
    method: 'POST',
    headers: {
      cookie: session,
      'X-CSRF-Token': csrfToken,
      'Idempotency-Key': idempotencyKey,
    },
    body: uploadForm(token),
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Upload falló (${response.status}): ${body.message ?? 'sin detalle'}`);
  }
  return body;
}

async function getDocument(session, id) {
  const response = await fetch(`${base}/api/documents/${id}`, {
    headers: { cookie: session },
  });
  if (!response.ok) throw new Error(`GET documento falló (${response.status})`);
  return response.json();
}

async function waitForIndexed(session, id) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const document = await getDocument(session, id);
    if (document.status === 'INDEXED') return document;
    if (document.status === 'ERROR') {
      throw new Error(
        `Documento terminó en ERROR (${document.errorCode ?? 'sin código'}): ${
          document.errorMessage ?? 'sin detalle'
        }`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Timeout esperando INDEXED');
}

async function search(session, token) {
  const response = await fetch(
    `${base}/api/search?q=${encodeURIComponent(token)}&page=1&pageSize=20`,
    { headers: { cookie: session } },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(`Search falló (${response.status})`);
  return body;
}

async function main() {
  const token = `E2E-${Date.now()}`;
  const { session, csrfToken } = await login();

  const idempotencyKey = `e2e-${randomUUID()}`;
  const first = await upload(session, csrfToken, token, idempotencyKey);
  assert.equal(first.status, 'PROCESSING', 'El estado inicial debe ser PROCESSING');
  assert.ok(first.trackingId, 'La respuesta debe incluir trackingId');
  assert.equal(first.trackingId, first.id, 'trackingId debe coincidir con id');
  console.log(`Aceptado ${first.trackingId} con estado ${first.status}`);

  const duplicate = await upload(session, csrfToken, token, idempotencyKey);
  assert.equal(duplicate.id, first.id, 'Idempotency-Key debe devolver el mismo documento');
  console.log('Idempotency-Key reutilizada correctamente');

  const indexed = await waitForIndexed(session, first.id);
  console.log(`Documento INDEXED en ${indexed.indexedAt}`);

  const results = await search(session, token);
  assert.ok(results.total >= 1, 'La búsqueda debe encontrar el documento');
  assert.ok(
    results.items.some((item) => item.id === first.id),
    'El documento indexado debe aparecer en la búsqueda',
  );
  console.log(`Búsqueda OK: ${results.total} resultado(s)`);
  console.log('Pipeline completo OK');
}

main().catch((error) => {
  console.error('E2E pipeline falló:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
