# Requerimientos del Frontend
## Buscador y Visor de Documentos Técnicos

**Versión:** 1.1  
**Estado:** Borrador funcional actualizado; stack y visores PDF/TXT/Markdown definidos. DOCX queda fuera de la v1 porque no es un requisito del enunciado original.
**Frontend:** Angular 22 + TypeScript + Spartan NG

---

## 1. Objetivo

Desarrollar una aplicación web responsive que permita cargar documentos técnicos, gestionar sus metadatos, buscar su contenido mediante texto completo y consultar los documentos desde el navegador sin requerir una descarga manual.

El frontend se comunicará con una API NestJS. La API coordinará el acceso a PostgreSQL, Elasticsearch, Redis/BullMQ y Cloudflare R2, de acuerdo con la arquitectura definida para el proyecto.

La aplicación será privada, tendrá interfaz en español e inglés, ofrecerá temas claro y oscuro y mostrará en tiempo real el progreso de carga e indexación.

## 2. Tecnologías y arquitectura

### 2.1. Tecnologías seleccionadas

| Área | Tecnología o decisión |
|---|---|
| Framework | Angular 22 |
| Lenguaje | TypeScript |
| Biblioteca de UI | Spartan NG (`@spartan-ng/brain` + CLI/helm), Tailwind CSS 4 |
| PDF | PDF.js |
| TXT | Visor de texto plano propio |
| Markdown | Visor de Markdown renderizado y sanitizado |
| DOCX | Fuera de la v1; el código existente queda como soporte opcional/experimental |
| Editor enriquecido | Tiptap no requerido para la primera versión; evaluado para edición futura, no para el visor DOCX |
| API | NestJS |
| Búsqueda | Elasticsearch mediante la API |
| Actualizaciones de estado | Server-Sent Events (SSE) |
| Autenticación | Registro e inicio de sesión con email/contraseña; sesión por cookie HttpOnly; API keys |
| Almacenamiento de originales | Cloudflare R2 (bucket privado), gestionado por el backend; MinIO opcional solo para tests offline |
| Idiomas | Español e inglés |
| Temas | Claro y oscuro |
| Adaptabilidad | Escritorio, tablet y móvil |

### 2.2. Principios de arquitectura

- Utilizar componentes standalone y carga diferida de funcionalidades cuando resulte conveniente.
- Separar componentes visuales, servicios HTTP, modelos, gestión de estado y lógica de negocio.
- Centralizar las llamadas a la API en servicios tipados.
- Mantener la lógica de búsqueda e indexación en el backend.
- No conectar Angular directamente a PostgreSQL, Redis ni Elasticsearch.
- No exponer credenciales de Cloudflare R2 en el cliente.
- Evitar que el estado crítico de un documento dependa únicamente de la memoria del navegador.
- Mantener desacoplados los componentes visuales de la implementación concreta de cada visor.
- Usar Spartan NG (primitivas headless + estilos helm copiados al proyecto) sobre Angular CDK y Tailwind CSS 4; no acoplar la aplicación a una librería que limite la versión de Angular.
- Tratar el visor DOCX como un renderizador de solo lectura (`docx-preview`), no como un editor WYSIWYG.
- Gestionar la sesión con cookie HttpOnly y no almacenar tokens de sesión en `localStorage`; las API keys se muestran una sola vez y se revocan desde la UI.
- No recibir credenciales de R2 en el cliente; el contenido se obtiene por la API o por una URL firmada de corta duración.

## 3. Requerimientos funcionales confirmados

### 3.1. Búsqueda de documentos

**FE-001.** El sistema deberá ofrecer un campo de búsqueda de texto completo.

**FE-002.** Los resultados deberán mostrar el título del documento, los metadatos relevantes y fragmentos que ayuden a identificar las coincidencias.

**FE-003.** El sistema deberá permitir filtrar los resultados por los metadatos disponibles y autorizados.

**FE-004.** Los resultados deberán admitir paginación y ordenamiento según las capacidades expuestas por la API.

**FE-005.** La interfaz deberá resaltar los términos coincidentes en los fragmentos de resultados cuando la API proporcione información suficiente.

**FE-006.** El sistema deberá gestionar los estados de carga, resultados vacíos, errores y reintentos.

