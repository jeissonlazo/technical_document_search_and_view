# Decisiones técnicas

Documento vivo para registrar las decisiones del buscador y visor de documentos técnicos. Los límites numéricos que todavía no se han acordado se mantienen pendientes; no se consideran requisitos hasta que se validen contra los documentos y el entorno reales.

## 1. Alcance de carga

La carga acepta TXT, PDF con texto extraíble y Markdown. Se permite la extensión `.md` y `.markdown`. TXT y Markdown deben ser texto UTF-8; Markdown se indexa a partir de su contenido textual, conservando el original para mostrarlo de forma legible. La aceptación no se determina solo por la extensión o el `Content-Type`: el backend valida el contenido real.

Los PDF deben permitir extraer texto. OCR para PDF escaneados queda fuera del alcance inicial. Si un PDF es escaneado, está protegido/corrupto o no produce texto útil, ese documento termina en `ERROR` con una causa comprensible; la cola continúa con el siguiente archivo. No se indexa silenciosamente un PDF vacío.

## Ciclo de estados y errores del documento

Los estados persistidos del backend son `RECEIVED`, `PROCESSING`, `INDEXED` y `ERROR`; Angular los presenta con etiquetas en español (`Recibido`, `Procesando`, `Indexado`, `Error`). `PENDIENTE` y `SUBIENDO` son estados transitorios de la cola del frontend y no se persisten como estado del documento.

| Estado | Significado | Transiciones permitidas |
| --- | --- | --- |
| `RECEIVED` | El backend recibió y validó el archivo, lo almacenó y creó el registro. Estado inicial devuelto por la API. | `PROCESSING` cuando el trabajo entra en cola/worker; `ERROR` si un fallo definitivo impide continuar. |
| `PROCESSING` | El trabajo está en cola, extrayendo texto o indexando. Los reintentos transitorios mantienen este estado. | `INDEXED` si Elasticsearch confirma la indexación; `ERROR` ante fallo permanente o agotamiento de intentos. |
| `INDEXED` | El texto y metadatos quedaron disponibles para búsqueda y visualización. | Estado terminal. |
| `ERROR` | Fallo definitivo o intentos agotados. Se conserva registro, código y causa; el documento no está disponible en el índice. | Estado terminal. Un reintento manual autorizado crea un nuevo intento y vuelve a `RECEIVED`/`PROCESSING`, conservando historial del intento anterior. |

La aceptación de la subida no garantiza que el documento vaya a indexarse: al guardar el archivo, el backend crea `RECEIVED` y devuelve un ID de seguimiento; el procesamiento asíncrono determina el estado final. Si el fallo ocurre antes de que el backend acepte el archivo (por ejemplo, una desconexión durante la transferencia), el frontend marca ese elemento como fallido localmente, muestra el error y sigue con el siguiente. No se crea un estado persistido para un archivo que nunca fue aceptado.

### Catálogo de errores y mensajes visibles

El backend devuelve un código estable, etapa, mensaje seguro, indicador `retryable` y referencia de soporte cuando aplique. El mensaje explica qué pasó y, cuando sea posible, cómo corregirlo. Los detalles internos (stack trace, rutas locales, credenciales o datos sensibles) se registran en logs asociados al ID de documento/solicitud y no se exponen en la interfaz.

