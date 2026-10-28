# Validación de la sección 5: tiempo real y frontend

Fecha: 2026-10-28. Validación contra el stack Docker local.

## Resultado

Los cinco puntos están cubiertos. El único defecto visual encontrado fue el PDF recortado en móvil; se corrigió ajustando la escala inicial al ancho disponible.

| Punto | Estado | Evidencia |
|---|---|---|
| Elegir e implementar WebSocket, SSE o GraphQL | Completo | SSE en `GET /api/events`; Redis pub/sub; ping cada 15 s; nginx con `proxy_buffering off` |
| Emitir evento al terminar o fallar | Completo | El processor publica `PROCESSING`, `INDEXED` y `ERROR` con `documentId`, `userId`, `status`, `stage`, error y timestamp |
| Pantallas de carga, estado, búsqueda y detalle | Completo | `/upload`, `/search`, `/documents/:id` y `/settings`; la cola muestra el estado por archivo |
| Actualizar la UI con eventos, sin polling | Completo | `SseService` usa `EventSource`; la cola de carga reacciona a `lastEvent`; no hay `setInterval` de polling en el frontend |
| Resultados paginados, metadatos, contenido y resaltados, UI adaptable | Completo | Paginación, facetas, preview, snippet resaltado y visor; sin overflow horizontal a 390 px |

## Evidencia SSE

Eventos capturados en el navegador durante una carga real:

```json
[
  {
    "type": "document.status",
    "status": "PROCESSING",
    "stage": "extraction",
    "attempt": 1
  },
  {
    "type": "document.status",
    "status": "INDEXED",
    "stage": "indexing",
    "attempt": 1
  }
]
```

La cola de la UI pasó a **Indexado** como consecuencia del evento, sin refrescar ni consultar el estado repetidamente.

## Responsive

Probado a `390 × 844`:

- `/search`: filtros, resultados, paginación y preview se apilan sin desbordamiento.
- `/upload`: dropzone, metadatos y cola se apilan.
- `/viewer`: header, contenido, PDF y metadatos se apilan.
- `/settings`: formulario y tabla se adaptan; la tabla tiene scroll horizontal interno si lo necesita.

Corrección aplicada en `PdfViewerComponent`: la escala inicial se calcula con el ancho real del contenedor. En móvil quedó al **55%** y la página dejó de recortarse; en escritorio se mantiene cerca del 100–120%.

## Reconexión

`EventSource` reconecta automáticamente, pero el backend no reproduce eventos perdidos. Para cubrir ese caso, la pantalla de carga hace una **reconciliación única** de los documentos activos cuando detecta que SSE volvió a conectar. No es polling: solo se ejecuta en la transición de desconectado a conectado y evita que un documento quede mostrando `PROCESANDO` indefinidamente tras un corte.
