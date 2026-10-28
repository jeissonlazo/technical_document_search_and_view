# Verificación de la solución

Fecha: 2026-10-28. Validación contra el stack Docker local.

## Resultado

Los seis puntos de verificación quedaron cubiertos. No se encontraron funciones faltantes; se corrigió el recorte del PDF en móvil y se añadieron pruebas de `DocumentsService` y `SearchService`.

| Punto | Estado | Evidencia |
|---|---|---|
| Carga individual/múltiple, validaciones, estados y errores | Completo | Carga individual y lote de 2; `202 PROCESSING`; `415 UNSUPPORTED_FILE_TYPE`; `400 VALIDATION_ERROR`; PDF corrupto y metadatos de lote inválidos cubiertos por pruebas |
| Búsqueda por título, metadatos y contenido; paginación y resaltado | Completo | Búsquedas por título, autor, categoría y contenido; highlight `<em>`; `page=2&pageSize=1` |
| Tiempo de búsqueda con tamaño de datos | Completo | 29 documentos INDEXED, 3 ERROR, índice de 1,6 MB; 30 muestras: p50 servidor 18,08 ms, p95 25,51 ms |
| SSE actualiza la UI al terminar la indexación | Completo | Eventos `PROCESSING` e `INDEXED` capturados en navegador; la cola pasó a Indexado sin polling |
| Pruebas de componentes críticos del backend | Completo | 28 pruebas, 5 suites; incluye DocumentsService, SearchService, processor, extraction y filename |
| README desde entorno reproducible | Completo | `pnpm install --frozen-lockfile`, generación Prisma, `pnpm build`, `pnpm test`; API health y frontend 200 |

## Pruebas añadidas

- `documents.service.spec.ts`
  - carga sin archivo;
  - extensión no admitida;
  - PDF con firma inválida;
  - creación en `PROCESSING` con outbox y almacenamiento;
  - lote vacío;
  - cantidad de metadatos distinta a los archivos.
- `search.service.spec.ts`
  - paginación, filtros, facetas y mapeo de metadatos/highlight;
  - frase entre comillas con `match_phrase`;
  - filtros de categoría, autor y etiquetas.

Resultado final: **5 suites, 28/28 pruebas**.

## Corpus y latencia

- Documentos `INDEXED`: 29.
- Documentos `ERROR`: 3.
- Alias `documents`; índice activo con 1,6 MB.
- Benchmark: 6 consultas × 5 repeticiones = 30 muestras.

| Métrica | p50 | p95 |
|---|---:|---:|
| Autenticación | 0,44 ms | 0,76 ms |
| Elasticsearch | 12,89 ms | 23,90 ms |
| Total servidor | 18,08 ms | 25,51 ms |
| Cliente completo | 23,96 ms | 31,75 ms |

Resultado: [search-latency-current.json](search-latency-current.json). Metodología: [search-latency.md](search-latency.md).

## Búsquedas verificadas

| Consulta | Resultado |
|---|---|
| Título: `Manual PDF valido` | Encontrado; el título aparece primero |
| Metadatos: `Jeisson` | 8 resultados |
| Categoría: `Pruebas` | 9 resultados |
| Contenido: `platypus` | 1 resultado con highlight |
| Frase: `"ornitorrinco azul"` | 3 resultados; frase falsa `0` |
| Paginación `manual`, página 2, tamaño 2 | 3 resultados totales; 1 en la página |

## README y arranque

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm build
pnpm test
```

También se eliminaron los directorios `backend/dist` y `frontend/dist` antes de recompilar. El build de NestJS y Angular terminó correctamente.

Estado del stack al cierre:

```text
PostgreSQL: true
Redis: true
Elasticsearch: true
R2: true
```

Frontend responde `200` en `http://localhost:4200/login`.

## Incidencias y correcciones

- **PDF recortado en móvil:** la escala inicial se calcula con el ancho real del contenedor; en 390 px quedó al 55%.
- **Reconexión SSE:** la cola reconcilia una vez los documentos activos al recuperar la conexión, sin polling.
- **Pruebas faltantes:** se añadieron casos de DocumentsService y SearchService; el total pasó de 19 a 28.

## Limitaciones

- El corpus es pequeño (29 documentos), aunque ahora su tamaño está documentado.
- Neon y R2 son servicios externos; la verificación depende de conectividad.
- La instalación se validó con lockfile y artefactos de build eliminados; no se recreó la base Neon ni se borraron los volúmenes de Elasticsearch/Redis.
