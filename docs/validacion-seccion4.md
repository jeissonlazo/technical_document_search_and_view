# Validación de la sección 4: backend, carga e indexación

Fecha: 2026-10-28. Validación ejecutada contra el stack Docker local (Angular, NestJS, PostgreSQL Neon, Redis, Elasticsearch y R2).

## Resultado

Los siete puntos quedaron cubiertos. El único hueco encontrado fue la búsqueda de frases exactas entre comillas; se implementó `match_phrase` y se verificó.

| Punto | Estado | Evidencia |
|---|---|---|
| Endpoint de carga individual y múltiple con archivo y metadatos | Completo | `POST /api/documents` y `POST /api/documents/batch`; lote probado con 2 archivos aceptados |
| Validación de formato, tamaño, campos y nombres, con errores claros | Completo | `.exe` rechazado con `415 UNSUPPORTED_FILE_TYPE`; título ausente rechazado con `400 VALIDATION_ERROR`; límites de tamaño, nombre y contenido en `DocumentsService` |
| Respuesta rápida con identificador y estado inicial PROCESSING | Completo | `202` con `trackingId` y `status: PROCESSING` en la carga individual y en el lote |
| Extracción, metadatos e indexación sin bloquear la respuesta | Completo | Outbox + BullMQ; la respuesta se devuelve antes del procesamiento del worker |
| Transición a INDEXED o ERROR | Completo | El documento individual pasó de `PROCESSING` a `INDEXED`; el detalle devolvió `indexedAt`; la rama de error está cubierta por el processor y sus pruebas |
| Búsqueda por términos o frases, paginación y fragmentos resaltados | Completo | Búsqueda por término y por frase entre comillas; highlight con `<em>`; paginación `page=2&pageSize=1` |
| Detalle con metadatos y contenido estructurado | Completo | `GET /api/documents/:id` devuelve metadatos, estado y `normalizedText`; el visor renderiza PDF, TXT o Markdown |

## Evidencia de la ejecución

```text
upload.status = 202
upload.documentStatus = PROCESSING
upload.trackingId = true

detail.status = INDEXED
detail.hasNormalizedText = true
detail.metadata.author = Validation
detail.metadata.category = Pruebas
detail.metadata.tags = ["validacion", "seccion4"]
detail.metadata.version = 1.0

validation.status = 415
validation.code = UNSUPPORTED_FILE_TYPE

requiredField.status = 400
requiredField.code = VALIDATION_ERROR

batch.status = 202
batch.total = 2
batch.accepted = 2
batch.failed = 0
batch.firstStatus = PROCESSING

termSearch.total = 4
termSearch.items = 1
termSearch.highlighted = true

phraseSearch.total = 3
phraseSearch.titleFound = true
falsePhraseSearch.total = 0

pagination.page = 2
pagination.pageSize = 1
pagination.items = 1
```

## Cambio aplicado

En `SearchService`, una consulta delimitada por comillas dobles o tipográficas se envía como `multi_match` con `type: 'phrase'`. Las consultas sin comillas combinan dos cláusulas en `bool.should` (`minimum_should_match: 1`): `fuzziness: AUTO` sobre los campos de texto y búsqueda por prefijo sobre los subcampos `*.prefix` (`edge_ngram` 3–20), que es lo que permite encontrar `arquitectura` escribiendo `arqui`.

```text
"ornitorrinco azul"  -> frase exacta
ornitorrinco         -> términos con tolerancia a errores
arqui                -> prefijo (desde 3 caracteres) + términos
```

## Pruebas y limpieza

- Pruebas unitarias: `19/19`.
- Build de backend correcto.
- Documentos temporales de la validación eliminados de PostgreSQL, Elasticsearch y R2 al finalizar.
- La API, el worker, Elasticsearch y Redis quedaron levantados y saludables.
