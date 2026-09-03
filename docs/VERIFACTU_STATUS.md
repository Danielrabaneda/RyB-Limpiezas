# Estado de cierre de facturación y VeriFactu

Actualizado: 31 de agosto de 2026.

## Objetivo acordado: preparado antes del 01/01/2027, sin envíos reales previos

El usuario indica que no enviará facturas por VeriFactu hasta el 1 de enero de
2027 (interpretación de «20127»), pero quiere terminar y comprobar el sistema
antes: el último día debe quedar únicamente una activación controlada, sin
desarrollo ni despliegues pendientes. Esta instrucción NO autoriza activar
ahora, programar una activación automática ni transmitir registros reales.

Criterios de aceptación para el cierre:

- Implementar el circuito definitivo de producción detrás de un bloqueo de
  servidor, cerrado por defecto y no eludible desde clientes o conectores.
  Debe poder comprobarse sin envíos reales mediante pruebas automatizadas,
  transporte simulado y el entorno externo de pruebas de la AEAT.
- El cambio de entorno no podrá enviar la cola histórica de pruebas ni usar
  sus series, huellas o cadenas como inicio de producción. Comprobar separación
  por empresa/entorno, numeración inicial y fecha efectiva de comienzo.
- Completar y verificar envío al emitir, respuestas, recuperación ante errores,
  reintentos e idempotencia, certificados cloud/local y controles de acceso.
- Preparar activación administrativa clara, con comprobaciones previas y
  confirmación expresa, sin envío anticipado al 01/01/2027. No automatizarla
  por el mero paso de una fecha ni por subir la declaración firmada.
- Terminar la revisión del sistema, versión definitiva y declaración del
  productor ANTES de comenzar a operar. No exigir una factura real anticipada
  como condición para preparar o firmar la declaración: evitar un bloqueo
  circular entre firma y activación. Las pruebas no equivalen por sí solas a
  una verificación completa de cumplimiento.
- Dejar un procedimiento de puesta en marcha y de incidencias. El día de
  activación habrá comprobaciones operativas finales, no programación pendiente.

Dependencia concreta del usuario: el certificado actualmente documentado caduca
el **20/11/2026**, antes de la fecha objetivo. Necesitará renovación y conexión
del certificado vigente antes de la puesta en marcha; no basta con conservar
el certificado que superó las pruebas de agosto. Revalidar entonces vigencia,
NIF y acceso, sin exportar ni revelar claves privadas.

No hay automatización ni compromiso de trabajo desatendido creado para esta
fecha. Mantener el avance y los pendientes en este expediente.

## Terminado, probado y publicado

**Nota de trabajo 31/08:** la revisión de aislamiento descrita al final está
implementada y probada LOCALMENTE, todavía no publicada. La lista siguiente
describe lo que ya estaba desplegado antes de esa revisión.

- Facturación fiscal transaccional: series separadas de prueba, impuestos,
  huella SHA-256, encadenamiento, altas, anulaciones y subsanaciones.
- Cola por empresa con reclamación exclusiva, arrendamiento, idempotencia,
  reintentos exponenciales y registro de resultados.
- Sobre SOAP 1.1 oficial y validación previa contra los XSD publicados por la
  AEAT para VeriFactu 1.0.
- Primera alta externa superada en la AEAT de pruebas: la factura
  `TEST-VF-2026-0001`, por 1,21 EUR, fue aceptada sin errores en un intento.
- Corrección de la normalización del NIF emisor en la huella fiscal. Los avisos
  de huella de la factura histórica 346 corresponden a registros enviados
  antes de esta corrección y se conservan como evidencia, sin reescribirlos.
- QR tributario conforme a la especificación técnica de la AEAT: URL distinta
  para pruebas y producción, tamaño de 30 mm, corrección de errores M, texto
  `QR tributario:` y distintivo `VERI*FACTU`. Solo aparece en facturas
  gestionadas por VeriFactu.
- Anulación contable: las facturas anuladas no forman parte del total facturado
  ni del pendiente de cobro y quedan visibles en su apartado de anuladas.
- Acceso directo a VeriFactu desde Facturación, sin pasar por Ajustes Factura.
- Conector Windows para certificados no exportables: detección automática por
  NIF, uso de la clave privada dentro del almacén de Windows y acceso mutuo TLS.
- Emparejamiento de un solo uso, código recibido automáticamente, token local
  protegido con DPAPI, latido, desconexión y cambio de ordenador desde
  LimpiaGest.
- Instalador de pruebas, apertura desde la plataforma, inicio automático al
  entrar en Windows, desinstalador y paquete descargable.
- Alternativa intuitiva de carga `.pfx/.p12`, custodiada por empresa en Secret
  Manager. El certificado B04843843 está conectado y es válido hasta el
  20/11/2026.
- Aplicación y funciones publicadas en Firebase sobre Node.js 22, con pruebas
  automáticas, compilación web, sintaxis PowerShell y validación XSD superadas.

## Resultado del caso controlado

