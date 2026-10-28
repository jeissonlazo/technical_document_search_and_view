# Buscador y visor de documentos técnicos

Aplicación web para cargar documentos técnicos (PDF, TXT y Markdown), procesarlos e indexarlos en segundo plano, buscar por texto completo y visualizarlos sin descargarlos manualmente. DOCX queda como soporte opcional fuera de la v1 porque no es un requisito del enunciado original.

**Estado actual:** stack Docker verificado (`database`, `redis`, `elasticsearch` y `r2` en `true`). Se probó el flujo completo con TXT, PDF y Markdown (y DOCX como soporte opcional), además de la carga batch con un archivo válido y uno inválido: subida, almacenamiento en R2, extracción, indexación, búsqueda con highlight y lectura del contenido.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Angular 22 + TypeScript + Spartan NG + Tailwind CSS 4 |
| Backend | NestJS + TypeScript |
| Persistencia | PostgreSQL en **Neon** + Prisma |
| Búsqueda | Elasticsearch 8 |
| Cola | Redis + BullMQ |
| Tiempo real | Server-Sent Events (SSE) |
| Storage | **Cloudflare R2** (bucket privado, S3-compatible) |
| Entorno | Docker Compose |

## Documentación

- [Arquitectura](docs/architecture.md)
- [Decisiones técnicas](docs/decisiones-tecnicas.md)
- [Requerimientos de frontend](docs/requerimientos-frontend.md)
- [Revisión del stack de visualización](docs/revision-visualizacion.md)
- [Uso de IA](docs/ia.md)

## Estructura

```text
backend/                 API NestJS, worker, Prisma y migraciones
frontend/                Aplicación Angular + nginx para producción
packages/shared/         Tipos compartidos (solo .d.ts)
docs/                    Arquitectura, decisiones, frontend e IA
docker-compose.yml       Redis, Elasticsearch, API, worker, frontend y migración
.env.example             Plantilla de variables de entorno
```

## Requisitos

- Node.js **22 LTS** o superior
- pnpm **10**
- Docker Desktop con al menos **4 GB libres** para Elasticsearch
- Proyecto de **Neon** con conexión pooled y directa
- Cuenta de Cloudflare con un bucket **R2** privado y permisos de lectura/escritura

## 1. Variables de entorno

El proyecto usa **un único `.env` en la raíz** para backend, Prisma, Docker Compose y migraciones.

```bash
cp .env.example .env
```

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `NODE_ENV` | Sí | `development`, `test` o `production` |
| `PORT` | No | Puerto de la API; por defecto `3000` |
| `FRONTEND_ORIGIN` | Sí | Origen permitido para CORS/cookies; por defecto `http://localhost:4200` |
| `DATABASE_URL` | Sí | Neon **pooled** para runtime |
| `DIRECT_URL` | Sí | Neon **directo** para migraciones |
| `REDIS_URL` | Sí | Redis local o `rediss://` para un proveedor TLS |
| `ELASTICSEARCH_NODE` | Sí | `http://localhost:9200` o URL de Elastic Cloud |
| `ELASTICSEARCH_INDEX` | No | Índice; por defecto `documents-v1` |
| `ELASTICSEARCH_API_KEY` | No | Solo si el clúster usa API key |
| `SESSION_SECRET` | Sí | Secreto de sesión/CSRF; mínimo 16 caracteres, recomendado 48 bytes |
| `SESSION_TTL_SECONDS` | No | TTL de sesión; por defecto `604800` |
| `R2_ACCOUNT_ID` | Sí | Account ID de Cloudflare |
| `R2_ACCESS_KEY_ID` | Sí | Access Key ID de R2 o `id` del token de API |
| `R2_SECRET_ACCESS_KEY` | Sí | Secret Access Key de R2 o SHA-256 del token de API |
| `R2_BUCKET` | Sí | Bucket privado; en este proyecto `katabuscador` |
| `R2_ENDPOINT` | Sí | `https://<account_id>.r2.cloudflarestorage.com` |
| `R2_REGION` | No | `auto` |
| `R2_SIGNED_URL_TTL_SECONDS` | No | TTL de URLs firmadas; por defecto `300` |
| `MAX_FILE_SIZE_MB` | No | Límite por archivo; por defecto `25` |
| `MAX_BATCH_FILES` | No | Límite por lote; por defecto `20` |
| `MAX_BATCH_TOTAL_MB` | No | Tamaño total del lote; por defecto `100` |
| `WORKER_CONCURRENCY` | No | Concurrencia del worker; por defecto `2` |
| `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` | No | Usuario de demostración |

### ¿Un solo `.env` para frontend y backend?