| Código estable | Etapa / condición | Mensaje visible sugerido |
| --- | --- | --- |
| `UNSUPPORTED_FILE_TYPE` | Validación: extensión o tipo real distinto de TXT, PDF o Markdown | “No se pudo procesar **{archivo}**: el formato no está admitido. Sube un archivo TXT, PDF o Markdown.” |
| `FILE_TOO_LARGE` | Validación: supera el límite configurado por archivo | “No se pudo procesar **{archivo}**: supera el tamaño máximo permitido de {límite}.” |
| `EMPTY_FILE` | Validación: archivo sin contenido | “No se pudo procesar **{archivo}**: el archivo está vacío.” |
| `INVALID_METADATA` | Validación: faltan campos o metadatos no válidos | “No se pudo procesar **{archivo}**: revisa los metadatos obligatorios e inténtalo de nuevo.” |
| `DUPLICATE_FILE` | Validación: se detectó un documento duplicado según la política configurada | “No se pudo agregar **{archivo}**: ya existe un documento con el mismo contenido.” |
| `UPLOAD_FAILED` | Recepción: transferencia interrumpida antes de aceptar el archivo | “No se pudo subir **{archivo}**: la transferencia falló. Puedes reintentar este archivo; el lote continuará.” |
| `STORAGE_UNAVAILABLE` | Recepción/almacenamiento: no fue posible guardar durablemente el archivo | “No se pudo guardar **{archivo}** por un problema temporal del servicio. Intenta de nuevo más tarde.” |
| `FILE_CORRUPTED` | Extracción: archivo o PDF mal formado/ilegible | “No se pudo procesar **{archivo}**: el archivo está dañado o no se puede leer. Verifica el original.” |
| `PASSWORD_PROTECTED` | Extracción: PDF cifrado o requiere contraseña | “No se pudo procesar **{archivo}**: el PDF está protegido con contraseña. Sube una copia desbloqueada.” |
| `UNSUPPORTED_ENCODING` | Extracción: TXT/Markdown no se puede leer como UTF-8 | “No se pudo procesar **{archivo}**: guarda el texto en UTF-8 y vuelve a intentarlo.” |
| `TEXT_EXTRACTION_FAILED` | Extracción: error del parser no clasificado como archivo corrupto | “No se pudo extraer texto de **{archivo}**. Verifica el documento o comparte el código {referencia} con soporte.” |
| `NO_EXTRACTABLE_TEXT` / `OCR_REQUIRED` | Extracción: PDF sin texto seleccionable; OCR no está incluido | “No se pudo procesar **{archivo}**: no encontramos texto seleccionable. Esta versión no incluye OCR; sube una copia con texto reconocido.” |
| `QUEUE_UNAVAILABLE` | Cola: Redis/BullMQ no disponible temporalmente | “No se pudo iniciar el procesamiento de **{archivo}** por un problema temporal. Intenta de nuevo.” |
| `PROCESSING_TIMEOUT` | Procesamiento: se agotó el tiempo máximo del trabajo | “El procesamiento de **{archivo}** excedió el tiempo permitido. Si el problema persiste, comparte el código {referencia} con soporte.” |
| `SEARCH_ENGINE_UNAVAILABLE` | Indexación: Elasticsearch no disponible temporalmente | “No se pudo completar la indexación de **{archivo}** por un problema temporal. El sistema volverá a intentarlo.” |
| `INDEXING_FAILED` | Indexación: Elasticsearch rechazó el documento o ocurrió un fallo definitivo | “No se pudo indexar **{archivo}**. Comparte el código {referencia} con soporte.” |
| `INTERNAL_ERROR` | Cualquier etapa: fallo interno no clasificado | “No se pudo completar **{archivo}** por un problema interno. Comparte el código {referencia} con soporte.” |

El frontend conserva el nombre del archivo y muestra cada error en el elemento correspondiente de la cola, junto con una acción de reintento cuando aplique. Evitar mensajes genéricos como “error de carga” si se conoce la causa concreta.

### Continuidad de la cola

Un error de validación, transferencia, almacenamiento, extracción o indexación afecta únicamente al documento correspondiente. El frontend muestra su resultado y continúa automáticamente con el siguiente elemento pendiente; no pausa ni cancela el lote completo. Los errores transitorios pueden ofrecer reintento individual, pero no bloquean los siguientes archivos. El usuario puede pausar o cancelar el lote como una acción explícita, independiente de los errores por archivo.

La subida sigue siendo secuencial hasta que cada archivo obtiene respuesta del backend. Después de la aceptación (`202 Accepted`), el procesamiento continúa en segundo plano; su estado final puede llegar por evento o consulta mientras se suben archivos posteriores.

### Lotes, resumen, reintentos y simultaneidad

