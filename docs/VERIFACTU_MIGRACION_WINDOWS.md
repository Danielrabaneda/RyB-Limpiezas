# Plan de actualización del conector Windows

Estado: procedimiento preparado, pendiente de ensayo en una instalación piloto y de firma de distribución. Exclusivamente TEST; no autoriza producción, borrado de recibos ni reenvíos fiscales.

## Aplazado por decisión del usuario — 06/09/2026

Se pospone contratar el servicio/certificado de firma de código. Editor: Limpiezas Raiba S. L. No se ha contratado Azure ni se ha generado confianza autofirmada. Retomar este apartado cuando el usuario autorice el medio de firma; entonces firmar archivos definitivos, validar el paquete y completar el piloto Windows. Hasta entonces no presentar el punto 4 como terminado. La continuación del proyecto prioriza el canal cloud PFX/P12, que no usa este instalador.

## Avance 06/09/2026: comprobación previa del instalador

### Recuperación implementada posteriormente

InstallerTransaction.ps1 prepara una carpeta completa antes de cambiar la instalación, comprueba hashes de scripts/esquemas y conserva copia de los datos existentes. El cambio usa renombrados dentro del mismo directorio padre; si falla el segundo, restaura el anterior. Si termina el proceso entre renombrados, la siguiente ejecución recupera primero el directorio antiguo. Las carpetas antiguas se conservan, no se borran automáticamente. Los datos privados y sus copias permanecen locales bajo el usuario; nunca se incluyen en el ZIP.

El conector actualizado mantiene un archivo abierto compartido durante su ejecución; el actualizador exige acceso exclusivo al mismo archivo antes de comprobar/copiar. Las versiones antiguas sin este bloqueo siguen requiriendo un piloto controlado y detener su arranque automático: la detección de procesos no elimina por sí sola todas las carreras del software antiguo.

Verificación: 10 comprobaciones previas y 5 de transacción superadas, incluyendo fallo entre renombrados, recuperación tras interrupción simulada, conservación de credenciales ficticias y bloqueo con conector activo simulado. No es una prueba de corte eléctrico real ni de registro/accesos directos. Si falla la vinculación o la creación de accesos, se conserva la versión completa instalada y se puede reejecutar; no se revierten credenciales del servidor.

Pendiente externo para cerrar comercialmente: firma del editor, Windows PowerShell 5.1 con política autorizada y piloto en Windows limpio/actualización desde la versión antigua. No se ha instalado en el ordenador del usuario ni publicado este paquete sin firmar. No marcar todo el punto 4 como cerrado.

InstallerPreflight.ps1 se ejecuta antes de copiar archivos o pedir un código de nueva vinculación. Valida el paquete TEST/protocolo 2, sintaxis PowerShell, ausencia de enlaces, resultados protegidos de cualquier empresa de la instalación y procesos activos. Si no puede identificar los procesos, bloquea la operación. No lee certificados, credenciales ni contenido de recibos. El instalador copia ahora también VERSION.json.

Diez comprobaciones offline superadas en PowerShell disponible, con archivos ficticios. Windows PowerShell 5.1 rechazó la ejecución por la política local; no se modificó esa política. La validación bajo Windows PowerShell 5.1 y el piloto real siguen pendientes. No se ejecutó el instalador, no se regeneró/publicó el ZIP ni se tocó la instalación del usuario.

Nota histórica anterior a InstallerTransaction.ps1: la comprobación previa por sí sola no proporcionaba reserva compartida, preparación separada ni recuperación. Esas piezas se implementaron posteriormente, como consta arriba; siguen pendientes las firmas y el piloto con versiones antiguas. No distribuir como instalador comercial definitivo.

## Antes de distribuir

1. Congelar versión de servidor, web y conector. El paquete actual es 2.1.0-preview, protocolo 2; no etiquetarlo como versión comercial definitiva.
2. Validar firmas de los scripts con scripts/test_verifactu_release_signatures.ps1. Exige Authenticode válido, uso de firma de código y sello de tiempo. Esta comprobación es previa a empaquetar: no acredita por sí sola la integridad del ZIP ni de un futuro instalador ejecutable.
3. Disponer del medio de firma de código del editor autorizado. No reutilizar automáticamente el certificado fiscal del cliente; no pedir P12, contraseñas o claves por chat. La firma real y la elección del proveedor siguen pendientes.
4. Construir el ZIP mediante la lista permitida de scripts/package_verifactu_connector.ps1 después de firmar; verificar de nuevo el contenido extraído y registrar SHA-256, versión y resultado de firmas. No modificar fuentes después de firmarlas.

## Piloto: una empresa y el mismo usuario de Windows

- Registrar versión, protocolo, canal elegido y estado de la cola antes de tocar la instalación.
- Revisar si existe un recibo protegido {empresa}.pending-result.dpapi. No abrirlo con editores, exportarlo, borrarlo ni moverlo a otra cuenta. DPAPI depende del usuario de Windows.
- Si hay recibo pendiente, dejar que la versión compatible confirme SOLO ese recibo con la plataforma. Si el intento ya fue reemplazado o no se puede confirmar, detener la migración y revisar la incidencia. Nunca emitir otra factura para resolverla.
- Una vez confirmados los recibos, detener de forma controlada el proceso antiguo y comprobar que no hay una operación en curso. Conservar copia privada de la instalación bajo el mismo usuario y acceso restringido; nunca en Git o descargas públicas.
- Actualizar con el paquete verificado manteniendo la vinculación. No generar un nuevo código salvo que haga falta una nueva vinculación y no existan recibos pendientes. El instalador actual copia fuentes antes del emparejamiento: no ofrece actualización atómica ni reversión automática.
- Reiniciar la sesión/Windows según la indicación del instalador y comprobar una única instancia, protocolo 2, canal intacto y certificado reconocido. No utilizar arranque manual adicional si ya está ejecutándose.
- Probar consulta TEST autorizada sobre una incidencia existente; verificar que los intentos de envío no aumentan y el resultado queda registrado.

## Criterios de detener o revertir

Firma no válida, protocolo incompatible, recibo sin confirmar, cambio inesperado de canal/empresa o pérdida de salud: detener nuevas operaciones, conservar evidencia y no cambiar credenciales. Volver a la versión anterior solo si es compatible con el diario y el servidor; si no, mantener el sistema detenido para revisión. No borrar registros fiscales, cursores o recibos como mecanismo de recuperación.

## Después del piloto

Registrar evidencia de actualización, arranque, consulta, conservación del diario y ausencia de doble envío. Ampliar por grupos pequeños; detener el siguiente grupo ante cualquier incidencia. La prueba piloto, la firma real, el instalador atómico y la validación en Windows limpio siguen pendientes: este documento no los da por ejecutados.
