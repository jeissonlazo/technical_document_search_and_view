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

### Medición de cierre con el corpus actual

Fecha: 2026-10-28. Corpus activo: **29 documentos INDEXED**, 3 documentos ERROR, índice `documents` con **1,6 MB** de almacenamiento. Se usaron 6 consultas × 5 repeticiones (30 muestras), con las mismas consultas representativas.

| Métrica | p50 | p95 |
|---|---:|---:|
| Cliente completo | 23,96 ms | 31,75 ms |
| Autenticación | 0,44 ms | 0,76 ms |
| Elasticsearch | 12,89 ms | 23,90 ms |
| PostgreSQL (metadatos) | — | — |
| Total servidor | 18,08 ms | 25,51 ms |

El máximo aislado fue 533 ms por una entrada fría en la caché de autenticación. Resultado completo: [search-latency-current.json](search-latency-current.json).

### Medición tras añadir la búsqueda por prefijo

Fecha: 2026-10-29. Corpus: **42 documentos INDEXED**, índice `documents-v2` con **5,3 MB** (antes 1,7 MB). Mismas 6 consultas × 5 repeticiones (30 muestras).

| Métrica | p50 | p95 |
|---|---:|---:|
| Cliente completo | 22,14 ms | 48,62 ms |
| Autenticación | 0,46 ms | 0,72 ms |
| Elasticsearch | 15,51 ms | 40,85 ms |
| PostgreSQL (metadatos) | — | — |
| Total servidor | 16,32 ms | 41,77 ms |

El p50 se mantiene en el mismo orden que la medición anterior y el p95 sube por las cláusulas adicionales sobre los subcampos `*.prefix`. El máximo aislado de 553 ms vuelve a ser de autenticación (528 ms en una entrada fría de la caché): Elasticsearch no pasó de 41 ms. Resultado completo: [search-latency-prefix.json](search-latency-prefix.json).

El costo real de la función es de almacenamiento: `edge_ngram` 3–20 sobre `content` multiplica los términos indexados y llevó el índice de 1,7 MB a 5,3 MB (×3,1). Si el corpus crece, la palanca es bajar `max_gram` o limitar el subcampo a `title` y `description`. Los números de este apartado no son comparables uno a uno con las mediciones anteriores: cambió el corpus (29 → 42 documentos).

## 5. Funciones preservadas

- Filtros por categoría, autor y etiquetas.
- Facetas de categoría, tag y autor.
- Resaltado de Elasticsearch.
- Orden por relevancia, nombre y fecha.
- Paginación.
- Metadatos de los hits (`mime`, `size`, `createdAt`, `originalFilename`, `status`).
- Búsqueda de metadatos mediante el campo `metadata`.
- Búsqueda por prefijo (`arqui` → `arquitectura`) sobre los subcampos `*.prefix`.

## 6. Límites de la medición

- El dataset local tiene 42 documentos INDEXED y 5,3 MB (29 y 1,6 MB en las mediciones anteriores); los percentiles no representan un corpus de producción.
- La segunda medición usó 48 muestras, las mismas consultas y repeticiones que la inicial; la medición de cierre usó 30 muestras sobre el corpus actual.
- El benchmark usa la cuenta semilla y consultas representativas, no una mezcla completa de filtros y páginas.
- No se implementó caché de resultados: con ~18 ms p50 no aporta valor y añadiría invalidación compleja.

## 7. Próximos pasos si cambia el volumen

1. Repetir con un corpus de al menos decenas de miles de documentos.
2. Medir por separado consultas con y sin filtros/facetas.
3. Evaluar caché Redis de resultados solo si las consultas repetidas vuelven a superar el objetivo.
4. Si el corpus crece, medir el costo de `track_total_hits: true` y de las agregaciones.