**FE-007.** La búsqueda deberá evitar solicitudes excesivas mediante debounce y cancelación de solicitudes obsoletas cuando sea aplicable.

**FE-008.** La interfaz deberá contribuir al objetivo de latencia de búsqueda de 400 ms a 1 segundo. El cumplimiento se verificará mediante pruebas de rendimiento con datos y carga representativos.

### 3.2. Visualización de documentos

**FE-009.** El usuario deberá poder abrir y consultar un documento desde los resultados sin tener que descargarlo manualmente.

**FE-010.** La aplicación deberá identificar el formato admitido y seleccionar el visor correspondiente.

**FE-011.** Los formatos iniciales serán PDF, TXT y Markdown. DOCX no forma parte de la v1.

**FE-012.** El visor deberá mostrar el título y los metadatos disponibles del documento.

**FE-013.** El usuario deberá poder cerrar el visor y regresar a los resultados conservando la búsqueda, los filtros y la paginación siempre que sea posible.

**FE-014.** El sistema deberá informar si el documento no está disponible, no puede visualizarse o requiere autorización.

**FE-015.** El visor deberá gestionar errores de red, tiempos de espera y documentos demasiado grandes sin bloquear toda la aplicación.

**FE-016.** Los documentos deberán mostrarse en modo de solo lectura.

**FE-017.** El contenido de los documentos no deberá interpretarse como código ejecutable ni permitir la ejecución de scripts o HTML no confiable.

#### Requisitos específicos por formato

**PDF**

- Utilizar PDF.js como motor de visualización.
- Incorporar navegación por páginas y controles de zoom.
- Permitir selección y copia de texto cuando el PDF lo permita, mediante la capa de texto de PDF.js.
- La búsqueda dentro del documento es una mejora opcional/fase 2; el enunciado original no la exige.
- Gestionar la carga de documentos grandes y los errores de lectura.
- No asumir que todos los PDF contienen texto seleccionable.

**TXT**

- Mostrar texto plano con tipografía legible y ajuste de línea.
- Permitir selección y copia de texto.
- Gestionar codificaciones y caracteres no válidos de manera controlada.
- Evitar interpretar el contenido como HTML.

**Markdown**

- Mostrar títulos, listas, tablas y bloques de código cuando el contenido lo permita.
- Sanitizar el contenido renderizado.
- Controlar los enlaces externos y evitar la ejecución de contenido no confiable.
- Mantener una presentación legible en pantallas pequeñas.

**DOCX (fuera de alcance v1)**

No forma parte de los requisitos del enunciado original. El código existente (`docx-preview` + `mammoth`) queda como soporte opcional/experimental y no se evalúa en la v1. Las notas de Tiptap y `docx-editor` se conservan en la sección 6.2.

### 3.3. Carga de documentos

**FE-018.** El usuario deberá poder seleccionar varios archivos para cargarlos en un lote.

**FE-019.** La interfaz deberá validar preliminarmente los formatos admitidos antes de iniciar la transferencia. La validación definitiva corresponderá al backend.

**FE-020.** El usuario deberá introducir los metadatos obligatorios antes de confirmar la carga.

**FE-021.** La interfaz deberá mostrar el progreso de transferencia de cada archivo.

**FE-022.** La carga de archivos de un mismo lote será secuencial: la siguiente transferencia comenzará cuando el backend confirme que el archivo anterior se ha almacenado y que el trabajo de procesamiento ha sido aceptado de manera fiable.

**FE-023.** La interfaz no deberá esperar a que termine la indexación de un documento para iniciar la transferencia del siguiente.

La API puede exponer `POST /api/documents/batch` para clientes externos, pero Angular mantiene la regla de una solicitud por archivo y subida secuencial; no usa el endpoint batch.

**FE-024.** El sistema deberá mostrar el estado individual de cada documento:

- `PROCESSING` (estado inicial del `202`)
- `RECEIVED` (compatibilidad; no se usa como estado inicial en la v1)
- `INDEXED`
- `ERROR`

El backend devuelve `PROCESSING` como estado inicial y `trackingId` en la respuesta de carga.

**FE-025.** El fallo de un archivo no deberá cancelar automáticamente el resto del lote.

**FE-026.** La interfaz deberá mostrar un resumen del lote con archivos completados, en proceso y fallidos.

