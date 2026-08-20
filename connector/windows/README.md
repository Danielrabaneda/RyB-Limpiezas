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

## Alta guiada en LimpiaGest

1. El administrador elige `Usar el certificado instalado en este ordenador`.
2. LimpiaGest genera un código de un solo uso válido durante 10 minutos.
3. `Connect-LimpiaGest.ps1` recibe el identificador de empresa y solicita ese
   código. No solicita ni exporta la contraseña del certificado.
4. El token resultante queda cifrado con DPAPI para el usuario de Windows.
5. El conector detecta el certificado por NIF, comprueba la conexión de pruebas
   de la AEAT y mantiene un latido cada minuto.

El siguiente paso de producto será empaquetar y firmar este componente como
instalador de Windows para que el cliente no tenga que abrir PowerShell.

## Arquitectura prevista

El conector reclamará un registro de la cola de Firebase mediante una
credencial rotatoria propia, construirá el SOAP oficial, lo validará con los XSD
incluidos en `schemas/test`, lo enviará usando el certificado de Windows y
devolverá a Firebase el estado y los datos no sensibles de la respuesta.

El token del conector se guardará protegido mediante DPAPI para la cuenta que
ejecute la tarea programada. Nunca se incluirá en Git ni en este directorio en
texto claro.
