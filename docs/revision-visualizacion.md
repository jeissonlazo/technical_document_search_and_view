# Revisión del stack de visualización: PDF, TXT y Markdown

**Fecha:** 2026-10-28  
**Alcance:** visor de documentos de la v1. DOCX queda fuera porque no aparece en el enunciado original.

## 1. Alcance confirmado en el PDF original

El PDF de la kata define:

- **HU-01:** carga de documentos en formato **TXT, PDF o Markdown** con metadatos (título, autor, categoría, etiquetas, versión).
- **HU-03:** seleccionar un documento y visualizar su **contenido estructurado** y sus **metadatos completos**, en una **vista dedicada** con **renderizado fluido**, sin necesidad de descargar el archivo.
- **HU-02:** búsqueda con paginación y **highlighting de los fragmentos de resultados**. No exige resaltado dentro del cuerpo del documento.
- **HU-04:** notificación en tiempo real; no afecta al visor.

**Conclusión:** la v1 exige PDF, TXT y Markdown. No exige DOCX, edición, OCR, visor de páginas con búsqueda interna ni selección de texto en PDF. Esas capacidades son mejoras, no requisitos de aceptación.

## 2. Stack actual

| Formato | Tecnología | Implementación actual | Estado |
| --- | --- | --- | --- |
| PDF | `pdfjs-dist` (PDF.js) directo, sin wrapper Angular | Canvas por página, navegación anterior/siguiente, input de página, zoom, capa de texto superpuesta, worker local, `Range` vía API | Funcional; falta búsqueda interna y scroll continuo |
| TXT | Componente propio + `<pre>` | Backend normaliza UTF-8 y elimina BOM; el visor usa interpolación segura, `white-space: pre-wrap` y botón de copia | Funcional |
| Markdown | `marked` + `DOMPurify` | Render HTML sanitizado; encabezados, listas, tablas, código, blockquotes y enlaces; estilos `.markdown-body` | Funcional |
| DOCX | `docx-preview` + `mammoth` | Soporte existente | **Fuera de la v1**; opcional/experimental |

El visor se carga en una ruta lazy (`/documents/:id`). PDF.js y `docx-preview` se cargan de forma diferida; el bundle inicial no incluye esos chunks.

## 3. Evaluación por formato

### PDF con PDF.js

**Fortalezas**

- Control total del render y del layout; no hay wrapper que imponga una versión de Angular.
- PDF.js es el motor de referencia para PDF en navegador.
- El worker se sirve como asset local (`/assets/pdf.worker.min.mjs`), sin CDN.
- El endpoint de contenido soporta `Range`, por lo que PDF.js puede pedir partes del archivo.
- La capa de texto permite selección/copia y prepara el terreno para búsqueda interna.
- Zoom y navegación por página cubren la lectura básica.
- El canvas evita ejecutar contenido del PDF y reduce la superficie de XSS.

**Límites**

- No hay búsqueda dentro del documento ni resaltado de coincidencias.
- No hay scroll continuo ni miniaturas; se renderiza una página a la vez.
- La capa de texto requiere verificación visual en navegador; el build no la prueba.
- Documentos escaneados no tendrán texto seleccionable; se muestran como imagen, pero su indexación falla con `NO_EXTRACTABLE_TEXT` (OCR fuera de alcance).
- La calidad de fuentes/acentos depende de las fuentes embebidas y de los `cMap` de PDF.js.
- Si se añade CSP, debe permitir `worker-src 'self' blob:` y `connect-src` hacia la API.

**Alternativas**

| Opción | Ventaja | Coste/riesgo | Veredicto |
| --- | --- | --- | --- |
| PDF.js directo (actual) | Control, sin wrapper, compatible con Angular 22 | Más código propio | **Mantener** |
| `ng2-pdf-viewer` | Componente Angular listo | Dependencia adicional y menor control; compatibilidad con Angular 22 a validar | No necesario |
| `ngx-extended-pdf-viewer` | Trae búsqueda, miniaturas, toolbar y selección | Bundle grande, configuración compleja y acoplamiento | Solo si el evaluador exige búsqueda interna |
| `<iframe>`/visor nativo | Muy simple | Sin control de UI, depende del navegador, URL/cookies y cabeceras | No recomendado |

### TXT

**Fortalezas**

- No interpreta HTML: el texto se interpola y se muestra como texto plano.
- El backend normaliza UTF-8 y elimina BOM; los archivos no UTF-8 terminan en `UNSUPPORTED_ENCODING`.
- `pre-wrap` conserva saltos y espacios; el botón de copia mejora la lectura.
- El tamaño está limitado por `MAX_FILE_SIZE_MB`.