**Sí para desarrollo**, con una condición: el frontend no debe recibir secretos.

- NestJS, Prisma y Docker Compose leen el `.env` de la raíz.
- Angular **no lee `.env`** de forma nativa; usa `/api` relativo y el proxy de desarrollo o nginx.
- No pongas `DATABASE_URL`, `R2_SECRET_ACCESS_KEY` ni `SESSION_SECRET` en `environment.ts`, `config.json` ni en el bundle: todo lo que llega al navegador es público.
- Si el frontend necesita configuración pública (URL de API, Sentry DSN, flags), usa `frontend/public/config.json` o `environment.ts` con valores no secretos.
- En Docker, solo `api`, `worker`, `migrate` y `seed` reciben `env_file: .env`; `frontend` no.

`.env` está en `.gitignore`. Nunca lo subas al repositorio.

## 2. Base de datos Neon

Neon ofrece dos hosts:

| Variable | Host | Uso |
| --- | --- | --- |
| `DATABASE_URL` | `...-pooler...` | API y worker; añade `pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | sin `-pooler` | `prisma migrate` y tareas administrativas |

Ejemplo:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.REGION.aws.neon.tech/DB?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASSWORD@HOST.REGION.aws.neon.tech/DB?sslmode=require"
```

`prisma/schema.prisma` usa `url = env("DATABASE_URL")` y `directUrl = env("DIRECT_URL")`.

Notas:

- Si la URL de Neon trae `channel_binding=require` y Prisma falla, quita ese parámetro; Prisma negocia TLS con `sslmode=require`.
- No publiques estas URLs ni las pongas en el frontend.
- Si compartiste la cadena en un chat, rota la contraseña de Neon y actualiza ambas variables.
- Comprueba la conexión con `pnpm db:check`.

## 3. Cloudflare R2

El bucket debe ser **privado**. En este proyecto se usa `katabuscador`.

```env
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=katabuscador
R2_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
R2_REGION=auto
R2_SIGNED_URL_TTL_SECONDS=300
```

### Credenciales

Dos formas válidas:

1. **R2 API token** creado en R2 → Manage R2 API Tokens: usa su **Access Key ID** y **Secret Access Key**.
2. **Token de API de Cloudflare** con permisos R2: `R2_ACCESS_KEY_ID` es el `id` del token y `R2_SECRET_ACCESS_KEY` es el **SHA-256 del valor del token**.

En ambos casos el par es obligatorio: el Access Key ID identifica y el Secret firma; no son intercambiables. El Secret no se muestra de nuevo en Cloudflare, así que debe guardarse de forma segura.

Valida antes de arrancar:

```bash
pnpm r2:check
```

Resultado esperado:

```text
R2 OK: bucket "katabuscador" accesible.
```

Para probar también escritura:

```bash
R2_CHECK_WRITE=1 pnpm r2:check
```

En Windows PowerShell:

```powershell
$env:R2_CHECK_WRITE = "1"; pnpm r2:check; Remove-Item Env:R2_CHECK_WRITE
```

### CORS

El frontend consume el contenido por `/api/documents/:id/content`, así que el navegador no llama directamente a R2 y **CORS no es necesario para el flujo actual**. Si empiezas a usar URLs firmadas directas, configura CORS en el bucket con origen `http://localhost:4200`, métodos `GET`/`HEAD` y `AllowedHeaders: ["Range"]`.

### Seguridad

- No pongas `R2_SECRET_ACCESS_KEY` en el frontend.
- Usa un token limitado al bucket y con permiso **Object Read & Write**.
- Rota cualquier token que se haya compartido en un chat, issue o captura.
- No actives acceso público al bucket.

## 4. Instalación

```bash
corepack enable
pnpm install
```

Genera Prisma Client:

```bash
pnpm db:generate
```

## 5. Desarrollo local

### 5.1 Infraestructura

Neon es externo; Redis y Elasticsearch se levantan con Docker:

```bash
pnpm dev:infra
```

Esto inicia `redis` y `elasticsearch`. No inicia PostgreSQL porque la base es Neon.

Si quieres usar PostgreSQL local:

```bash
docker compose --profile local-db up -d postgres
```

y cambia `DATABASE_URL`/`DIRECT_URL` a:

```env
DATABASE_URL=postgresql://docs:docs@localhost:5432/docs?schema=public
DIRECT_URL=postgresql://docs:docs@localhost:5432/docs?schema=public
```

### 5.2 Migraciones y seed

```bash
pnpm db:migrate
pnpm seed
```

Usuario semilla por defecto:

```text
demo@example.com
ChangeMe123!
```

Cámbialo antes de cualquier despliegue.

### 5.3 Aplicaciones

