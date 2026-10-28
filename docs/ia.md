# Uso de inteligencia artificial

## Herramientas utilizadas

- **OpenAI Codex (asistente de IA en esta conversación):** lectura y análisis del enunciado de la prueba, organización de requisitos, discusión de decisiones técnicas y redacción/actualización de `docs/decisiones-tecnicas.md` y `docs/architecture.md`.
- **Herramientas auxiliares de lectura de PDF:** se intentó extraer texto del PDF con `pdfplumber`; al no contener texto seleccionable, se renderizaron sus páginas y se revisaron visualmente. Estas herramientas ayudaron a leer el documento; no generaron código del producto.

No se usó IA para generar código de aplicación, datos de prueba, resultados de rendimiento ni resultados de pruebas automatizadas durante esta etapa de definición.

## Casos de uso de IA

1. **Comprender y desglosar el enunciado:** convertir las historias de usuario, restricciones y criterios de aceptación de la prueba en una lista de tareas.
2. **Explorar decisiones técnicas:** contrastar alternativas de búsqueda, carga secuencial, procesamiento asíncrono, estados, notificaciones SSE, almacenamiento y escalabilidad.
3. **Redactar documentación técnica:** preparar borradores de decisiones, flujos, catálogos de errores, criterios de aceptación y evolución de arquitectura.
4. **Revisar consistencia entre requisitos:** detectar contradicciones al cambiar decisiones, como el límite de cantidad del lote, los estados persistidos y el número de reintentos.

## Prompts relevantes

Los siguientes ejemplos son solicitudes representativas hechas durante la conversación; se incluyen resumidos para registrar su propósito, no como especificación independiente:

- “Lee este documento y genera una lista de cosas por hacer para llevarlo a cabo de la mejor manera.”
- “Define parámetros técnicos para la capacidad de carga y documenta las decisiones en `docs/`.”
- “La carga masiva debe ser administrada por el frontend como una cola; no empezar un archivo hasta que termine la subida del anterior.”
- “Define formatos admitidos y qué hacer si un PDF no permite extraer texto.”
- “Diseña los estados, causas descriptivas de error y la regla de que un fallo no bloquee la subida de más archivos.”
- “Documenta el stack, el flujo de carga a búsqueda, la estrategia indexada y la escalabilidad por componente.”
- “Valida que `docs/architecture.md` incluya diagrama, razones del stack, tiempo real y escalabilidad.”

Las propuestas se refinaron mediante instrucciones posteriores. En particular, se retiró el límite inicial sugerido de 50 MiB porque no provenía del enunciado; se cambió el lote de cantidad sin límite a un máximo configurable pendiente de medición; se separó la subida secuencial del procesamiento en workers; y se actualizaron estados y política de reintentos según las decisiones posteriores.

## Revisión y validación humana

- El PDF original fue revisado visualmente página por página después de que la extracción automática devolviera páginas sin texto.
- Las propuestas de capacidad se identificaron como provisionales cuando el enunciado no daba valores. No se presentaron cifras de rendimiento ni límites como resultados medidos.
- Las decisiones principales fueron revisadas y dirigidas por el usuario a través de correcciones sucesivas: cola de frontend con una subida a la vez, errores aislados por archivo, estados `RECEIVED`/`PROCESSING`/`INDEXED`/`ERROR`, hasta tres reintentos adicionales para errores transitorios y Cloudflare R2 para entornos desplegados.
- Se revisó la consistencia documental buscando referencias antiguas a límites, estados y reintentos después de actualizar las decisiones.
- La IA produjo borradores; las decisiones de alcance y tecnología documentadas reflejan las instrucciones y aprobaciones expresas del usuario, no una autoridad automática del modelo.

## Límites y responsabilidad

- Las recomendaciones de arquitectura y escalabilidad son propuestas de diseño, no evidencia de capacidad. La cantidad máxima por lote, el tamaño máximo por archivo, la concurrencia y la latencia real requieren pruebas con un conjunto representativo y una infraestructura definida.
- La interpretación de objetivos p95 y los presupuestos de latencia son propuestas de ingeniería; el enunciado no especifica percentiles ni todas las condiciones de medición y deben validarse con el evaluador.
- No se ejecutaron pruebas del sistema ni mediciones de carga durante esta fase de documentación.
- El usuario/equipo responsable debe revisar las decisiones antes de implementarlas y validar versiones, costos, seguridad y configuración de los servicios para el entorno concreto.