**Límites**

- Carga el texto completo en memoria; aceptable con el límite actual, pero no para archivos arbitrariamente grandes.
- Sin búsqueda, números de línea ni ajuste de tamaño de fuente.
- No hay renderizado enriquecido; es correcto para texto plano.

**Alternativas**

- Un visor genérico tipo `ngx-doc-viewer` añadiría dependencias y perdería el control de seguridad; no aporta para TXT.
- **Mantener el componente propio.**

### Markdown

**Fortalezas**

- `marked` renderiza GFM: encabezados, listas, tablas, código y blockquotes.
- `DOMPurify` sanitiza el HTML con allowlist; se bloquean scripts, imágenes y atributos no permitidos.
- `.markdown-body` aplica estilos reales; antes `prose` no tenía efecto porque no estaba instalado el plugin de tipografía.
- El original Markdown se conserva y se sirve por el endpoint de contenido; el texto indexado se normaliza aparte.
- El render es seguro para enlaces (`href`) y no ejecuta HTML no confiable.

**Límites**

- No hay resaltado de sintaxis en bloques de código.
- Las imágenes Markdown se eliminan por la allowlist de DOMPurify; es una decisión de seguridad, no un fallo.
- Enlaces externos no llevan `rel="noopener noreferrer"` ni indicación de salida.
- El HTML se genera en el cliente; documentos muy grandes pueden tardar en renderizar.
- `marked` no es un renderizador de Markdown completo de CommonMark con extensiones; cubre GFM razonablemente.

**Alternativas**

| Opción | Ventaja | Coste/riesgo | Veredicto |
| --- | --- | --- | --- |
| `marked` + `DOMPurify` (actual) | Ligero, seguro, compatible con Angular | Sin syntax highlighting | **Mantener**; añadir highlighting si se necesita |
| `ngx-markdown` | Integración Angular, Prism | Wrapper adicional, compatibilidad con Angular 22 a validar | No necesario |
| `markdown-it` + Shiki | Mejor código y extensiones | Más peso y configuración | Solo si se exige código resaltado |
| Render en backend a HTML | Centraliza sanitización | Acopla el visor al backend y añade caché | No necesario para v1 |

## 4. Cambios aplicados en esta revisión

1. **Estado de búsqueda en la URL.** La búsqueda guarda `q`, `category`, `author`, `tags` y `page` en query params. Al volver desde el visor con el historial del navegador se recuperan la búsqueda, los filtros y la página.
2. **Botón de volver del visor.** Usa `Location.back()` y cae a `/search` si no hay historial.
3. **Markdown con estilos reales.** Se sustituyó la clase `prose` (sin plugin) por `.markdown-body` con estilos para encabezados, listas, tablas, código, blockquotes, enlaces y `hr`.
4. **Capa de texto en PDF.** Se superpone la capa de PDF.js al canvas para permitir selección/copia; se limpia al cambiar de página o zoom.
5. **Navegación de PDF por número de página.** Input numérico con validación y límites.
6. **Copia de TXT.** Botón que usa `navigator.clipboard`.
7. **BOM en TXT/Markdown.** El visor elimina el BOM al inicio antes de mostrar/renderizar.
8. **DOCX fuera de la v1.** Se actualizaron requerimientos, arquitectura, decisiones y README para que DOCX no sea criterio de aceptación.

## 5. Veredicto

Para los requisitos del PDF original, el stack es **suficiente y adecuado**:

- PDF.js directo cubre la visualización fluida y el control del PDF sin dependencias que limiten Angular.
- El visor TXT propio es la opción más segura y simple.
- `marked` + `DOMPurify` cubre Markdown con un coste bajo y buena seguridad.

No recomiendo cambiar a wrappers pesados (`ngx-extended-pdf-viewer`, `ngx-markdown`) para la v1. Añaden dependencias y superficie de configuración sin mejorar el requisito principal de “vista dedicada, contenido y metadatos”.

## 6. Pendientes opcionales

- Búsqueda dentro del PDF y resaltado de coincidencias (si el evaluador lo pide).
- Scroll continuo y miniaturas de páginas.
- Resaltado de sintaxis en Markdown.
- Pruebas e2e de navegador para la capa de texto y el visor Markdown.
- Verificación visual de la capa de texto PDF en Chrome/Edge/Firefox.
- Configuración de CSP si se despliega con cabeceras estrictas.

Ninguno de estos puntos es requisito del enunciado original.