- Alta `TEST-VF-2026-0001`: **aceptada en pruebas**.
- Cotejo del QR oficial: **superado**. La sede de pruebas mostró `Encontrada` y
  coincidieron NIF, número, fecha e importe.
- Anulación: **aceptada con errores**. La AEAT aceptó el registro y avisó de que
  su hora de generación superaba el margen de 240 segundos.
- Subsanación del alta: **rechazada como duplicada** porque el XML no incluyó el
  indicador oficial de subsanación.
- Efecto contable local tras preparar la anulación: 0,00 EUR facturados y
  0,00 EUR pendientes de cobro para este caso de prueba.

Los dos defectos detectados ya están corregidos y publicados: las nuevas
subsanaciones incluyen el indicador oficial, exigen modificar al menos un dato
fiscal y conducen directamente a la confirmación de envío; además, el servidor
impide un primer envío si la hora fiscal lleva preparada más de tres minutos.
La corrección corresponde al commit `de59240`.

La numeración `TEST-VF-...` está aislada de las series reales. Todos estos
registros pertenecen al entorno de pruebas y no producen facturación real.

## Bloqueo de seguridad actual

El entorno permanece fijado en `test`, `productionEnabled` no puede activarse
desde la interfaz y el conector local solo acepta la URL AEAT de pruebas. La
aplicación no puede transmitir a producción con su configuración actual.

## Segunda prueba controlada: ciclo completo superado

El 30 de agosto se verificó desde la plataforma la factura
`TEST-VF-2026-0002`, por 1,21 EUR (base 1,00 EUR e IVA 0,21 EUR):

- Alta: **Aceptado en pruebas**, un intento y sin mensaje de error.
- Subsanación: **Aceptado en pruebas**, un intento y sin mensaje de error.
- Anulación: **Aceptado en pruebas**, un intento y sin mensaje de error.
- Único dato corregido: nombre de cliente, de `CLIENTE PRUEBA SUBSANACION`
  a `CLIENTE PRUEBA SUBSANACION CORREGIDO`; NIF e importes sin cambios.
- Cola visible tras el cierre: ocho registros; registro operativo: 38.

Esto confirma externamente la corrección del indicador de subsanación y el
flujo de anulación sin avisos temporales en este caso. Tras autorización
específica del usuario, la factura quedó anulada y se envió inmediatamente
su anulación al entorno de pruebas. El panel muestra 0,00 EUR facturados,
0,00 EUR cobrados, 0,00 EUR pendientes, cero borradores y tres anuladas.
No se borraron registros ni se marcó la factura como cobrada. Se conserva
todo el historial de pruebas, incluidas las respuestas anteriores con errores.

La documentación anterior se publicó en GitHub con el commit `ca4e203`, tras
autorización expresa para incluir los datos de empresa y evidencias. El DOCX
de declaración sigue siendo un borrador no firmable. Su anexo de pruebas ya
incorpora el ciclo completo aceptado de TEST-VF-2026-0002 y se revisaron
visualmente sus cuatro páginas tras la actualización. Esta actualización de
evidencia no constituye una declaración de conformidad firmada.

## Tareas finales pendientes antes de producción

### 1. Revisión legal y declaración responsable

El 31/08/2026 el usuario confirmó expresamente que **LIMPIEZAS RAIBA SOCIEDAD
LIMITADA**, NIF **B04843843**, será la entidad productora y responsable de
LimpiaGest. Esta confirmación de identidad no es una firma de la declaración
ni una autorización para activar producción.

Se ha cerrado la emisión con VeriFactu desactivado y fijado la versión fiscal
1.0.1 de esta revisión (detalle al final). Falta validar el alcance completo de
la edición con remisión real, revisar los demás datos y suscribir la declaración cuando su contenido
coincida con el sistema entregado. Debe estar accesible a los clientes dentro
del producto y también fuera de él; el archivo privado del informe de pruebas
no sustituye ese acceso a la declaración del productor.

Aclaración contrastada con la AEAT: la revisión independiente es una
recomendación, no una certificación externa obligatoria. Tampoco se exige
registro previo del producto ni firma electrónica de la declaración. No
condicionar su preparación a instalar AutoFirma. El DOCX conserva advertencias
de borrador y debe actualizarse antes de presentarlo para firma.
Fuente: https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html

### 2. Distribución firmada y activación controlada de producción

Queda la mejora de distribución del instalador Windows mediante firma de
código y verificación de SmartScreen. Es distinta de la autocertificación del
productor. Producción exige revisión final y autorización expresa para un
cambio separado y deliberado; no se activa con la carga de un documento.

## Cómo continuar

### Informe de evidencias separado de la declaración

Se ha preparado un PDF de una página con las pruebas aceptadas y sus límites:
`output/pdf/Informe_pruebas_LimpiaGest_Verifactu_2026-08-30.pdf`, generado con
`scripts/create_verifactu_test_report.py` y revisado visualmente. No es la
declaración responsable y no acredita conformidad integral. El usuario ha
aportado una copia con nombre, fecha 30/08/2026 y firma manuscrita visible.
No contiene una firma electrónica criptográfica. Se ha conservado sin modificar
en el archivo privado de la empresa `rayba`, dentro de **Documentación VeriFactu**.
La copia descargada desde el almacenamiento coincide byte a byte con el original;
el acceso anónimo devuelve 403. El PDF firmado no se incluye en GitHub ni en
los recursos públicos del hosting. Producción sigue bloqueada.

