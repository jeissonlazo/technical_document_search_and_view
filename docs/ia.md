# Uso de Inteligencia Artificial

**Proyecto:** Buscador y visor de documentos técnicos  
**Versión:** 1.0  
**Fecha:** 2026-10-28

Este documento registra de forma transparente qué herramientas de IA se usaron, para qué, con qué prompts y cómo se validó el resultado. Debe actualizarse si se incorporan nuevas herramientas o si cambia el alcance.

## 1. Herramientas utilizadas

| Herramienta | Versión / modelo | Uso principal |
| --- | --- | --- |
| DeepSeek Harness | Modelo DeepSeek Flash | Análisis de requisitos, revisión de arquitectura, validación de librerías, generación de esqueleto de código y documentación |
| Completar por el candidato | — | Añadir aquí ChatGPT, Claude, Copilot, Cursor, Gemini u otras herramientas que se hayan usado |

No se pegaron documentos reales, credenciales, claves de R2 ni datos personales en los prompts. Los ejemplos de prompts se describen de forma resumida.

## 2. Casos de uso

1. **Lectura y contraste de requisitos.** Se usó IA para comparar el enunciado de la prueba con `docs/architecture.md` y `docs/decisiones-tecnicas.md`, detectar contradicciones (por ejemplo, `RECEIVED` frente a `PROCESANDO`) y proponer correcciones.
2. **Diseño de arquitectura.** Se revisaron alternativas de motor de búsqueda, cola, SSE, autenticación, almacenamiento y visores. Las decisiones finales fueron confirmadas por el candidato.
3. **Validación de librerías.** Se consultaron fuentes públicas para verificar compatibilidad de Optimus UI, Spartan NG, Tiptap, `docx-editor`, `docx-preview` y sus licencias. Se descartaron las opciones que no encajaban con Angular o con el modo solo lectura.
4. **Redacción de requerimientos.** Se incorporaron R2 como almacenamiento principal, autenticación mínima con API keys, i18n, temas y criterios de aceptación.
5. **Generación de esqueleto.** Se creó la estructura del monorepo, entidades Prisma, módulos NestJS, servicios Angular y archivos de Docker/Compose.
6. **Pruebas y documentación.** Se generaron pruebas unitarias del extractor y borradores de README, arquitectura y este documento.

## 3. Prompts clave

Estos son ejemplos resumidos; no incluyen datos sensibles.

### 3.1. Revisión de viabilidad

> “Lee los archivos del workspace y verifica su viabilidad para el proyecto que plantea el enunciado. Señala contradicciones, requisitos faltantes y riesgos de plazo.”

**Refinamiento:** se añadió el enunciado en PDF y se pidió una tabla de cumplimiento por historia de usuario.

### 3.2. Validación de librerías

> “Valida si `docx-editor` se puede usar en Angular y si permite solo lectura. Compara con `docx-preview` y `mammoth`, indicando licencia, compatibilidad y coste.”

**Resultado:** `docx-editor` es React/Vue y está orientado a edición; se eligió `docx-preview` para el visor y `mammoth` para extracción.

### 3.3. UI y versiones

> “Compara Optimus UI y Spartan NG para Angular 22. Indica peer dependencies, componentes disponibles, theming y riesgos de mantenimiento.”

**Resultado:** Spartan NG 1.8.3 declara Angular `>=21 <23`; se adoptó Spartan NG y se anotó el riesgo del CLI con Angular 22.

### 3.4. Almacenamiento

> “Añade Cloudflare R2 como almacenamiento principal de originales y texto normalizado. Define claves, URLs firmadas, CORS, Range, ciclo de vida y variables de entorno.”

**Resultado:** se actualizaron los tres documentos y se generó la interfaz `ObjectStorage` con implementación R2.

### 3.5. Generación del esqueleto

> “Genera un monorepo con backend NestJS, frontend Angular 22 + Spartan NG, Prisma, BullMQ, Elasticsearch, SSE, autenticación mínima y R2. Incluye Docker Compose y README.”

**Resultado:** estructura `backend/`, `frontend/`, `packages/shared/`, `docker-compose.yml` y documentación asociada.

## 4. Validación humana

La validación se realizó en dos niveles:

1. **Decisiones de producto y arquitectura:** el candidato confirmó el uso de R2, la autenticación mínima con sign up/sign in y API keys, y Spartan NG. La IA propuso alternativas y señaló riesgos, pero las decisiones finales fueron humanas.
2. **Revisión técnica:** se contrastaron las afirmaciones sobre librerías con su documentación pública y se corrigieron puntos como:
   - el estado inicial `RECEIVED` frente a `PROCESANDO` de HU-01;
   - el resaltado obligatorio en fragmentos de resultados frente al resaltado dentro del visor DOCX;
   - el alcance de DOCX y la conveniencia de `docx-preview` frente a un editor WYSIWYG;
   - la compatibilidad de Spartan NG con Angular 22 y el riesgo del CLI.

**Validación ejecutada:** `pnpm install`, `prisma generate`, `prisma migrate dev`, seed, build de NestJS, build de Angular y pruebas unitarias (16/16). El stack Docker se levantó con `docker compose up --build -d`; API healthy, frontend servido por nginx, login/sesión y SSE verificados. R2 quedó operativo en `katabuscador` y se probó el flujo completo con TXT, PDF y Markdown, además de `POST /api/documents/batch` con un archivo aceptado y uno rechazado sin afectar al primero. DOCX se probó como soporte opcional, fuera de la aceptación de la v1.

**Pendiente de validación humana:** rotar el token de Cloudflare compartido en el chat, crear un R2 API token dedicado para producción, configurar CORS si se usan URLs firmadas directas y completar pruebas e2e de navegador/medición de latencia.

## 5. Limitaciones y riesgos

- La IA puede proponer versiones de dependencias que no existan o que hayan cambiado; se deben verificar con `pnpm install` y el registro de npm.
- El código generado es un esqueleto y requiere revisión, pruebas y ajustes de integración.
- Las decisiones de seguridad (CSRF, cookies, API keys, R2) deben revisarse con un threat model antes de producción.
- Los prompts no sustituyen la lectura del enunciado ni la validación con el evaluador.
- Las métricas de latencia y la fidelidad de los visores deben medirse con documentos reales.

## 6. Conclusión

La IA se usó como apoyo para análisis, contraste de decisiones, generación de esqueleto y documentación. La responsabilidad sobre la arquitectura, el código y las decisiones finales es del candidato. Este documento se actualizará cuando se ejecuten las pruebas y se complete la validación humana.