**FE-027.** Los errores deberán presentarse mediante mensajes comprensibles, indicando si es posible reintentar la operación.

### 3.4. Notificaciones de procesamiento

**FE-028.** La aplicación deberá recibir actualizaciones de estado mediante SSE.

**FE-029.** Los cambios de estado deberán reflejarse en la interfaz sin necesidad de recargar la página.

**FE-030.** La conexión SSE deberá poder restablecerse tras una interrupción.

**FE-031.** Después de una reconexión, la aplicación deberá consultar el estado actual de los documentos para recuperar posibles eventos perdidos.

**FE-032.** El estado persistido en el backend será la referencia definitiva; la interfaz no deberá asumir que un documento está indexado solo porque recibió un evento.

### 3.5. Metadatos

**FE-033.** El formulario de carga deberá admitir los metadatos técnicos definidos para el modelo de documentos.

**FE-034.** Los metadatos deberán validarse y presentarse con mensajes de error claros.

**FE-035.** Los campos obligatorios, límites de longitud, formatos y reglas de validación deberán proceder del contrato acordado con el backend.

**FE-036.** Los metadatos que deban ser filtrables deberán representarse de manera coherente en los formularios de carga y en los filtros de búsqueda.

### 3.6. Acceso privado

**FE-037.** La aplicación deberá ofrecer registro (sign up) e inicio de sesión (sign in) con email y contraseña, y exigir autenticación para las funcionalidades privadas.

**FE-038.** Las acciones y documentos accesibles deberán respetar los permisos aplicados por el backend. En la primera versión no se implementan roles diferenciados: todo usuario autenticado puede cargar, buscar y visualizar.

**FE-039.** El cliente deberá gestionar de forma controlada la expiración de sesión, el cierre de sesión y las respuestas de acceso denegado (401/403).

**FE-040.** El frontend no deberá exponer claves de almacenamiento, credenciales ni URL privadas permanentes.

**FE-041.** El acceso al contenido de un documento deberá pasar por un mecanismo autorizado, como un endpoint de la API o una URL firmada de duración limitada generada por el backend.

**FE-056.** El usuario deberá poder crear, listar, copiar una vez y revocar API keys personales para acceso programático; la clave completa no deberá volver a mostrarse después de crearla.

**FE-057.** La conexión SSE deberá autenticarse con la sesión del usuario mediante cookie HttpOnly; no se deberán incluir tokens secretos en la URL.

**FE-058.** El registro deberá poder restringirse mediante invitación o bandera de entorno, porque la aplicación es privada; el modo abierto solo se usará en desarrollo o demostración.

### 3.7. Diseño responsive

**FE-042.** La aplicación deberá funcionar en escritorio, tablet y móvil.

**FE-043.** Los formularios, filtros, resultados y visor deberán adaptarse al ancho disponible.

**FE-044.** En pantallas pequeñas, los filtros podrán mostrarse en un panel desplegable y el visor podrá ocupar la mayor parte de la pantalla.

**FE-045.** Las tablas y los metadatos extensos deberán contar con una presentación utilizable en dispositivos móviles.

### 3.8. Temas e idiomas

**FE-046.** La interfaz deberá ofrecer tema claro y oscuro.

**FE-047.** El tema elegido deberá aplicarse consistentemente a los componentes de Spartan NG (helm) y a los componentes personalizados mediante variables CSS/Tailwind.

**FE-048.** La interfaz deberá estar disponible en español e inglés.

**FE-049.** Los textos, mensajes de error, estados, fechas y etiquetas visibles deberán centralizarse mediante una estrategia de internacionalización.

**FE-050.** El cambio de idioma deberá actualizar la interfaz sin requerir una recarga completa de la aplicación, siempre que la solución de internacionalización elegida lo permita.

### 3.9. Accesibilidad y calidad

**FE-051.** Los componentes deberán permitir navegación por teclado.

**FE-052.** Los controles deberán contar con etiquetas y estados accesibles.

**FE-053.** Los mensajes de procesamiento y error deberán comunicarse mediante mecanismos accesibles.

**FE-054.** La aplicación deberá incluir pruebas unitarias de servicios y componentes, pruebas de integración y pruebas end-to-end de los flujos principales.

**FE-055.** Se deberán registrar errores de interfaz y métricas de rendimiento sin incluir contenido sensible de los documentos.