El nuevo apartado permite subir PDF de hasta 10 MB, indicar firma manuscrita y
descargar el original con autenticación. Solo administradores activos de la
misma empresa pueden listar, leer y crear documentos; no se permite sobrescribir
ni borrar. Se conserva SHA-256 en metadatos y no se generan enlaces públicos
desde la interfaz. El informe inicial se importó sin token público de descarga.
La firma indicada por quien sube un documento no se considera validación digital.

Verificación: 8 pruebas de servicio/interfaz, 3 pruebas de reglas con emuladores
(acceso por empresa, rol, sesión y estado; inmutabilidad; tamaño y metadatos)
y compilación limpia superadas. Publicados hosting y reglas de Storage, sin
desplegar funciones ni cambios ajenos. Descarga autenticada habilitada por CORS
para `https://ryb-limpiezas-app.web.app` y `https://limpiagest.es`.
El archivo admite suscripciones `legacy` activas, igual que el acceso a los
datos de la aplicación, pero siempre exige administrador activo de esa empresa.

Tras autorización específica del usuario, se añadió y confirmó el rol
`roles/firebaserules.firestoreServiceAgent` al agente interno
`service-745565950352@gcp-sa-firebasestorage.iam.gserviceaccount.com`, conservando
su rol previo `roles/firebasestorage.serviceAgent` y las demás políticas. Este
permiso permite a las reglas de Storage consultar el estado de la empresa en
Firestore. La primera solicitud fue rechazada por falta de autorización; solo
se aplicó después de recibirla expresamente. Se volvió a verificar que el PDF
coincide con el original y que el acceso anónimo devuelve 403. No se subió de
nuevo ni se cambiaron barreras fiscales. **Listado y descarga desde la interfaz
verificados**: el informe aparece en Documentación VeriFactu y el PDF descargado
con el botón de la app tiene el mismo SHA-256 que el original firmado. El
apartado queda operativo; no quedan tareas de archivo pendientes para este
informe. Esto no cierra los requisitos de la declaración responsable ni habilita
producción. Referencia técnica:
https://firebase.google.com/docs/rules/manage-deploy

AutoFirma se descargó desde la fuente oficial, pero no se ejecutó al no superar
la comprobación local de su firma. El usuario optó por la firma manuscrita.
No instalarlo ni firmar la declaración definitiva como parte de este archivo.

No crear otra alta ni repetir la subsanación o la anulación: las tres ya
están aceptadas y el anexo documental está actualizado. Continuar con la
revisión/firma y la distribución firmada. El certificado `.p12` sigue conectado;
no hace falta volver a introducir la clave. Por instrucción expresa del
usuario, producción permanece bloqueada: no activar endpoints ni modificar
las barreras de producción al continuar tareas documentales.

## Revisión de emisión exclusiva y versión — 31/08/2026

- `getEmissionBlockReason` se ejecuta dentro de la transacción de
  `emitInvoices`, inmediatamente después de leer la configuración y antes de
  asignar números o realizar escrituras. Rechaza VeriFactu desactivado o mal
  tipado, entornos distintos de pruebas y `productionEnabled: true`.
- Se eliminó la rama de emisión `legacy`. Los borradores no pasan por esta
  función: siguen disponibles con VeriFactu desactivado. Las reglas impiden
  saltarse el servidor para emitir directamente desde el cliente.
- `functions/lib/verifactuRelease.json` centraliza nombre, productor, NIF y
  versión fiscal **1.0.1**. Lo consumen los registros de alta/subsanación,
  anulación, SOAP y el generador documental. Los registros históricos de las
  fases 2/4 conservan su identificación SOAP anterior 1.0.0 al preparar envíos;
  no se reescribe ningún registro existente.
- Verificados 36 tests focalizados; 40 al incluir el archivo privado. Incluyen
  la ejecución del handler individual y por lotes con dobles de Firestore,
  cero escrituras/números consumidos en rechazos, serie de prueba independiente,
  identidad XML y conservación de versión histórica. Compilación web correcta.
- Hosting publicado con «Desactivado · solo borradores». Actualizadas con éxito
  `emitInvoices`, `cancelInvoiceFiscalRecord`, `subsanateInvoiceFiscalRecord`,
  `sendAeatCloudTestSubmission` y `localConnectorClaim` en `europe-west1`, Node
  22. Publicación desde copia aislada de HEAD con solo estos cambios; los
  cambios ajenos de jornadas y avisos se conservan sin publicar. Dependencias
  temporales reparadas con `npm ci` y análisis local ampliado a 60 s, sin cambiar
  dependencias del proyecto original. Cinco tests adicionales de navegación/QR
  superados: 45 verificaciones en total en esta revisión.
