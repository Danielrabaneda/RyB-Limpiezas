# Consulta AEAT de duplicado histórico — 05/09/2026

## Publicado y verificado

- Función reconcileAeatCloudTestSubmission (europe-west1) publicada correctamente.
- Hosting publicado desde tmp/verifactu-query-release, conservando los cambios comerciales que ya estaban en producción. La compilación previa sin esta corrección reprodujo el hash público index-FmIxEB94.js; versión corregida index-DH0-d99H.js.
- Botón Comprobar en AEAT visible para TEST-VF-2026-0001, alta_subsanacion, rechazado por duplicado histórico.
- 131 pruebas del servidor superadas y compilación web correcta en la copia de publicación.
- La consulta permite este rechazo histórico solamente por certificado cloud, archiva la respuesta original y no reenvía registros. Si no hay coincidencia exacta conserva el rechazo.
- Código integrado en el checkout principal sin alterar sus otros cambios pendientes.

## Resultado externo aportado posteriormente por el usuario

La captura posterior muestra: «La factura coincide, pero su huella no es la del registro inmutable de LimpiaGest». La consulta externa encuentra la identidad de la factura, pero no confirma este registro de subsanación. Se mantiene Rechazado y el contador de envío sigue en 1. La consulta está comprobada; la discrepancia histórica queda pendiente de revisión, sin reenvío ni aceptación forzada.

## Historial del intento inicial

Se pulsó Comprobar en AEAT. Apareció el aviso: consultar TEST-VF-2026-0001 en AEAT de pruebas sin enviar ningún registro nuevo. El control del navegador quedó bloqueado por un tiempo de espera de CDP durante la confirmación. No se pudo comprobar si llegó a aceptarse ni leer el resultado.

Continuar revisando primero el aviso y la cola, sin repetir ciegamente la operación. Antes del intento había 8 registros, 38 eventos operativos y 1 intento de envío para el duplicado. Comprobar la evidencia de conciliación y que los intentos de envío no aumentan. No modificar estados a mano ni fabricar otro duplicado.

Producción sigue bloqueada. Este despliegue NO incluye el trabajo de activación de producción del worktree verifactu-production. No se ha hecho push a GitHub en este bloque.
