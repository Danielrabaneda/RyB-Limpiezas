# Conector local VeriFactu para Windows

Este componente usa directamente un certificado con clave privada instalado en
el almacén de Windows. No exporta la clave, no guarda contraseñas y no debe
recibir archivos PFX/P12.

## Estado

Revisión local `2.1.0-preview`, protocolo 2. Requiere despliegue coordinado del
servidor antes de instalarla; no implica activación de producción. El ZIP de
revisión no es un instalador firmado para distribución definitiva.

- Certificado detectado: FNMT de representación de Limpiezas Raiba S.L.
- Almacén: `LocalMachine/My`.
- NIF esperado: `B04843843`.
- Entorno permitido: exclusivamente pruebas AEAT.
- Producción: bloqueada.

## Diagnóstico

1. Copiar `config.example.json` como `config.json`.
2. Ejecutar desde PowerShell:

```powershell
.\Test-VerifactuCertificate.ps1
```

El diagnóstico comprueba titular, NIF, caducidad, clave privada, cadena de
confianza y acceso al WSDL de pruebas. No remite registros de facturación.

## Alta guiada en LimpiaGest

1. El administrador elige `Usar el certificado instalado en este ordenador`.
2. LimpiaGest genera un código de un solo uso válido durante 10 minutos.
3. `Connect-LimpiaGest.ps1` recibe el identificador de empresa y solicita ese
   código. No solicita ni exporta la contraseña del certificado.
4. El token resultante queda cifrado con DPAPI para el usuario de Windows.
5. El conector detecta el certificado por NIF, comprueba la conexión de pruebas
   de la AEAT y mantiene un latido cada minuto.

El ZIP se construye con `scripts/package_verifactu_connector.ps1`, incluyendo
solo fuentes distribuibles. Sigue pendiente el instalador firmado definitivo.

## Envío y recuperación (protocolo 2)

El servidor reserva el registro por empresa e intento, congela el SOAP y su
SHA-256 y devuelve una autorización temporal solo de pruebas. Windows verifica
entorno, destino exacto, permiso vigente, NIF, certificado, huella y esquema.
Los redireccionamientos HTTP están deshabilitados. El servidor interpreta la
respuesta XML y comprueba número, NIF, fecha y operación antes de aceptarla.

Antes del envío se escribe una marca durable cifrada con DPAPI; después se
guarda el resultado recibido. Si la plataforma no confirma la recepción, se
reenvía solo el resultado. Repetir la confirmación es idempotente. Un recibo
demorado se acepta únicamente si su intento no ha sido reemplazado; si ya hay
otro intento, se conserva para revisión, sin pisar su estado.

Una caída antes de poder guardar la respuesta se trata como resultado incierto:
el servidor decide el reintento con el mismo XML, nunca regenerando la factura.
Si un envío queda incierto o aparece como duplicado, el administrador puede
solicitar «Comprobar en AEAT». El mismo diario protegido transporta la consulta
oficial y su respuesta. Solo una coincidencia exacta permite cerrar la incidencia;
«Sin datos», varias coincidencias o una huella diferente permanecen en revisión
y nunca provocan un reenvío automático.

El archivo `{empresa}.pending-result.dpapi` no contiene la clave privada del
certificado. No se borra hasta recibir confirmación del servidor. Una incidencia
pendiente bloquea nuevas remisiones desde esa instancia, revinculación local y
desinstalación. Un mutex evita dos instancias por empresa en la misma sesión;
la reserva del servidor protege también otras instancias/ordenadores.

Las comprobaciones de salud ya no cambian el canal elegido en la plataforma.
Los clientes del protocolo anterior no reciben trabajos y deben actualizarse.
Ejecutar `Test-ConnectorProtocol.ps1` prueba recuperación y cifrado con datos
ficticios, sin abrir el almacén de certificados ni conectarse a la AEAT.

El token del conector se guardará protegido mediante DPAPI para la cuenta que
ejecute la tarea programada. Nunca se incluirá en Git ni en este directorio en
texto claro.