- PDF actualizado localmente en
  `output/pdf/Declaracion_responsable_LimpiaGest_1.0.1_REVISION.pdf`, cuatro
  páginas revisadas visualmente, con nombre/fecha/firma en blanco. Se preserva
  el borrador anterior y el informe de pruebas firmado. El PDF nuevo NO se
  publica como declaración vigente ni se firma automáticamente.
- Grafo reconstruido y verificado: 3168 nodos, 8679 relaciones;
  `functions.lib.invoiceEmission.getEmissionBlockReason` localizable. Estado
  operativo y pendientes conservados en este documento. Los cambios fuente
  de esta revisión siguen locales, sin nuevo commit/push en este turno.

**No dar por cerrado el cumplimiento ni pedir aún firma de una declaración
definitiva:** sigue pendiente validar el alcance completo de la edición con
remisión real y su versión definitiva, revisión del productor y posterior
disponibilidad de su declaración en el producto. No es necesario contratar una
certificación externa para esta autocertificación, según las FAQ de la AEAT.
La firma de código del instalador es una mejora de distribución distinta.
No activar producción ni enviar más pruebas por este trabajo documental.

## Revisión de aislamiento — avance local, pendiente de despliegue coordinado

Se ha implementado y verificado:

- Estado fiscal del servidor en
  `companies/{companyId}/verifactuConfig/state_{test|production}`. Altas,
  subsanaciones y anulaciones leen/escriben el estado de pruebas mediante la
  misma transacción que genera el registro. Producción comienza sin importar
  contador ni cadena de pruebas. No hay ruta de emisión real habilitada.
- Primera operación de pruebas: migración perezosa del estado antiguo de
  `settings/billing`, comprobando empresa, entorno, NIF, existencia del registro
  inmutable y coincidencia de huella. Si falla una comprobación se aborta; no
  se reinicia silenciosamente la cadena. Después se usa el estado privado;
  los campos antiguos se mantienen únicamente como espejo de compatibilidad.
- Reglas de Firestore impiden modificar/borrar ese estado desde el cliente y
  manipular las huellas/cabeceras/contadores antiguos en `billing`. Se mantienen
  los ajustes ordinarios y la creación de borradores. `saveBillingSettings`
  elimina esos campos del envío para no sobrescribirlos con copias antiguas.
- Preparación de cola y transportes comprueban empresa/entorno de los registros;
  envío cloud y reclamación local comprueban la huella frente al registro.
  Conector local filtra trabajos ajenos a pruebas y con intentos agotados,
  y vuelve a comprobar configuración, entorno y registro dentro de la
  transacción de reclamación. El transporte PFX rechaza todo destino distinto
  de la URL exacta de pruebas antes de abrir una conexión.
- 53 pruebas de servidor/guardado de ajustes y 3 pruebas de reglas contra el
  emulador de Firestore superadas. Se han ejecutado handlers de corrección y
  anulación con transacciones simuladas, continuidad entre operaciones,
  rechazo de mezcla de entornos/empresas/NIF, numeración de pruebas y guardado
  de ajustes. Sin envíos a AEAT ni escrituras en datos reales.

**No está terminado todo el circuito de producción. Próximos pasos concretos:**

1. Permiso privado de activación por empresa, comprobaciones de certificado,
   versión/declaración y fecha efectiva; ninguna fecha debe activar por sí sola
   ni un cliente poder autorizarse editando `billing`. Falta interfaz intuitiva.
2. Trabajador de envío automático con transporte comprobable sin red real:
   arrendamiento y confirmaciones vinculadas a intento, recuperación tras caída,
   orden de cadena, espera AEAT y ausencia de sobrescrituras por respuestas
   tardías. El sender cloud actual sigue siendo manual de pruebas; no presentarlo
   como automático ni definitivo.
3. Sustituir para la edición definitiva la instrucción actual de recrear un
   registro envejecido por un tratamiento correcto de incidencias sin reescribir
   registros emitidos. Verificar reintentos y duplicados con casos controlados.
4. Adaptar y comprobar conector Windows y transporte cloud para producción
   autorizada, manteniendo la salida real bloqueada durante desarrollo. La lista
   de destinos PFX sigue deliberadamente limitada a pruebas en esta revisión.
5. Despliegue coordinado de todos los escritores de cadena, reglas y cliente,
   con comprobación de continuidad del estado existente y sin escrituras de
   versiones antiguas durante la transición. NO publicar el `dist` actual:
   contiene cambios ajenos del workspace. Preparar copia aislada.
6. Revisión final, versión definitiva, declaración accesible y procedimiento de
   activación. Renovar certificado antes del 20/11/2026. No pedir al usuario
   factura real anticipada ni firma del PDF de revisión como cierre definitivo.

Esta revisión no cambia la versión publicada ni modifica la declaración PDF
anterior. No se ha creado automatización de activación o trabajo desatendido.
La compilación web completa terminó correctamente. Se solicitó reindexar el
grafo, pero el motor devolvió el índice anterior (3168 nodos) sin incluir
`readFiscalState` ni `assertFiscalScope`; no dar esa sincronización por hecha.
Para retomar, este expediente y los archivos nuevos son la referencia hasta
que se regenere correctamente el índice.

