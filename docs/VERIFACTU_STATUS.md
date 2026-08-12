# Estado de cierre de facturación y VeriFactu

Actualizado: 12 de agosto de 2026.

## Estado alcanzado

La aplicación queda preparada para trabajar de forma segura en modo VeriFactu
de pruebas. La activación de producción está bloqueada deliberadamente.

Implementado:

- emisión fiscal exclusiva desde Cloud Functions;
- numeración por series dentro de transacciones;
- cálculo fiscal, huella SHA-256 y encadenamiento inmutable;
- altas, anulaciones, subsanaciones y rectificativas;
- paquetes de transporte versionados con clave de idempotencia;
- cola por empresa, contador de intentos y espera exponencial;
- estados de aceptación, rechazo y reintento;
- panel administrativo para configuración, cola, descarga y operaciones;
- bitácora operativa `verifactuEvents`, inmutable desde el cliente;
- reglas de acceso para facturas, registros fiscales, cola y bitácora;
- pruebas unitarias de cálculo, huella, XML, manifiesto y reintentos.

El XML que se descarga es un paquete estable de transporte para pruebas. No se
presenta como un sobre SOAP aceptado por la AEAT: el conector final deberá
transformarlo y validarlo contra el WSDL/XSD oficial sin alterar el registro
fiscal ni su huella.

## Únicos bloqueos externos pendientes

### 1. Certificado electrónico y acceso AEAT

Pendiente recibir un certificado válido, su cadena y la autorización para usar
el portal de pruebas. Las credenciales no deben guardarse en Firestore ni en el
navegador; deberán residir en Secret Manager o en el conector local autorizado.

### 2. Validación externa completa

Pendiente ejecutar la batería de altas, anulaciones, subsanaciones, rechazos,
reintentos y cotejo QR contra el portal externo de la AEAT. Hasta superar esta
fase deben mantenerse `environment=test` y `productionEnabled=false`.

### 3. Declaración responsable y activación de producción

Pendiente completar los datos legales del productor, revisar la versión con un
asesor competente, firmar y publicar la declaración responsable. La activación
de producción deberá hacerse después mediante un cambio explícito, revisado y
desplegado; no existe un interruptor de producción accesible desde la interfaz.

## Continuación recomendada

1. Incorporar certificado mediante secretos o conector local.
2. Sustituir el contenedor de transporte por el SOAP oficial vigente y validar
   cada mensaje contra los esquemas de la AEAT.
3. Ejecutar y conservar las evidencias del portal de pruebas.
4. Completar y firmar la declaración responsable.
5. Habilitar producción en una versión posterior con revisión independiente.

## Puntos de entrada

- `src/components/admin/VerifactuPanel.jsx`
- `src/services/invoiceService.js`
- `functions/index.js`
- `functions/lib/invoiceEmission.js`
- `functions/lib/aeatSubmission.js`
- `functions/test/aeatSubmission.test.cjs`
- `functions/test/invoiceEmission.test.cjs`
- `firestore.rules`