En terminales separadas:

```bash
pnpm dev:backend
pnpm dev:worker
pnpm dev:frontend
```

Abrir:

- Frontend: `http://localhost:4200`
- API: `http://localhost:3000/api`
- Health: `http://localhost:3000/api/health`

El frontend usa `proxy.conf.json` para enviar `/api` y `/api/events` a `http://localhost:3000`.

## 6. Docker Compose

El `docker-compose.yml` levanta el stack completo:

| Servicio | Función |
| --- | --- |
| `migrate` | Ejecuta `prisma migrate deploy` y termina; bloquea API/worker hasta completar |
| `redis` | BullMQ y sesiones |
| `elasticsearch` | Índice de búsqueda |
| `api` | NestJS en `:3000` |
| `worker` | Procesamiento de documentos |
| `frontend` | Angular servido por nginx en `:4200` |
| `postgres` | Opcional, perfil `local-db` |
| `seed` | Usuario demo, perfil `seed` |

### Levantar

```bash
docker compose up --build -d
docker compose ps
```

El servicio `migrate` es de una sola ejecución: aparece como `Exited (0)` en `docker compose ps -a`; no es un error.

### Seed en Docker

```bash
docker compose --profile seed run --rm seed
```

### Logs y parada

```bash
docker compose logs -f api worker
docker compose down
```

`docker compose down -v` elimina también los volúmenes de Redis/Elasticsearch; úsalo solo si quieres borrar esos datos.

### Cambios de `.env`

Si cambias variables de entorno:

```bash
docker compose up -d --force-recreate api worker
```

## 7. Compilación

### Backend

```bash
pnpm --filter @docs/backend build
```

Salida: `backend/dist/`. Incluye `prisma generate` y `nest build`.

### Frontend

```bash
pnpm --filter @docs/frontend build
```

Salida: `frontend/dist/frontend/browser/`.

### Ambos

```bash
pnpm build
```

## 8. Pruebas

```bash
pnpm test
```

Incluye pruebas unitarias del extractor (TXT, Markdown, BOM, formatos no admitidos, archivo vacío), del worker (idempotencia, retry transitorio, error terminal y camino exitoso) y del nombre de archivo (rutas, reservados, caracteres especiales, longitud). Las pruebas e2e de navegador, la búsqueda dentro de PDF y el benchmark de latencia quedan pendientes.

## 9. API principal

| Método | Ruta | Uso |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Registro con email/contraseña |
| `POST` | `/api/auth/login` | Inicio de sesión |
| `POST` | `/api/auth/logout` | Cierre de sesión |
| `GET` | `/api/auth/me` | Usuario y CSRF vigente |
| `POST` | `/api/api-keys` | Crear API key (se muestra una vez) |
| `GET` | `/api/api-keys` | Listar API keys |
| `DELETE` | `/api/api-keys/:id` | Revocar API key |
| `POST` | `/api/documents` | Subir un archivo + metadatos |
| `POST` | `/api/documents/batch` | Subir varios archivos + metadatos alineados |
| `GET` | `/api/documents/:id` | Metadatos, estado y texto normalizado |
| `GET` | `/api/documents/:id/content` | Original para el visor, con `Range` |
| `POST` | `/api/documents/:id/retry` | Reintentar procesamiento |
| `GET` | `/api/search?q=...` | Búsqueda paginada con highlights |
| `GET` | `/api/events` | SSE de estados |
| `GET` | `/api/health` | Salud de PostgreSQL, Redis, Elasticsearch y R2 |

### Carga individual

```bash
curl -X POST http://localhost:4200/api/documents \
  -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" \
  -F "file=@manual.pdf;type=application/pdf" \
  -F "title=Manual de operaciones" \
  -F "author=Jeisson" \
  -F "category=Manuales" \
  -F "tags=pdf,operaciones" \
  -F "version=1.0"
```

Respuesta: `202 Accepted` con el documento en `RECEIVED` y su `contentUrl`.

### Carga múltiple

```bash
curl -X POST http://localhost:4200/api/documents/batch \
  -b cookies.txt \
  -H "X-CSRF-Token: $CSRF" \
  -F "files=@manual.pdf;type=application/pdf" \
  -F "files=@notas.md;type=text/markdown" \
  -F 'metadata=[
    {"title":"Manual de operaciones","author":"Jeisson","category":"Manuales","tags":["pdf","operaciones"],"version":"1.0"},
    {"title":"Notas de arquitectura","author":"Jeisson","category":"Arquitectura","tags":["markdown","arquitectura"],"version":"1.0"}
  ]'
```

