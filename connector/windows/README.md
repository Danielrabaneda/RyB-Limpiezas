# Conector local VeriFactu para Windows

Este componente usa directamente un certificado con clave privada instalado en
el almacén de Windows. No exporta la clave, no guarda contraseñas y no debe
recibir archivos PFX/P12.

## Estado

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

## Arquitectura prevista

El conector reclamará un registro de la cola de Firebase mediante una
credencial rotatoria propia, construirá el SOAP oficial, lo validará con los XSD
incluidos en `schemas/test`, lo enviará usando el certificado de Windows y
devolverá a Firebase el estado y los datos no sensibles de la respuesta.

El token del conector se guardará protegido mediante DPAPI para la cuenta que
ejecute la tarea programada. Nunca se incluirá en Git ni en este directorio en
texto claro.