### 3.10. Almacenamiento en Cloudflare R2

**FE-059.** Los originales y el texto normalizado deberán almacenarse en un bucket privado de Cloudflare R2; el disco local no será la fuente de verdad.

**FE-060.** Cada documento tendrá claves de objeto estables, por ejemplo `documents/{userId}/{documentId}/original.{ext}` y `documents/{userId}/{documentId}/normalized.txt`; PostgreSQL conservará la clave, el tamaño, el MIME y el checksum.

**FE-061.** El frontend no recibirá credenciales de R2. El contenido se obtendrá mediante un endpoint autorizado de la API o una URL firmada de corta duración generada por el backend.

**FE-062.** R2 deberá permitir CORS y peticiones `Range` para PDF.js, exponer `Accept-Ranges`/`Content-Range` y servirse con `Content-Disposition: inline`; si no se configura, el binario se servirá a través de la API.

**FE-063.** Se definirán reglas de ciclo de vida para objetos incompletos, retención/versionado y borrado; la eliminación en R2 deberá ser consistente con el registro de PostgreSQL.

**FE-064.** Si R2 no está disponible o el objeto no existe, la interfaz mostrará un error comprensible y permitirá reintentar cuando sea transitorio (`STORAGE_UNAVAILABLE`, `STORAGE_OBJECT_NOT_FOUND`).

## 4. Decisiones nuevas incorporadas

Las siguientes decisiones se incorporan a esta versión a partir de las preferencias confirmadas:

1. **Solo lectura:** la aplicación no editará el contenido original de los documentos en la primera versión.
2. **Tres formatos:** PDF, TXT y Markdown. DOCX queda fuera de la v1 por no ser un requisito del enunciado original.
3. **Metadatos técnicos:** se contemplan título, descripción, etiquetas, categoría, versión y autor como propuesta inicial.
4. **Acceso privado mínimo:** registro e inicio de sesión con email/contraseña, sesión por cookie HttpOnly y API keys personales; sin roles ni permisos diferenciados en la primera versión.
5. **Responsive completo:** se incluye soporte para escritorio, tablet y móvil.
6. **Tema claro y oscuro:** ambos modos forman parte de la interfaz.
7. **Búsqueda con filtros:** la experiencia inicial incluirá fragmentos coincidentes, resaltado y filtros.
8. **Español e inglés:** se requiere internacionalización desde la primera versión.
9. **Spartan NG:** se adopta como base de UI (headless + helm, Angular CDK y Tailwind CSS 4) para mantener compatibilidad con Angular 21/22 y evitar el acoplamiento a una versión fija.
10. **Tiptap:** queda fuera de la primera versión porque no se requiere edición de documentos.
11. **Cloudflare R2:** almacenamiento principal de originales y texto normalizado, en bucket privado y con acceso mediante URL firmada o API.

## 5. Requerimientos técnicos no funcionales

- La aplicación deberá utilizar TypeScript con tipos explícitos para los contratos de API.
- Las operaciones de red deberán contemplar cancelación, errores y tiempos de espera.
- La UI usará Spartan NG + Tailwind CSS 4; no se acoplará a una librería que imponga una versión fija de Angular.
- La sesión se gestionará con cookie HttpOnly; las API keys se muestran una vez y no se persisten en el cliente.
- El bucket de R2 será privado; el contenido se obtiene por la API o por una URL firmada de corta duración, nunca por una URL pública permanente.
- R2 deberá permitir CORS y `Range` para el visor PDF; si no, la API actuará como proxy del binario.
- Los componentes de visualización deberán cargarse de manera diferida cuando sea conveniente.
- Los documentos grandes no deberán cargarse íntegramente en memoria sin evaluar el impacto.
- La búsqueda y la visualización deberán respetar las autorizaciones del usuario.
- El contenido renderizado deberá sanitizarse para reducir riesgos de XSS.
- El sistema deberá evitar dependencias innecesarias entre la UI y el proveedor de almacenamiento.
- La interfaz deberá poder desplegarse como aplicación estática independiente de la API.

## 6. Decisiones pendientes

Los siguientes puntos recogen lo ya resuelto y lo que sigue pendiente antes de cerrar la especificación técnica y comenzar la implementación completa.

### 6.1. Compatibilidad de Spartan NG y Angular