`metadata` debe ser un arreglo JSON con la misma cantidad y orden que `files[]`. Cada elemento admite `title` (obligatorio), `author`, `category`, `tags` (string o arreglo) y `version`. La respuesta es `202` con `total`, `accepted`, `failed` y `results`; un fallo no cancela los demás archivos.

Límites: 20 archivos, 25 MB por archivo y 100 MB totales por defecto. Angular **no usa** este endpoint: mantiene una solicitud por archivo y subida secuencial.

### Validaciones de carga

- Formato por extensión y contenido real: PDF (`%PDF-`), TXT/Markdown UTF-8 y DOCX opcional (ZIP).
- Tamaño por archivo y por lote; cantidad máxima de archivos.
- `title` obligatorio; `author`, `category`, `tags` y `version` opcionales con límites de longitud.
- Nombre de archivo: sin rutas, caracteres de control, nombres reservados de Windows ni longitud excesiva. El nombre saneado se guarda como `originalFilename`; la clave de R2 usa UUID y extensión.
- Los errores devuelven `code`, `message`, `retryable` y `supportRef`; en batch, cada archivo tiene su propio resultado.

## 10. Flujo de carga

1. Angular envía un archivo a la vez por lote con `multipart/form-data`.
2. NestJS valida formato/tamaño, calcula SHA-256, sube el original a R2 y crea el registro `RECEIVED`.
3. Se encola un trabajo BullMQ con el `documentId`.
4. El worker extrae texto (`pdf-parse` o UTF-8; `mammoth` solo si se habilita DOCX opcional), guarda `normalized.txt` en R2 y lo indexa en Elasticsearch.
5. El estado pasa a `INDEXED` o `ERROR` y se publica por SSE.
6. Angular actualiza la cola del lote y permite reintentar errores transitorios.

## 11. Búsqueda

`GET /api/search` usa `multi_match` sobre título, descripción y contenido, con filtros por categoría/etiquetas/autor, paginación de 20 y `highlight` de Elasticsearch. No se usa `LIKE` ni recorridos de tabla para contenido.

## 12. Diagnóstico rápido

| Síntoma | Qué revisar |
| --- | --- |
| `r2: false` en health | `pnpm r2:check`; credenciales, bucket y endpoint |
| `STORAGE_UNAVAILABLE` al subir | R2 no configurado o credenciales incorrectas |
| `database: false` | `DATABASE_URL`/Neon; `pnpm db:check` |
| `redis: false` | `pnpm dev:infra` o `REDIS_URL` |
| `elasticsearch: false` | Contenedor Elasticsearch healthy; `ELASTICSEARCH_NODE` |
| 502 en `http://localhost:4200/api` | API no healthy; `docker compose logs api` |
| Prisma falla con Neon | Quita `channel_binding=require`; verifica `DIRECT_URL` |
| Migración no aplica | `docker compose logs migrate`; `migrate` debe salir con `Exited (0)` |
| Puerto ocupado | Libera `3000`, `4200`, `5432`, `6379` u `9200` |

## 13. Limitaciones actuales

- El visor PDF usa PDF.js con navegación por páginas y zoom; la búsqueda dentro del PDF y el renderizado continuo quedan pendientes.
- DOCX no es un requisito de la v1. El visor `docx-preview` y la extracción con `mammoth` existen como soporte opcional/experimental y no se incluyen en la aceptación.
- Spartan NG está declarado y Tailwind 4 está configurado, pero los componentes helm todavía deben añadirse con su CLI. La UI actual usa Tailwind y HTML accesible.
- No hay pruebas e2e de navegador ni medición formal de latencia todavía.
- La autenticación es mínima: cookie HttpOnly, CSRF y API keys; sin roles ni permisos diferenciados.
- El resumen de búsqueda no promete enlace profundo a la página del PDF; el resaltado obligatorio está en los fragmentos de resultados.
- Si usas URLs firmadas directas de R2, falta configurar CORS y `Range` en el bucket.

## 14. Seguridad

- El bucket R2 es privado; el backend sirve el contenido con autorización y soporte de `Range`.
- La sesión usa cookie HttpOnly, `SameSite=Lax` y CSRF para escrituras.
- Las API keys se guardan como hash SHA-256 y se muestran una sola vez.
- Las contraseñas se almacenan con Argon2id.
- No se registran credenciales, tokens ni contenido de documentos en logs.
- Los errores internos no se exponen al cliente; se devuelve un código estable y una referencia de soporte.
- Rota la contraseña de Neon y los tokens de Cloudflare si se compartieron fuera de `.env`.

## 15. Uso de IA

El detalle de herramientas, prompts y validación humana está en [docs/ia.md](docs/ia.md). Actualízalo con las herramientas que realmente uses antes de entregar.