- El usuario puede seleccionar muchos archivos e iniciar una sola operación de carga múltiple desde la interfaz. Angular conserva la cola del lote y envía cada archivo con una solicitud individual; espera la respuesta del backend antes de comenzar la siguiente subida. No se envía un único cuerpo multipart con todo el lote.
- NestJS crea un trabajo BullMQ por cada documento aceptado. La validación, extracción e indexación de un documento se aíslan de las de los demás.
- La interfaz muestra estado y error por archivo. El resumen final informa cantidad indexada, fallida y aún procesándose, además del nombre, causa concreta y disponibilidad de reintento. El lote solo se declara terminado cuando cada elemento está en un estado terminal (`INDEXED` o `ERROR`) o cuando un archivo no aceptado quedó registrado como fallo local.
- Un archivo no aceptado por error de validación o transferencia no impide que Angular intente la subida siguiente. Un trabajo fallido de BullMQ tampoco debe impedir que el worker tome otros trabajos listos.
- **Errores permanentes:** formato no admitido, codificación inválida, documento vacío, PDF con contraseña, PDF corrupto/sin texto extraíble y tamaño excedido. No se reintentan automáticamente; la interfaz indica qué corregir.
- **Errores transitorios:** interrupción de red, indisponibilidad temporal de almacenamiento/Redis/Elasticsearch o timeout recuperable. Se reintenta el mismo archivo/trabajo de forma acotada; los reintentos usan backoff y no detienen la cola de otros archivos.
- Para errores transitorios se permiten hasta 3 reintentos adicionales (4 intentos totales, contando el inicial), con backoff exponencial y variación aleatoria (jitter). Angular reintenta una transferencia; BullMQ reintenta un trabajo aceptado. Se usa la misma clave de idempotencia si se perdió la respuesta tras una aceptación. Tras agotar intentos, marcar el archivo `ERROR`, avanzar la cola y ofrecer reintento manual individual cuando sea seguro. No reintentar automáticamente errores de validación ni fallos permanentes de lectura.
- La cola de subida mantiene concurrencia 1 por lote. Pueden llegar cargas de otros usuarios o lotes en paralelo; API, almacenamiento y límites de tasa deben soportarlo o aplicar backpressure. El número máximo de archivos por lote y la concurrencia del worker deben ser configurables y se deben validar con pruebas de recursos; sus valores numéricos quedan pendientes.
- Los errores desconocidos no se clasifican automáticamente como recuperables: registrar referencia de soporte y permitir reintento manual solo si la operación es idempotente.

Para una carga masiva, el frontend administra una cola con un máximo configurable y envía los archivos secuencialmente: no inicia la subida de un archivo hasta que la subida del anterior haya terminado y el backend haya respondido. El valor numérico máximo queda pendiente de pruebas. El tamaño por archivo, la tasa de entrada, el almacenamiento y los recursos disponibles también requieren controles.

La respuesta del backend confirma la recepción del archivo, devuelve un identificador de seguimiento y el estado inicial `RECEIVED`. El documento pasa a `PROCESSING` mientras espera en cola o se extrae/indexa; estos trabajos siguen en segundo plano y pueden continuar mientras Angular sube el siguiente archivo. Por tanto, “terminó la subida” significa que el backend aceptó y confirmó ese archivo, no que terminó su indexación. Los estados terminales son `INDEXED` y `ERROR`.

La carga y la indexación no forman parte de la latencia de una búsqueda. La interpretación propuesta del rango indicado por la prueba separa la latencia del backend del tiempo percibido en la interfaz; esta interpretación debe validarse con el evaluador porque el PDF no define percentiles ni condiciones de medida.

## Objetivos y medición de latencia de búsqueda

### Métricas propuestas

| Métrica | Objetivo | Inicio y fin de medida | Incluye |
| --- | --- | --- | --- |
| Latencia de búsqueda del backend | p95 ≤ 400 ms | Desde que NestJS recibe una solicitud válida hasta que termina de enviar la respuesta HTTP. | Validación/preparación, consulta a Elasticsearch, procesamiento de resultados y serialización. |
| Tiempo percibido por el usuario | p95 ≤ 1.000 ms | Desde la acción de buscar del usuario hasta que Angular muestra los resultados iniciales utilizables. | Red, backend, recepción de respuesta y renderizado inicial de resultados. |

p95 ≤ 400 ms significa que al menos el 95 % de las solicitudes de la muestra termina en 400 ms o menos; no garantiza que todas lo hagan. No interpretar este objetivo como máximo individual. Si el evaluador requiere que cada búsqueda cumpla el límite, acordar además un máximo observado y las condiciones exactas de la prueba. Los objetivos p95 son una propuesta de ingeniería, no una exigencia explícita del PDF.

### Presupuesto inicial de backend

| Etapa | Presupuesto orientativo |
| --- | ---: |
| Validación y preparación | 20 ms |
| Consulta a Elasticsearch | 180 ms |
| Procesamiento de resultados | 50 ms |
| Serialización y envío de respuesta | 50 ms |
| Margen de variabilidad | 100 ms |
| **Total del objetivo** | **400 ms** |

Son presupuestos de diseño, no resultados ni garantías. Los percentiles de las etapas no se suman para demostrar el p95 total: medir las duraciones totales y las etapas individualmente. Para el tiempo percibido de 1.000 ms, reservar como hipótesis inicial hasta 600 ms para el backend completo y hasta 400 ms para red restante y renderizado; medir el extremo a extremo real en el entorno desplegado.