- **Resuelto:** `@spartan-ng/brain` 1.8.3 declara compatibilidad con Angular `>=21.0.0 <23.0.0`, Angular CDK `>=21 <23` y Tailwind CSS `>=4`. Se usará Angular 22 y se fijarán versiones exactas.
- **Riesgo:** el CLI 1.8.3 usa `@schematics/angular` 21.2.14; validar `ng add`/instalación en Angular 22. Si no es compatible, copiar los componentes helm manualmente o fijar Angular 21.
- **Resuelto:** Spartan NG cubre tabla de datos, diálogo, drawer, select, paginación, toast (sonner), progreso, skeleton, tabs e inputs. No incluye un componente de carga de archivos: se implementa con `input[type=file]` + drag & drop.
- **Pendiente:** validar en un proyecto real los componentes que se copian al repositorio (helm), el preset de Tailwind 4 y el modo oscuro; definir la política de actualización de los componentes copiados.
- **Descartado:** Optimus UI. Requiere Angular 22.1.4+ (v2.0.2) o Angular 21 (v1.0.2), y es un fork comunitario de PrimeNG; no se usa para evitar atar la versión de Angular.

### 6.2. DOCX opcional (fuera de v1)

- **Resuelto:** visor de solo lectura con `docx-preview` en el navegador. El backend extrae texto con `mammoth` para búsqueda e indexación.
- **Descartado:** `docx-editor` (EigenPal). Es una librería de edición WYSIWYG para React y Vue, sin adaptador Angular; usarla obligaría a incrustar React o a construir un visor sobre su core, con más peso y complejidad de la necesaria. Además, sus módulos Pro (tracked changes, comentarios, colaboración) usan una licencia comercial.
- **Alternativa evaluada:** Tiptap + `ngx-tiptap` (bindings Angular comunitarios, MIT) evita incrustar React, pero Tiptap no es un visor DOCX: la importación DOCX es `@tiptap-pro/extension-import-docx`, disponible en el plan comercial Start, en beta y con conversión en Tiptap Cloud. Sin esa extensión habría que convertir con `mammoth` y renderizar HTML, con pérdida de layout. Se descarta para la v1 de solo lectura; se reconsideraría si se añade edición.
- **Pendiente:** definir los elementos que se conservan (tablas, imágenes, encabezados, listas, estilos), el límite de tamaño y el comportamiento ante DOCX complejos; documentar las limitaciones de `docx-preview`. Si se añade edición, evaluar Tiptap + Import DOCX (Pro/cloud) frente a `docx-editor`, incluyendo coste, licencia y privacidad.
- **Resuelto:** la conversión de visualización es en el navegador; la extracción de texto es en el backend. No se convierte DOCX a PDF en la primera versión.

### 6.3. Metadatos

- **Resuelto:** el modelo incluye título, descripción, etiquetas, categoría, versión y autor. `título` es obligatorio; el resto es opcional en la primera versión.
- **Resuelto:** `versión` es un campo de metadatos (string), no un historial de versiones.
- **Pendiente:** definir si habrá metadatos personalizados; en la primera versión se filtran categoría, etiquetas, autor y versión.

### 6.4. Autenticación y autorización

- **Resuelto:** registro e inicio de sesión con email/contraseña; contraseña con Argon2id; sesión por cookie HttpOnly, `Secure` y `SameSite=Lax`; cierre de sesión; `GET /api/auth/me`.
- **Resuelto:** API keys personales para acceso programático; se muestran una vez, se guardan como hash, se pueden revocar y opcionalmente expiran.
- **Resuelto:** SSE se autentica con la misma cookie de sesión; no se usan tokens en la URL.
- **Resuelto:** sin roles ni permisos diferenciados en la primera versión; todo usuario autenticado puede cargar, buscar y visualizar.
- **Pendiente:** decidir si el registro es abierto, por invitación o limitado por bandera de entorno; definir verificación de email, recuperación de contraseña y política de bloqueo por intentos fallidos (fuera del alcance inicial).

### 6.5. Experiencia de búsqueda

