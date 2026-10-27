# Buscador y visor de documentos técnicos

Aplicación web para cargar documentos técnicos (PDF, TXT, Markdown y DOCX), indexarlos en segundo plano, buscar por texto completo y visualizarlos sin descargarlos manualmente.

**Estado:** esqueleto funcional del monorepo. La arquitectura y las decisiones están documentadas; la implementación está en progreso.

## Stack

| Capa | Tecnología |
| --- | --- |
| Frontend | Angular 22 + TypeScript + Spartan NG + Tailwind CSS 4 |
| Backend | NestJS + TypeScript |
| Persistencia | PostgreSQL + Prisma |
| Búsqueda | Elasticsearch 8 |
| Cola | Redis + BullMQ |
| Tiempo real | Server-Sent Events (SSE) |
| Storage | **Cloudflare R2** (bucket privado, S3-compatible) |
| Entorno | Docker Compose |

## Documentación

- [Arquitectura](docs/architecture.md)
- [Decisiones técnicas](docs/decisiones-tecnicas.md)
- [Requerimientos de frontend](docs/requerimientos-frontend.md)
- [Uso de IA](docs/ia.md)

## Estructura

```text
backend/                 API NestJS, worker y Prisma
frontend/                Aplicación Angular
packages/shared/         Tipos compartidos (solo tipos)
docs/                    Arquitectura, decisiones, frontend e IA
docker-compose.yml       PostgreSQL, Redis, Elasticsearch, API, worker y frontend
.env.example             Variables de entorno
```

## Requisitos

- Node.js 22 o superior
- pnpm 10
- Docker Desktop con al menos 4 GB libres para Elasticsearch
- Una cuenta de Cloudflare con un bucket R2 y un API token

## 1. Configurar Cloudflare R2

1. Crea un bucket privado, por ejemplo `technical-documents`. No actives acceso público.
2. Crea un API token de R2 con permiso **Object Read & Write** limitado a ese bucket.
3. Copia `.env.example` a `.env` y completa:

```env
R2_ACCOUNT_ID=tu_account_id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=technical-documents
R2_ENDPOINT=https://tu_account_id.r2.cloudflarestorage.com
R2_REGION=auto
R2_SIGNED_URL_TTL_SECONDS=300
```

4. Configura CORS en el bucket para el frontend. Si usas el proxy de nginx, el origen es `http://localhost:4200`; si llamas a la API directamente, añade también `http://localhost:3000`.

```json
[
  {
    "AllowedOrigins": ["http://localhost:4200"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Range", "Content-Length", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

5. Configura una regla de ciclo de vida para abortar cargas multipart incompletas después de 1 día y define la retención de originales/texto normalizado.

## 2. Ejecutar en local

```bash
cp .env.example .env
pnpm install
pnpm dev:infra
pnpm db:generate
pnpm db:migrate
pnpm seed
```

En terminales separadas:

```bash
pnpm dev:backend
pnpm dev:worker
pnpm dev:frontend
```

Abre `http://localhost:4200`. El usuario semilla es `demo@example.com` / `ChangeMe123!`; cámbialo antes de cualquier despliegue.

### Todo con Docker

```bash
cp .env.example .env
docker compose up --build
```

El frontend queda en `http://localhost:4200` y la API en `http://localhost:3000/api`. nginx sirve el frontend y hace proxy de `/api` y `/api/events` para que la cookie de sesión y SSE sean same-origin.

## 3. API principal

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
| `GET` | `/api/documents/:id` | Metadatos, estado y texto normalizado |
| `GET` | `/api/documents/:id/content` | Original para el visor, con `Range` |
| `POST` | `/api/documents/:id/retry` | Reintentar procesamiento |
| `GET` | `/api/search?q=...` | Búsqueda paginada con highlights |
| `GET` | `/api/events` | SSE de estados |
| `GET` | `/api/health` | Salud de PostgreSQL, Redis, Elasticsearch y R2 |

## 4. Flujo de carga

1. Angular envía un archivo a la vez por lote con `multipart/form-data`.
2. NestJS valida formato/tamaño, calcula SHA-256, sube el original a R2 y crea el registro `RECEIVED`.
3. Se encola un trabajo BullMQ con el `documentId`.
4. El worker extrae texto (`pdf-parse`, `mammoth` o UTF-8), guarda `normalized.txt` en R2 y lo indexa en Elasticsearch.
5. El estado pasa a `INDEXED` o `ERROR` y se publica por SSE.
6. Angular actualiza la cola del lote y permite reintentar errores transitorios.

## 5. Búsqueda

`GET /api/search` usa `multi_match` sobre título, descripción y contenido, con filtros por categoría/etiquetas/autor, paginación de 20 y `highlight` de Elasticsearch. No se usa `LIKE` ni recorridos de tabla para contenido.

## 6. Pruebas

```bash
pnpm test
```

Incluye pruebas unitarias del extractor. Las pruebas de integración/e2e de frontend y el benchmark de latencia quedan pendientes.

## 7. Limitaciones actuales

- El proyecto se generó como esqueleto; **no se ejecutó `pnpm install` ni el build en este entorno** porque el sandbox bloquea PowerShell sobre esta carpeta. Verifica el build en tu máquina.
- El visor PDF usa PDF.js con navegación por páginas y zoom; la búsqueda dentro del PDF y el renderizado continuo quedan pendientes.
- El visor DOCX usa `docx-preview` en modo solo lectura. No hay edición ni resaltado dentro del documento.
- Spartan NG está declarado y Tailwind 4 está configurado, pero los componentes helm todavía deben añadirse con su CLI. La UI actual usa Tailwind y HTML accesible.
- No hay pruebas e2e ni medición de latencia todavía.
- La autenticación es mínima: sesión con cookie HttpOnly, CSRF y API keys; sin roles.
- R2 es obligatorio para subir documentos. Para tests offline se puede apuntar `R2_ENDPOINT` a MinIO con la misma interfaz S3.

## 8. Seguridad

- El bucket R2 es privado; el backend emite URLs firmadas de corta duración o sirve el binario con autorización.
- La sesión usa cookie HttpOnly, `SameSite=Lax` y CSRF para escrituras.
- Las API keys se guardan como hash SHA-256 y se muestran una sola vez.
- No se registran credenciales, tokens ni contenido de documentos en logs.
- Los errores internos no se exponen al cliente; se devuelve un código estable y una referencia de soporte.

## 9. Uso de IA

El detalle de herramientas, prompts y validación humana está en [docs/ia.md](docs/ia.md). Actualízalo con las herramientas que realmente uses antes de entregar.