### Condiciones que debe fijar la medición

- Registrar las versiones y recursos del backend, Elasticsearch y el entorno donde corre Angular; especificar si la prueba es local o desplegada y la latencia de red del cliente.
- Usar un índice con cantidad, tamaño y distribución de documentos representativos; registrar el número de documentos y la configuración de mapeos/analizadores.
- Definir una mezcla reproducible de búsquedas: términos, frases, filtros, paginación y consultas sin resultados; usar la misma mezcla para comparar cambios.
- Definir concurrencia y ritmo de solicitudes; informar tanto pruebas de una sola persona como carga concurrente si ambas aplican.
- Calentar el sistema antes de medir y declarar si la caché está habilitada. Informar por separado mediciones frías y calientes si ambas son relevantes.
- Recoger suficientes solicitudes para que p95 sea informativo; reportar cantidad de muestras, p50, p95, máximo observado, errores y throughput.
- Medir el backend desde NestJS y el extremo a extremo desde el navegador con marcas de tiempo; no mezclar la transferencia inicial de documentos ni su indexación con la búsqueda.
- Acordar con el evaluador el tamaño del conjunto, concurrencia, red y si se evalúa el p95 o cada solicitud individual.

## Decisión: motor de búsqueda indexada

**Tecnología seleccionada:** Elasticsearch.

**Persistencia principal:** PostgreSQL.

El volumen máximo aún no está definido, así que Elasticsearch no se elige porque se haya demostrado que PostgreSQL no escala. Se elige por la funcionalidad explícita que necesita la prueba: texto completo en contenido y metadatos, relevancia ponderada, filtros, paginación y resaltado. PostgreSQL conserva metadatos, versiones y estados; Elasticsearch recibe una proyección derivada y reconstruible.

### Alternativas evaluadas

| Alternativa | Ventaja para esta kata | Costo / motivo de selección |
| --- | --- | --- |
| Elasticsearch | Búsqueda especializada, relevancia, filtros, paginación y resaltado integrados en el motor seleccionado. | Añade un servicio y trabajo de operación/mapeo. Se acepta esa complejidad para implementar directamente los requisitos de búsqueda. |
| PostgreSQL Full-Text Search con `tsvector` y GIN | Menos servicios, menos configuración local y menor costo de operación; opción razonable con volumen moderado y consultas compatibles. | Se descarta para esta implementación porque el objetivo de búsqueda y el resaltado se cubren de forma más directa con Elasticsearch. Podría reconsiderarse si el volumen y las mediciones permiten simplificar el sistema. |
| OpenSearch | Alternativa especializada compatible con una arquitectura de índice separado. | No se selecciona para evitar cambiar el motor decidido; comparar disponibilidad, costos y operación si el entorno lo requiere. |
| RedisSearch | Podría resolver búsquedas desde el ecosistema Redis. | Redis ya cumple el rol de cola BullMQ; no se añade otro motor/módulo de búsqueda sin una necesidad que justifique esa dependencia. |
| MongoDB Text Index | Búsqueda textual asociada a persistencia documental. | No se selecciona porque la persistencia principal acordada es PostgreSQL y se requiere mantener una única fuente relacional de metadatos/estados. |

### Estrategia de indexación

- El worker extrae y normaliza el texto de TXT, Markdown y PDF admitidos; la indexación ocurre en segundo plano mediante BullMQ.
- El documento de Elasticsearch incluirá identificador estable, título, autor, categoría, etiquetas, versión y contenido textual normalizado.
- Configurar análisis lingüístico en español para los campos de texto y tipos `keyword` para filtros y coincidencias exactas cuando aplique.
- Aplicar ponderaciones de relevancia por campo y solicitar fragmentos resaltados para los resultados. No usar búsquedas de contenido mediante SQL `LIKE` ni recorridos completos de tablas.
- Devolver inicialmente hasta 20 resultados con los campos de resumen requeridos. Usar orden determinista; considerar paginación `search_after` cuando el volumen o la profundidad de página lo amerite.
- PostgreSQL es la fuente de verdad; el índice Elasticsearch es derivado y debe poder reconstruirse desde los registros y el contenido almacenado.

### Rendimiento y validación