- **Propuesta:** 20 resultados por página; orden por relevancia, título y fecha; filtros por categoría, etiquetas, autor y versión.
- **Resuelto:** el resaltado obligatorio es el de los fragmentos de resultados (FE-005), no el del cuerpo del documento. En los formatos de la v1 se resalta en los snippets devueltos por Elasticsearch; el resaltado dentro del visor es una mejora opcional y no se garantiza por página, porque DOCX no almacena páginas estables.
- **Pendiente:** si se requiere enlace profundo a la coincidencia, definir una vista de “texto extraído” con `<mark>`; para PDF, usar la página de PDF.js. No prometer página exacta en DOCX.
- **Propuesta:** estado vacío con sugerencias y acción para limpiar filtros; errores de búsqueda con reintento.
- **Pendiente:** acordar las métricas y condiciones de las pruebas de rendimiento (p95 backend y tiempo percibido).

### 6.6. Límites y carga de archivos

- **Propuesta:** 25 MB por archivo, 20 archivos por lote y 3 reintentos adicionales; validar estos valores con documentos reales antes de fijarlos como límite.
- **Propuesta:** deduplicación por SHA-256; si el contenido coincide, mostrar el documento existente y no crear otro.
- **Propuesta:** aviso `beforeunload` si hay cargas en curso; la cola no se persiste y los documentos ya aceptados se recuperan por ID.
- **Pendiente:** confirmar límites definitivos y política de cuarentena/antivirus para archivos subidos.
- **Pendiente:** definir ciclo de vida de R2 (objetos incompletos, retención, versionado, borrado) y TTL de las URLs firmadas.

### 6.7. Internacionalización y temas

- **Propuesta:** idioma inicial según `navigator.language` (es → español; resto → inglés), con selector manual y persistencia en `localStorage`.
- **Propuesta:** tema inicial según `prefers-color-scheme`, con selector manual y persistencia; aplicar `data-theme`/clase `dark` antes del bootstrap para evitar parpadeo.
- **Resuelto:** diccionarios `es`/`en` con un servicio propio basado en signals (sin dependencia de i18n de Angular, que es build-time) o Transloco si se valida con Angular 22. Los errores del backend se traducen por `code` + `params`.

### 6.8. Pruebas y accesibilidad

- **Propuesta:** objetivo WCAG 2.1 AA; navegadores Chrome, Edge, Firefox y Safari en sus dos últimas versiones; viewports de 360, 768 y 1280 px.
- **Propuesta:** pruebas unitarias con Jest/TestBed, integración con MSW y e2e con Playwright; auditoría automática con axe-core.
- **Propuesta:** límite de 20 MB para las pruebas de visualización en CI; medir el rendimiento móvil con Lighthouse.
- **Pendiente:** criterios formales de aceptación de rendimiento en dispositivos móviles.

## 7. Criterios generales de aceptación

La primera versión se considerará funcional cuando:

1. Un usuario autorizado pueda cargar documentos PDF, TXT y Markdown.
2. La carga muestre progreso y estados individuales de procesamiento.
3. Los documentos indexados puedan localizarse mediante búsqueda de texto completo y filtros.
4. El usuario pueda abrir los documentos admitidos en modo de solo lectura.
5. Los errores de carga, visualización e indexación se presenten de forma comprensible.
6. Los estados de procesamiento se actualicen mediante SSE y se recuperen tras una reconexión.
7. La interfaz funcione en escritorio, tablet y móvil.
8. Los temas claro y oscuro y los idiomas español e inglés estén disponibles.
9. Los accesos privados (registro, inicio de sesión, sesión y API keys) y el contenido renderizado se gestionen de forma segura.
10. Las pruebas de rendimiento permitan evaluar el objetivo de búsqueda acordado.
11. Los originales y el texto normalizado se almacenen en R2, con claves estables, checksum en PostgreSQL y acceso autorizado mediante URL firmada o API.

## 8. Fuera del alcance inicial

- Edición del contenido original de documentos.
- Edición de PDF, anotaciones o modificación de sus páginas.
- Colaboración en tiempo real.
- OCR obligatorio de documentos escaneados.
- Compatibilidad con formatos distintos de PDF, TXT y Markdown; DOCX queda fuera de la v1.
- Implementación de la lógica de indexación en el frontend.
- Edición de DOCX con un editor WYSIWYG; la primera versión es solo lectura.
- Verificación de email, recuperación de contraseña y roles/permisos diferenciados.

Estos elementos podrán evaluarse en versiones posteriores según las necesidades y los resultados de la primera implementación.