## 31/08/2026 · Siguiente bloque: envío cloud y recuperación segura (LOCAL)

Este apartado actualiza los puntos 2 y 3 del listado anterior. El bloque está
implementado en el workspace, **no desplegado ni subido a GitHub**. No se ha
enviado ningún registro a la AEAT, accedido al PFX real, activado producción,
modificado datos de empresa ni firmado otra declaración durante este bloque.

### Implementado

- `functions/lib/aeatCloudWorker.js`: motor compartido por el botón de envío de
  pruebas, el disparador de creación y la recuperación periódica. Los dos
  últimos quedan inertes salvo doble autorización explícita: variable de
  servidor `VERIFACTU_AUTOMATIC_TEST_SEND_ENABLED=true` **y** documento privado
  `companies/{companyId}/verifactuConfig/automation` con
  `autoCloudTestEnabled=true` y `environment=test`. NO se ha establecido ninguno.
  No existe activación por fecha ni por subir/firmar documentos.
- Validación de empresa activa, entorno, canal, vigencia/NIF del certificado,
  identidad del registro y huellas antes de enviar. El adaptador vuelve a
  validar el PFX y su huella, leyendo exclusivamente el secreto del tenant en
  el proyecto del despliegue. Los tests inyectan credenciales y transporte
  ficticios; nunca utilizan Secret Manager o la AEAT reales.
- Reserva transaccional por empresa en `verifactuConfig/delivery_test`, reserva
  de dos minutos e identificador único por intento. La confirmación verifica
  ambas reservas, número de intento y vigencia. Una respuesta tardía no puede
  sobrescribir el intento confirmado. Cola, factura y evento se actualizan en
  la misma transacción; un resultado antiguo no pisa una corrección/anulación
  posterior de esa factura.
- El XML SOAP se conserva desde el primer intento junto con su SHA-256. Se
  reenvía idéntico tras una interrupción: no se cambian fechas, huellas ni
  registros fiscales emitidos. Si un intento antiguo no tiene esta copia,
  requiere revisión y no se reconstruye silenciosamente.
- Reintentos exponenciales, máximo ocho, recuperación de reservas caducadas y
  respeto tanto de `nextAttemptAt` como de `TiempoEsperaEnvio` por empresa,
  también después de una aceptación y sin recortar la espera a una hora.
- Se respeta el antecesor de la cadena y el alta previa a una anulación. La
  recuperación pagina candidatos, sin confundir orden por ID con orden fiscal
  cuando varias facturas del lote tienen la misma fecha de creación.
- Validación de respuesta única con NIF, número, fecha y operación coincidentes.
  Duplicados, respuestas ambiguas, incidencias permanentes o intentos agotados
  pasan a `needs_review` / «Necesita revisión», no a una aceptación supuesta ni
  a un rechazo fiscal inventado. Un rechazo explícito de AEAT sí es «Rechazado».
- Se elimina del sender cloud la instrucción de recrear registros demorados:
  ahora pide revisar sin borrar/regenerar. **Aún falta el procedimiento final
  para resolver esa incidencia y consultar/reconciliar duplicados**; el bloqueo
  conservador no equivale a tener resuelto ese flujo de producción.
- Windows no puede reclamar ni sobrescribir resultados del motor cloud. El
  registro manual de resultados tampoco puede fabricar/alterar respuestas de
  PFX/P12. Se impide cambiar a cloud con envíos inciertos de un conector antiguo.
- La interfaz muestra «Necesita revisión» y el mensaje actual de la incidencia.
  El botón ya no anuncia que AEAT ha respondido cuando solo terminó un intento.

### Verificación

- 117 tests de servidor, guardado de ajustes y disposición del panel superados.
  Incluyen 51 casos del motor/entradas cloud: doble clic, recuperación, respuesta
  tardía, XML idéntico, credenciales desconectadas, espera, límite de reintentos,
  identidad de respuesta, alta/anulación/subsanación y protección de APIs antiguas.
- 6 tests adicionales contra el emulador local de Firestore, proyecto ficticio
  `demo-verifactu-isolation`: cuatro de permisos y dos de transacciones reales
  concurrentes/recuperación. Transporte siempre simulado, sin acceso AEAT.
- Compilación web y comprobación de sintaxis del servidor correctas. El `dist`
  local también contiene cambios ajenos a VeriFactu y NO debe publicarse tal cual.

Comandos reproducibles:

```text
node --test functions/test/*.test.cjs test/verifactuBillingSave.spec.cjs test/verifactuPanelLayout.spec.cjs
firebase emulators:exec --only firestore --project demo-verifactu-isolation "node --test test/verifactuEnvironment.rules.cjs test/verifactuCloudWorker.emulator.cjs"
npm run build
```

### Para continuar (no dar producción por terminada)