El objetivo de latencia es el rango de 400 ms a 1 s, con los objetivos p95 propuestos y condiciones reproducibles que se describen arriba. No se asume un volumen máximo antes de medir: ejecutar pruebas de carga con conjuntos y concurrencia representativos y registrar latencias, errores y throughput. Los límites reales dependerán de la infraestructura seleccionada.

El tiempo disponible para la kata es de un día. Elasticsearch aumenta la cantidad de servicios frente a PostgreSQL Full-Text Search, por lo que se debe limitar el alcance: una sola proyección de índice, mapeo explícito, consulta de búsqueda y una prueba reproducible. No añadir búsqueda semántica ni OCR al alcance inicial.

### Decisiones de implementación relacionadas

- La primera página devolverá hasta 20 resultados con los campos necesarios para la lista y el fragmento. Los datos completos se obtienen al abrir un documento; evitar una consulta individual a PostgreSQL por cada resultado.
- Usar paginación estable; preferir paginación por cursor (`search_after`) cuando el volumen o la profundidad de página lo justifique.
- Extracción e indexación ocurren fuera del camino de búsqueda, mediante BullMQ. Las solicitudes de búsqueda no ejecutan parsing, OCR ni reindexación.
- Reutilizar clientes y pools de conexión hacia Elasticsearch y PostgreSQL; definir límites y timeouts para dependencias saturadas.
- Incorporar permisos y filtros de acceso directamente en la consulta. No descargar resultados y filtrarlos después en NestJS.
- Observar latencia total, tiempos por etapa, tamaño de respuesta, cantidad de hits, errores, throughput y saturación de recursos.

## Stack tecnológico decidido

| Componente | Tecnología | Responsabilidad |
| --- | --- | --- |
| Frontend | Angular + TypeScript | Formulario de carga, cola secuencial en el navegador, búsqueda, filtros, resultados resaltados, visor y estado reactivo. |
| API / backend | NestJS + TypeScript | API REST, validación, permisos, metadatos, estados y coordinación de trabajos. |
| Persistencia principal | PostgreSQL | Fuente de verdad para metadatos y estados de cada documento. |
| Búsqueda | Elasticsearch | Índice derivado para texto completo, relevancia, filtros, paginación y fragmentos resaltados. |
| Cola de procesamiento | Redis + BullMQ | Trabajos asíncronos de extracción e indexación; no administra la subida desde el navegador. |
| Tiempo real | Server-Sent Events (SSE) | Notificaciones del backend al frontend cuando cambia el estado de un documento. |
| Entorno local | Docker Compose | Levantar API, trabajador, PostgreSQL, Elasticsearch y Redis para desarrollo y demostración. |
| Almacenamiento de binarios | Volumen local de Docker para la kata | Conservar los originales fuera de Redis y PostgreSQL. Mantener una interfaz de almacenamiento que permita migrar a almacenamiento de objetos en producción. |

### Reglas de integración

- La cola del frontend controla exclusivamente el orden de transferencia: un archivo comienza a subirse después de que el backend confirme el anterior.
- BullMQ controla el procesamiento en backend. Su concurrencia se configura de forma independiente a la subida; el trabajador puede indexar documentos aceptados mientras Angular sigue enviando archivos.
- PostgreSQL es la fuente de verdad del estado. Elasticsearch es un índice reconstruible; el resultado se marca `INDEXED` solo después de que la indexación haya terminado correctamente.
- Los trabajos de BullMQ deben ser idempotentes y usar el ID del documento para evitar efectos duplicados ante reintentos o recuperación de trabajos.
- Si no se logra guardar el trabajo en Redis después de crear el documento, el backend no debe dejarlo indefinidamente en `RECEIVED` o `PROCESSING`: debe compensar la operación o marcar un error recuperable y registrarlo.
- La cola seleccionada en Angular vive en el navegador en esta versión. Si se cierra o recarga la pestaña, los archivos todavía no enviados pueden perderse; los ya aceptados se recuperan consultando sus IDs en backend. La persistencia/reanudación de la cola queda fuera del alcance inicial.
- Docker Compose se usa para desarrollo y demo. No se considera por sí mismo la estrategia de despliegue de producción.

## Parámetros para definir la capacidad mínima de carga

Antes de fijar límites de producción, recoger o acordar estos datos:

| Parámetro | Qué dimensiona | Cómo decidirlo |
| --- | --- | --- |
| Cantidad de archivos por lote | Duración del lote, uso de navegador, cola de procesamiento y almacenamiento | Establecer un máximo configurable; el valor numérico queda pendiente de pruebas con lotes representativos. |
| Tamaño máximo por archivo | Memoria, disco temporal, tiempo de transferencia y parsing | Sigue pendiente; basarse en archivos representativos y aplicar el límite en proxy/API y backend. |
| Volumen total acumulado | Almacenamiento, duración del lote y capacidad de procesamiento | No se fija un máximo total en esta decisión. Medir uso y aplicar cuotas o límites operativos si el entorno los requiere. |
| Cargas simultáneas | Presión sobre red, CPU, disco, base de datos e índice | El frontend sube un solo archivo a la vez por lote. La concurrencia de procesamiento en backend es independiente y configurable. |
| Tasa de llegada y ráfagas | Capacidad de ingestión y tamaño de cola | Estimar documentos/minuto promedio y pico, incluyendo reintentos. |
| Tiempo de subida y timeout | Experiencia de usuario y conexiones ocupadas | El cliente debe poder subir archivos grandes sin bloquear la indexación; acordar timeouts en cada capa. |
| Formatos y complejidad del contenido | CPU y memoria de extracción | Aceptar TXT UTF-8, Markdown UTF-8 y PDF con texto extraíble; OCR queda fuera del alcance inicial. PDF ilegible, protegido, corrupto o sin texto útil termina en `ERROR` con causa clara. |
| Tamaño de texto extraído | Tamaño de índice y duración de indexación | Limitar páginas, caracteres o bytes extraídos por archivo para proteger el servicio. |
| Almacenamiento y retención | Espacio, copias de seguridad y borrado | La kata conserva el original en un volumen local; definir política de retención y migración a almacenamiento de objetos para producción. |
| Idempotencia y reintentos | Evita duplicados tras fallos de red o reenvíos | Usar una clave/identificador de operación y definir cuándo una repetición crea o reutiliza el documento. |
| Seguridad | Riesgo de archivos maliciosos y exposición de datos | Validar extensión y tipo real, nombres, permisos, límites, y proteger el almacenamiento y la descarga. |
| Observabilidad | Permite saber si los límites son adecuados | Medir tasas, tamaño, concurrencia, tiempo de subida, espera en cola, extracción, indexación y errores. |

## Límites y capacidad

- La cantidad de archivos por lote tendrá un máximo configurable; todavía no se fija el valor. La interfaz debe validar el límite e informar si se excede.
- El frontend sube los archivos de forma secuencial dentro del lote. El siguiente empieza solo después de recibir la confirmación del backend para el archivo anterior.
- No se ha acordado un límite de tamaño individual ni de volumen total. Esos valores deben medirse y configurarse según el entorno; no inventar cifras como requisito.
- Aunque no exista un tope funcional de cantidad, la interfaz debe comunicar progreso y errores por archivo y evitar que la cola consuma memoria sin control. La carga de binarios se hace bajo demanda, no leyendo todos los archivos completos a memoria.
- El backend mantiene controles de tamaño por archivo, validación durante streaming, almacenamiento disponible, tasa de entrada y procesamiento pendiente. Los límites operativos no cambian la regla de subida secuencial del frontend.
- No ejecutar OCR en la primera versión; los PDF sin texto extraíble se marcan como `ERROR` con un motivo legible y no detienen el resto de la cola.

## Flujo y controles recomendados

1. El usuario selecciona uno o muchos documentos; el frontend agrega sus referencias a una cola y presenta el progreso.
2. El frontend toma el siguiente archivo pendiente, valida lo que pueda localmente y lo envía; no inicia la subida del siguiente hasta recibir la respuesta de aceptación o error de este archivo.
3. El backend valida autenticación/autorización, metadatos, tipo real y tamaño durante streaming; no confía solo en `Content-Length`, el MIME declarado o la extensión.
4. El backend guarda el archivo de forma segura y crea el registro `RECEIVED`.
5. El backend encola el trabajo recuperable y responde con `202 Accepted`, un ID de seguimiento y estado `RECEIVED`. Esta respuesta termina la subida para el frontend; no implica que la indexación terminó.
6. Tras la confirmación, el frontend actualiza el progreso y comienza la subida del siguiente archivo; el backend extrae texto e indexa en segundo plano, con límites de recursos y fallos aislados por documento. Si la extracción del PDF no produce texto útil, marca ese documento `ERROR` y continúa el lote.
7. El backend cambia a `PROCESSING` mientras el trabajo esté en cola o activo, y luego a `INDEXED` o `ERROR`; emite los eventos de tiempo real correspondientes.
8. El frontend puede consultar el estado por ID o recibir eventos para recuperar el resultado tras desconexiones.

