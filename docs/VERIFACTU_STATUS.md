# Estado de cierre de facturación y VeriFactu

Actualizado: 30 de agosto de 2026.

## Terminado, probado y publicado

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

Completar el borrador con los datos definitivos del productor, someter el
sistema y las evidencias a revisión técnica/legal independiente y firmar la
declaración responsable exigible antes de comercializar o activar producción.

### 2. Distribución firmada y activación controlada de producción

Adquirir un certificado de firma de código, firmar el instalador Windows y
realizar la revisión final. Solo entonces debe habilitarse mediante un cambio
separado y deliberado el endpoint de producción y el modo exclusivo exigible.

## Cómo continuar

No crear otra alta ni repetir la subsanación o la anulación: las tres ya
están aceptadas y el anexo documental está actualizado. Continuar con la
revisión/firma y la distribución firmada. El certificado `.p12` sigue conectado;
no hace falta volver a introducir la clave. Por instrucción expresa del
usuario, producción permanece bloqueada: no activar endpoints ni modificar
las barreras de producción al continuar tareas documentales.

## Puntos de entrada

- `src/components/admin/VerifactuPanel.jsx`
- `src/pages/admin/InvoicesPage.jsx`
- `src/services/invoiceService.js`
- `src/utils/verifactuQr.js`
- `functions/index.js`
- `functions/lib/invoiceEmission.js`
- `functions/lib/aeatSubmission.js`
- `connector/windows/Connect-LimpiaGest.ps1`
- `connector/windows/Install-LimpiaGestConnector.ps1`
- `connector/windows/Test-OfficialSoapSchema.ps1`
- `functions/test/aeatSubmission.test.cjs`
- `functions/test/invoiceEmission.test.cjs`
- `test/verifactuQr.spec.cjs`
- `firestore.rules`