1. Extender a Windows las confirmaciones por intento, espera y recuperación de
   su propio canal; proteger cloud frente a Windows NO resuelve aún todas las
   respuestas tardías entre dos intentos Windows. Distribuir y probar esa
   actualización del conector sin abrir producción.
2. Completar consulta/reconciliación de duplicados y resolución de envíos
   demorados, con interfaz clara. El transporte puede repetirse tras una caída;
   no prometer «exactamente una vez» en red. No regenerar registros emitidos.
3. Probar capacidad y equidad del recuperador multiempresa bajo carga: esta
   revisión recupera como máximo un intento por empresa y ejecución periódica,
   recorriendo empresas secuencialmente. No presentarlo como cola de producción
   dimensionada; terminar su planificación antes de cerrar la versión final.
4. Implementar autorización privada de producción, fecha efectiva, comprobación
   de versión/declaración y pantalla de activación deliberada. Seguir bloqueando
   el transporte real durante desarrollo y no activar por el calendario.
5. Despliegue aislado/coordinado: todos los escritores del estado fiscal del
   bloque anterior, `sendAeatCloudTestSubmission`, `recordAeatTestResult`,
   `localConnectorClaim`, `localConnectorResult`, los dos nuevos disparadores,
   reglas, índices y cliente. Los índices nuevos están en
   `firestore.indexes.json`. Resolver mantenimiento/transición sin escritores
   antiguos concurrentes y comprobar IAM de las nuevas funciones. Mantener
   ambos permisos automáticos cerrados y no enviar registros como prueba del
   despliegue sin autorización adicional.
6. Cerrar versión definitiva y declaración del productor después de completar
   la revisión. Renovar el certificado, que caduca el 20/11/2026, antes del
   comienzo previsto el 01/01/2027. La declaración actual de revisión no se ha
   regenerado ni convertido en definitiva por este avance.

**Grafo:** se solicitó reindexación, pero volvió a devolver 3168 nodos y 8679
aristas sin encontrar `createAeatCloudWorker`, `automaticAeatTestEnabled` ni
`readFiscalState`; no afirmar que está sincronizado. Este expediente y los
archivos nuevos son el punto de continuación hasta reparar la indexación.

## 31/08/2026 · Conector Windows v2 y recuperación de recibos (LOCAL)

Actualiza el punto 1 del bloque anterior. Implementado y probado en el workspace,
**sin publicar, instalar sobre el equipo del usuario, abrir su certificado ni
enviar registros a la AEAT**. Producción sigue bloqueada; no se han modificado
los permisos del envío automático cloud ni firmado documentos.

### Cambios cerrados en este bloque

- `createAeatCloudWorker` ahora ofrece también `claimLocal`/`resultLocal` para
  `channel=local_connector`, utilizando la misma reserva por empresa, cadena,
  espera AEAT, huella SOAP congelada, intentos y clasificación de incidencias.
  Cada reclamación Windows exige protocolo 2, certificado vigente, latido reciente
  y vinculación coincidente. La clave privada permanece en Windows.
- `localConnectorClaim`/`localConnectorResult` sustituyen el circuito antiguo sin
  identificador de intento. Los clientes antiguos reciben solicitud de actualización
  y no trabajos. Los resultados se interpretan en servidor desde el XML HTTP, no
  desde un estado «aceptado» que afirme el cliente. El endpoint manual tampoco
  puede fabricar resultados de Windows.
- Confirmación Windows idempotente: repetir un recibo ya registrado devuelve
  confirmación sin duplicar eventos, intentos o estados. Se admite un recibo
  guardado después de caducar su reserva **solo si nadie la ha reemplazado**.
  Un resultado de un intento sustituido no cambia el estado: se conserva en el
  equipo y aparece una advertencia de revisión en la plataforma.
- `ConnectorProtocol.ps1`: diario por empresa cifrado con DPAPI del usuario,
  escritura temporal, vaciado a disco y sustitución atómica. Hay marca durable
  antes de enviar y recibo durable después. Primero se recupera el recibo; no se
  reclama otro trabajo mientras esté pendiente. Si el proceso cayó antes de
  guardar la respuesta, se informa de incertidumbre y el servidor conserva el
  XML original para el reintento. No se garantiza «exactamente una vez» en red.
- Windows comprueba permiso de intento, fecha límite, entorno, destino exacto,
  SHA-256, NIF, vigencia/clave privada y esquema. Sin redirecciones HTTP; TLS 1.2,
  límite de respuesta de 512 KiB y tiempo de espera acotado. Los endpoints de
  plataforma también están restringidos a la lista conocida, sin redirecciones.
- Mutex por empresa/sesión para evitar dos procesos locales. Los fallos de
  plataforma conservan el diario. No se permite revincular localmente o borrar
  la instalación con recibos pendientes. Las comprobaciones de salud ya no
  cambian el canal elegido por el usuario (antes podían reemplazar PFX/P12).
- La plataforma indica cuándo actualizar Windows y cuándo hay un resultado
  protegido pendiente de revisión. Se retiró el texto categórico del margen de
  cuatro minutos: ante demora se pide revisar, no borrar/reemitir la factura.