No se debe confirmar `RECEIVED` si el archivo o la tarea no quedaron guardados de forma que el proceso pueda recuperarlos. Definir limpieza para cargas parciales, archivos temporales y tareas fallidas.

## Decisiones pendientes

- [ ] Confirmar tamaño máximo por archivo a partir de los documentos reales o de prueba.
- [ ] Definir valores iniciales configurables para cantidad máxima de archivos por lote, tamaño por archivo y concurrencia de workers con pruebas representativas.
- [ ] Evaluar persistencia/reanudación de la cola del frontend si pasa a ser requisito; no está incluida en la primera versión.
- [ ] Acordar si se impone una pausa o límite de tasa cuando el backend acumule demasiadas tareas pendientes.
- [ ] Decidir si se conservará el archivo original además del texto indexado.
- [ ] Definir base y máximo del backoff, timeout por trabajo, política de pausa y recuperación de trabajos atascados; ya se fijó el máximo en 3 reintentos adicionales para fallos transitorios.
- [ ] Definir ámbito de unicidad de `DUPLICATE_FILE` (por ejemplo, hash SHA-256 dentro de una organización) y si se permite importar el mismo contenido con metadatos/versiones diferentes.
- [ ] Definir si la coordinación PostgreSQL-Redis requiere patrón outbox para el entorno de despliegue previsto.
- [ ] Medir ingestión e indexación con una muestra representativa; registrar resultados y entorno.

## Criterios de aceptación para la carga

- La API rechaza formatos, tamaños y metadatos inválidos con errores comprensibles.
- La respuesta inicial no espera a que termine la extracción/indexación e incluye un ID y estado `RECEIVED`; el documento pasa a `PROCESSING` mientras el job está en cola o activo.
- Se actualiza el estado final a `INDEXED` o `ERROR` y se notifica al frontend con un código y mensaje comprensible cuando hay error.
- El frontend sube un solo archivo a la vez por lote y no inicia el siguiente hasta recibir la respuesta del backend para el actual.
- La cantidad máxima del lote es configurable y se valida; el progreso y los errores se muestran por archivo.
- Se aceptan TXT UTF-8, Markdown UTF-8 y PDF con texto extraíble; la validación del backend comprueba el tipo real.
- Un PDF sin texto extraíble termina en `ERROR` con una causa comprensible; no se ejecuta OCR y el resto de la cola continúa.
- Los límites operativos de tamaño por archivo y almacenamiento se validan en frontend cuando sea posible y siempre en el backend.
- Cada error se asocia al archivo que lo causó y no detiene la cola; la subida del siguiente archivo continúa.
- El resumen del lote muestra archivos indexados, fallidos y todavía procesándose, con causa y posibilidad de reintento por archivo.
- Los fallos transitorios reciben reintentos acotados con backoff; los errores permanentes no se reintentan automáticamente.
- La concurrencia del worker es independiente de la subida secuencial de Angular y se configura/valida según capacidad.
- El límite de archivos por lote, tamaño máximo por archivo y concurrencia del worker son configurables y se aplican en backend; Angular también informa los límites antes de iniciar cuando sea posible.
- Los errores incluyen un código estable y mensaje seguro, y no exponen detalles internos.
- La respuesta/error incluye etapa y propiedad `retryable`; los logs guardan referencia e información técnica sin exponerla en la UI.
- Los errores transitorios permiten hasta 3 reintentos adicionales con backoff exponencial y jitter; los errores permanentes no se reintentan automáticamente.
- Cada intento, transición de estado y resultado queda registrado con ID de documento/trabajo, número de intento, fecha, código de error y referencia de diagnóstico.
- Un reintento no genera duplicados inesperados y puede consultarse el estado por ID.
- El sistema no mantiene todo el archivo en memoria sin límite; soporta backpressure y limpia temporales.
- Se registran métricas suficientes para comprobar tiempos, volumen y causas de fallo.

## Registro de decisiones

