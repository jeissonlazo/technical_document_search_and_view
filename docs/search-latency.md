# Latencia de búsqueda: medición y optimización

**Fecha:** 2026-10-28  
**Alcance:** endpoint `GET /api/search`, datos locales de demostración, API en Docker, PostgreSQL Neon y Elasticsearch local.

## 1. Instrumentación

Cada respuesta incluye un encabezado `Server-Timing`:

```http
Server-Timing: auth;dur=0.50, elasticsearch;dur=11.52, total;dur=12.25
```

- `auth`: guard de sesión/API key, incluida la comprobación del usuario.
- `elasticsearch`: consulta completa a Elasticsearch.
- `postgres`: lectura adicional de metadatos (presente en la medición inicial).
- `total`: desde el inicio del guard hasta antes de serializar la respuesta.

El controlador registra además un log JSON `search_timing` con esos valores, página, cantidad de hits y presencia de filtros. No registra el texto de la consulta.

## 2. Metodología

Script:

```bash
pnpm --filter @docs/backend benchmark:search
```

Variables:

- `BENCH_QUERIES`: consultas separadas por coma.
- `BENCH_RUNS`: repeticiones por consulta.
- `BENCH_DELAY_MS`: pausa para no superar el rate limit.

Se descartan dos ejecuciones de calentamiento por consulta. Los percentiles se calculan por interpolación lineal.

### Medición inicial

- 48 muestras.
- 6 consultas × 8 repeticiones.
- Resultado completo: [search-latency-baseline.json](search-latency-baseline.json).

| Métrica | p50 | p95 |
|---|---:|---:|
| Cliente completo | 1.147,60 ms | 2.287,70 ms |
| Autenticación | 545,14 ms | 1.083,61 ms |
| Elasticsearch | 14,50 ms | 85,60 ms |
| PostgreSQL (metadatos) | 545,91 ms | 1.295,95 ms |
| Total servidor | 1.138,07 ms | 2.270,56 ms |

**Diagnóstico:** Elasticsearch no era el cuello de botella. Dominaban dos viajes a PostgreSQL/Neon:

1. La validación del usuario en cada petición autenticada.
2. La lectura batch de `mime`, `size`, `createdAt` y `originalFilename` para enriquecer los hits.

## 3. Optimización aplicada

### Metadatos en Elasticsearch

- Se indexan `mime`, `size` y `originalFilename` junto con el resto del documento.
- Se eliminó la consulta a PostgreSQL dentro de `SearchService.search`.
- Se añadió un backfill para documentos existentes:

```bash
pnpm --filter @docs/backend es:backfill
```

El detalle del preview sigue consultando PostgreSQL solo cuando el usuario selecciona un documento; no en cada búsqueda.

### Caché breve del usuario autenticado

- La sesión sigue en Redis.
- El usuario resuelto se cachea en Redis durante `AUTH_USER_CACHE_TTL_SECONDS` (30 s por defecto).
- Se conserva la comprobación de `disabledAt`; una cuenta deshabilitada puede quedar cacheada como activa como máximo durante ese TTL.
- `AuthService.invalidateUserCache(userId)` permite invalidar explícitamente si se añade un endpoint de deshabilitación.

## 4. Medición posterior

- 48 muestras.
- 6 consultas × 8 repeticiones, las mismas que la medición inicial.
- Resultado completo: [search-latency-optimized.json](search-latency-optimized.json).

| Métrica | p50 | p95 |
|---|---:|---:|
| Cliente completo | 31,00 ms | 60,09 ms |
| Autenticación | 0,50 ms | 0,94 ms |
| Elasticsearch | 10,61 ms | 27,98 ms |
| PostgreSQL (metadatos) | — | — |
| Total servidor | 16,27 ms | 41,30 ms |

La meta de menos de un segundo se cumple con un margen amplio en este entorno. El máximo aislado de ~930 ms corresponde a una entrada fría del usuario en la caché de autenticación; el p95 se mantiene en ~41 ms.

## 5. Funciones preservadas

- Filtros por categoría, autor y etiquetas.
- Facetas de categoría, tag y autor.
- Resaltado de Elasticsearch.
- Orden por relevancia, nombre y fecha.
- Paginación.
- Metadatos de los hits (`mime`, `size`, `createdAt`, `originalFilename`, `status`).
- Búsqueda de metadatos mediante el campo `metadata`.

## 6. Límites de la medición

- El dataset local es pequeño; los percentiles no representan un corpus de producción.
- La segunda medición usó 48 muestras, las mismas consultas y repeticiones que la inicial.
- El benchmark usa la cuenta semilla y consultas representativas, no una mezcla completa de filtros y páginas.
- No se implementó caché de resultados: con ~12 ms p50 no aporta valor y añadiría invalidación compleja.

## 7. Próximos pasos si cambia el volumen

1. Repetir con un corpus de al menos decenas de miles de documentos.
2. Medir por separado consultas con y sin filtros/facetas.
3. Evaluar caché Redis de resultados solo si las consultas repetidas vuelven a superar el objetivo.
4. Si el corpus crece, medir el costo de `track_total_hits: true` y de las agregaciones.