- ZIP de revisión `public/downloads/LimpiaGest-Conector-Windows.zip`, versión
  `2.0.0-preview`, protocolo 2, con 19 archivos verificados y sin credenciales.
  Se regenera mediante `scripts/package_verifactu_connector.ps1`; no es todavía
  el instalador firmado definitivo. La actualización conserva vinculación y
  diario; requiere reiniciar Windows. No distribuirla antes de su servidor v2.

### Verificado sin AEAT ni datos reales

- 126 tests Node de servidor/interfaz, incluidos los escenarios nuevos de
  Windows, repetición de recibo, intento sustituido, vinculación ajena, respuesta
  duplicada/ajena y latido sin cambios de canal.
- 28 comprobaciones ejecutadas en Windows PowerShell: protocolo, integridad,
  diario antes/después del envío, caída de disco/plataforma, no repetir el envío
  para confirmar el recibo, retención para revisión y DPAPI con datos ficticios.
  Se detectó y corrigió la conversión de `$null` a cadena vacía de PowerShell 5
  al usar `File.Replace`, comprobando la sustitución atómica real.
- 8 tests contra Firestore emulado: cuatro de permisos y cuatro de concurrencia
  y recuperación cloud/Windows. Sin transporte real. Compilación web correcta.

### Lo que todavía falta para el cierre completo

1. Consulta formal y reconciliación con AEAT de duplicados/recibos inciertos,
   especialmente cuando otro intento ya sustituyó al del diario, y resolución
   de primeros envíos demorados. No marcar aceptado basándose solo en el código
   de duplicado ni borrar diarios/registros para «limpiar» una incidencia.
2. Interfaz administrativa para resolver esa revisión y comprobar el cierre de
   la incidencia. El aviso y la conservación segura ya existen; aún no un
   asistente completo de reconciliación. La renovación o cambio de vinculación
   debe contemplar expresamente los recibos pendientes.
3. Capacidad/equidad de recuperación multiempresa, activación privada y fecha
   efectiva, versión/declaración definitivas e instalador firmado. Continúan
   pendientes los criterios de producción del inicio de este expediente.
4. Despliegue coordinado: añadir `localConnectorHeartbeat` y
   `getLocalConnectorStatus` a los endpoints enumerados en el bloque anterior,
   publicar el ZIP y el cliente juntos con los índices/reglas y completar el
   cambio del estado fiscal sin escritores antiguos concurrentes. Resolver
   trabajos antiguos inciertos antes del corte; no ejecutarlos sin protocolo 2.
5. Prueba integrada del paquete instalado, exclusivamente con autorización de
   pruebas y tras el despliegue coordinado. Las pruebas de este bloque usan
   adaptadores simulados y emulador; no sustituyen esa validación final.

La declaración no se ha regenerado. Mantener el objetivo del 01/01/2027 y la
renovación del certificado que caduca el 20/11/2026. No activar por fecha ni
solicitar facturas reales anticipadas. El grafo seguía desactualizado; retomar
desde este expediente y los archivos nuevos mientras no incorpore las funciones.

## 01/09/2026 · Consulta y conciliación oficial AEAT (LOCAL)

Este bloque sustituye los puntos 1 y 2 pendientes del apartado anterior. Está
implementado y verificado localmente, **sin consultar ni enviar datos reales,
sin desplegar y sin abrir producción**.

### Flujo terminado

- Generador SOAP de `ConsultaFactuSistemaFacturacion` con el contrato oficial:
  obligado emisor, ejercicio, periodo, número y fecha exactos. El XML generado
  se valida contra `ConsultaLR.xsd` y `SuministroInformacion.xsd` incluidos en
  el paquete.
- Intérprete estricto de `RespuestaConsultaFactuSistemaFacturacion`: rechaza
  HTTP/Fault/respuestas ajenas, controla paginación y extrae cada identificación,
  estado, huella, error y fecha de modificación.
- Conciliación conservadora. Para altas/subsanaciones solo confirma si NIF,
  número, fecha y huella coinciden exactamente y el estado es `Correcto` o
  `AceptadoConErrores`. Para una anulación, la misma identidad y estado
  `Anulada` confirman el resultado perseguido. «Sin datos», paginación, varias
  coincidencias, otra huella o estado inesperado permanecen en `needs_review`.
  Nunca se infiere aceptación solo por un duplicado y nunca se reenvía desde
  este flujo.
- Reserva transaccional compartida con los envíos (`delivery_test`), token de
  intento, consulta congelada con SHA-256 y comprobación doble de permisos,
  entorno y certificado antes de usar el PFX/P12. Las respuestas tardías no
  pueden sobrescribir una consulta posterior.
- Botón «Comprobar en AEAT» para incidencias, con confirmación expresa y texto
  que aclara que es una consulta y no un envío. La evidencia conciliada se
  conserva en la cola y en el registro operativo.
- El mismo flujo funciona con certificado cloud y con Windows. El conector
  diferencia `submit` de `query`, valida ambos con el esquema correspondiente y
  conserva la operación y su recibo en el diario DPAPI hasta confirmación. La
  capacidad `query_reconciliation_v1` evita entregar consultas a instalaciones
  antiguas. Paquete actualizado a `2.1.0-preview`, protocolo 2.