| Fecha | Decisión | Estado | Motivo / evidencia |
| --- | --- | --- | --- |
| 2026-10-27 | La cantidad de archivos por lote tendrá un máximo configurable; Angular administra la cola y sube secuencialmente | Adoptada, valor pendiente | El siguiente archivo empieza solo cuando termina la subida y el backend confirma el anterior; el límite se fijará con pruebas de capacidad. |
| 2026-10-27 | La confirmación de subida es independiente de la finalización de indexación | Adoptada | El backend acepta cada documento y lo procesa de forma asíncrona; la indexación puede continuar mientras el frontend sube el siguiente. |
| 2026-10-27 | Aceptar TXT UTF-8, Markdown UTF-8 y PDF con texto extraíble; no incluir OCR en el alcance inicial | Adoptada | Mantiene el procesamiento acotado para la kata. Un PDF sin texto útil se marca `ERROR` con causa y no bloquea la cola. |
| 2026-10-27 | Persistir `RECEIVED`, `PROCESSING`, `INDEXED` y `ERROR`; mantener `PENDIENTE`/`SUBIENDO` en frontend | Adoptada | Distingue recepción durable, procesamiento y estados terminales; Angular presenta etiquetas en español. |
| 2026-10-27 | Aislar errores por archivo y continuar automáticamente la cola | Adoptada | Un archivo fallido no impide la carga de los siguientes; se muestra la causa y se ofrece reintento individual cuando aplique. |
| 2026-10-27 | Tratar un lote como operación de UI con una solicitud individual por archivo | Adoptada | Angular mantiene una sola cola secuencial; NestJS/BullMQ ejecutan y reportan cada documento independientemente. |
| 2026-10-27 | Reintentar errores transitorios hasta 3 veces adicionales con backoff exponencial y jitter | Adoptada | Equivale a un máximo de 4 intentos totales; validación y fallos permanentes de lectura no se reintentan automáticamente. |
| 2026-10-27 | Elegir Angular + TypeScript, NestJS + TypeScript, PostgreSQL, Elasticsearch, Redis + BullMQ, SSE y Docker Compose para desarrollo | Adoptada | Cubre interfaz, API, persistencia relacional, búsqueda indexada, procesamiento asíncrono y notificaciones requeridas por la prueba. |
| 2026-10-27 | Mantener la subida secuencial en Angular y el procesamiento asíncrono en BullMQ con concurrencia independiente | Adoptada | La confirmación de recepción libera la subida siguiente; extracción e indexación pueden seguir en paralelo según capacidad del trabajador. |
| 2026-10-27 | Usar PostgreSQL como fuente de verdad y Elasticsearch como índice reconstruible | Adoptada | Evita tratar el índice de búsqueda como registro canónico de metadatos y estados. |
| 2026-10-27 | Seleccionar Elasticsearch como motor de búsqueda indexada | Adoptada | Sus funciones de texto completo, relevancia, filtros y resaltado se ajustan a la prueba; el volumen aún se medirá y PostgreSQL Full-Text Search queda como alternativa de menor complejidad. |
| 2026-10-27 | Guardar archivos originales en un volumen local para la kata | Adoptada para desarrollo/demo | Mantiene binarios fuera de la cola Redis; para producción se prevé almacenamiento de objetos detrás de una interfaz intercambiable. |
| 2026-10-27 | Mantener la cola pendiente de Angular en memoria del navegador en la primera versión | Adoptada para alcance inicial | Los archivos no enviados podrían perderse al cerrar/recargar la pestaña; documentos ya aceptados se recuperan por sus IDs y estado del backend. |
| 2026-10-27 | Definir objetivos de búsqueda como p95 ≤ 400 ms para backend y p95 ≤ 1.000 ms extremo a extremo | Propuesta pendiente de validar con el evaluador | El PDF da un rango de 400 ms a 1 s, pero no especifica percentil, puntos de inicio/fin ni condiciones de carga. |
| 2026-10-27 | Medir búsqueda por etapas y con carga/dataset reproducibles | Adoptada como criterio de verificación | Los presupuestos por etapa son hipótesis; el cumplimiento se determina con latencia total y condiciones publicadas. |
| 2026-10-27 | Documentar los flujos de carga, indexación, SSE, búsqueda y visualización en `docs/architecture.md` | Adoptada | Define responsabilidades entre Angular, NestJS, PostgreSQL, almacenamiento, BullMQ/Redis y Elasticsearch, además de fallos y recuperación. |
| 2026-10-27 | Separar recepción de archivo de extracción e indexación | Adoptada para el diseño | El enunciado pide respuesta inicial inmediata, ID de seguimiento y procesamiento asíncrono. |
| 2026-10-27 | Mantener la latencia de búsqueda separada del tiempo de carga | Adoptada para el diseño | El rango de 400 ms a 1 s se define para búsquedas; el procesamiento pesado debe ser asíncrono. |
