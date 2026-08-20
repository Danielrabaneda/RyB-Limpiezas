# Estado de cierre de facturación y VeriFactu

Actualizado: 20 de agosto de 2026.

## Terminado y publicado

- Facturación fiscal transaccional: series, impuestos, huella SHA-256,
  encadenamiento, altas, anulaciones y subsanaciones.
- Cola por empresa con reclamación exclusiva, arrendamiento, idempotencia,
  reintentos exponenciales y registro de resultados.
- Sobre SOAP 1.1 oficial y validación previa contra los XSD publicados por la
  AEAT para VeriFactu 1.0.
- Conector Windows para certificados no exportables: detección automática por
  NIF, uso de la clave privada dentro del almacén de Windows y acceso mutuo TLS.
- Emparejamiento de un solo uso, token local protegido con DPAPI, latido,
  desconexión y cambio de ordenador desde LimpiaGest.
- Instalador de pruebas, inicio automático al entrar en Windows, desinstalador
  y paquete descargable desde la propia plataforma.
- Barreras del conector: solo admite el endpoint AEAT de pruebas y no transmite
  XML que incumpla el esquema oficial.
- Alternativa de carga `.pfx/.p12` custodiada por empresa en Secret Manager.
- Aplicación y funciones publicadas en Firebase sobre Node.js 22.
- Pruebas automáticas, compilación web, sintaxis PowerShell y validación XSD
  superadas. El certificado B04843843 fue detectado y su acceso al WSDL de
  pruebas quedó comprobado.

El certificado y su clave privada nunca salen de Windows en el flujo del
conector local. La plataforma recibe únicamente metadatos y resultados.

## Bloqueo de seguridad actual

El entorno permanece fijado en `test`, `productionEnabled` no puede activarse
desde la interfaz y el conector local solo acepta la URL AEAT de pruebas. No se
ha emitido ninguna factura real ni se ha realizado la primera transmisión
fiscal controlada.

## Las tres tareas finales pendientes

### 1. Primera transmisión y validación externa en AEAT de pruebas

Con autorización expresa, crear un caso fiscal de prueba controlado y conservar
las evidencias de alta, aceptación/rechazo, anulación, subsanación, reintento y
cotejo QR. Requiere que el ordenador con el certificado esté encendido.

### 2. Revisión legal y declaración responsable

Confirmar con asesoría los datos definitivos del productor de LimpiaGest,
revisar la batería de evidencias y preparar, firmar y publicar la declaración
responsable exigible antes de la comercialización.

### 3. Distribución firmada y activación de producción

Adquirir un certificado de firma de código, firmar el instalador Windows y
realizar una revisión final independiente. Solo después deberá desarrollarse y
desplegarse la habilitación explícita de producción.

## Cómo continuar

Retomar esta tarea con la autorización para ejecutar el primer caso fiscal de
pruebas. No hace falta exportar el certificado: el conector utilizará el ya
instalado en Windows. Hasta entonces puede apagarse el ordenador; solo deberá
estar encendido cuando se vaya a transmitir o cuando deba procesar la cola.

## Puntos de entrada

- `src/components/admin/VerifactuPanel.jsx`
- `src/services/invoiceService.js`
- `functions/index.js`
- `functions/lib/invoiceEmission.js`
- `functions/lib/aeatSubmission.js`
- `connector/windows/Connect-LimpiaGest.ps1`
- `connector/windows/Install-LimpiaGestConnector.ps1`
- `connector/windows/Test-OfficialSoapSchema.ps1`
- `functions/test/aeatSubmission.test.cjs`
- `functions/test/invoiceEmission.test.cjs`
- `firestore.rules`