### Verificación sin AEAT

- 127 tests Node del servidor superados, incluidos generador, intérprete,
  coincidencia/huella, «Sin datos», paginación, anulación y autorización de la
  función pública.
- 5 pruebas de guardado/disposición del panel, 30 comprobaciones PowerShell del
  conector y diario, y 8 pruebas con Firestore emulado superadas.
- Consulta sintética validada con los XSD oficiales; compilación web correcta.
- ZIP regenerado con 19 archivos comprobados, sin PFX/P12, credenciales ni
  diarios. No instalar hasta desplegar conjuntamente servidor y web.

### Pendiente real tras este bloque

1. Prueba integrada deliberada de **consulta** contra AEAT de pruebas con una
   incidencia adecuada y autorización del usuario. No crear una incidencia
   fiscal artificial ni reenviar una factura para provocar un duplicado.
2. Capacidad/equidad multiempresa, instalador Windows firmado y plan coordinado
   de despliegue/migración; resolver previamente cualquier recibo antiguo.
3. Renovar el certificado antes del 20/11/2026, cerrar versión/declaración
   definitiva y realizar la activación privada de producción cerca del
   01/01/2027. Producción continúa bloqueada por código y configuración.

**Grafo:** el índice disponible continuaba sin incorporar las funciones nuevas.
Este apartado y `aeatReconciliation*.js` son el punto fiable de continuidad
hasta que el indexador vuelva a reflejar el workspace actual.

## 03/09/2026 · Despliegue coordinado completado

- Publicados en `ryb-limpiezas-app` las reglas de Firestore y Storage, los
  índices, las 52 funciones Node.js 22 y la interfaz web.
- Verificadas como activas en `europe-west1` las cuatro piezas nuevas:
  `onAeatCloudTestSubmissionCreated`, `reconcileAeatCloudTestSubmission`,
  `recoverAeatCloudTestSubmissions` y `requestAeatLocalTestReconciliation`.
- El hosting responde correctamente en
  `https://ryb-limpiezas-app.web.app/admin/facturas` con la versión publicada
  el 03/09/2026.
- El conector descargable queda coordinado en `2.1.0-preview`, con protocolo 2
  y capacidad `query_reconciliation_v1`.
- Grafo de conocimiento regenerado con 2.731 nodos y 7.832 relaciones; ya
  incorpora `aeatReconciliation.js`, su worker y los puntos de entrada web.
- No se ha ejecutado ninguna consulta adicional ni ningún envío real a la AEAT
  durante el despliegue. La producción fiscal sigue bloqueada por código y por
  configuración.

### Continuidad pendiente deliberada

1. Ejecutar, con autorización expresa y sobre una incidencia válida ya
   existente, una primera consulta integrada contra la AEAT de pruebas.
2. Antes de distribución comercial: prueba de capacidad/equidad multiempresa,
   firma del instalador Windows y cierre del plan de migración.
3. Renovar el certificado antes del 20/11/2026 y efectuar la activación privada
   de producción cerca del 01/01/2027, tras la revisión final de la normativa y
   del expediente de versión.

## Puntos de entrada

- `src/components/admin/VerifactuPanel.jsx`
- `src/components/admin/VerifactuDocuments.jsx`
- `src/services/verifactuDocumentService.js`
- `test/verifactuDocuments.spec.cjs`
- `test/verifactuDocumentStorage.rules.cjs`
- `src/pages/admin/InvoicesPage.jsx`
- `src/services/invoiceService.js`
- `src/utils/verifactuQr.js`
- `functions/index.js`
- `functions/lib/invoiceEmission.js`
- `functions/lib/verifactuRelease.json`
- `functions/lib/verifactuEnvironment.js`
- `functions/test/verifactuEnvironment.test.cjs`
- `test/verifactuEnvironment.rules.cjs`
- `test/verifactuBillingSave.spec.cjs`
- `functions/test/verifactuRelease.test.cjs`
- `scripts/create_verifactu_declaration.py`
- `functions/lib/aeatSubmission.js`
- `functions/lib/aeatCloudWorker.js`
- `functions/lib/aeatCloudSender.js`
- `functions/test/aeatCloudWorker.test.cjs`
- `test/verifactuCloudWorker.emulator.cjs`
- `firestore.indexes.json`
- `connector/windows/Connect-LimpiaGest.ps1`
- `connector/windows/ConnectorProtocol.ps1`
- `connector/windows/Test-ConnectorProtocol.ps1`
- `connector/windows/VERSION.json`
- `scripts/package_verifactu_connector.ps1`
- `connector/windows/Install-LimpiaGestConnector.ps1`
- `connector/windows/Test-OfficialSoapSchema.ps1`
- `functions/test/aeatSubmission.test.cjs`
- `functions/test/invoiceEmission.test.cjs`
- `test/verifactuQr.spec.cjs`
- `firestore.rules`
