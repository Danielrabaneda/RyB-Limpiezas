# Capacidad multiempresa: recuperación acotada

## Corrección implementada y verificada

Publicada correctamente únicamente functions:recoverAeatCloudTestSubmissions (europe-west1) en ryb-limpiezas-app. No se desplegó hosting ni se modificaron interruptores de automatización o producción. No se ejecutó manualmente el recuperador contra datos reales. Grafo actualizado. Sin push a GitHub en este bloque.

- Planificador en functions/lib/aeatRecoveryScheduler.js: cursor persistente por identificador de empresa, páginas de 20 y máximo 400 empresas examinadas por ejecución.
- Presupuesto cooperativo de 420 segundos frente al límite de función de 540. No cancela a mitad una petición; deja margen para terminar la operación en curso.
- Reserva transaccional de 600 segundos con propietario único; evita ejecuciones solapadas y permite recuperar tras caída. Un propietario antiguo no libera una reserva nueva.
- Avance del cursor antes de cada empresa: si falla, las siguientes conservan su turno. La empresa fallida se vuelve a visitar en la vuelta siguiente.
- Cursor de candidatos por empresa con fecha e identificador, máximo dos páginas de 50 y presupuesto cooperativo de 5 segundos antes de iniciar otra operación. Se conservan las reservas del worker y las comprobaciones de cadena fiscal.
- Estado privado en internalVerifactuRecovery/test y su subcolección companies, fuera de las rutas accesibles al cliente. No necesita modificar reglas ni crear permisos.
- Solo empresas con automatización explícita de TEST; no cambia el interruptor global ni la configuración de ninguna empresa.

Verificación: 137 pruebas Node superadas y 3 pruebas con Firestore emulado superadas (continuación de 100 empresas en dos ejecuciones, reserva concurrente y cursor con fechas iguales/documento eliminado). No se usaron certificados ni tráfico AEAT. La prueba usa tiempos simulados: no representa una certificación de rendimiento bajo carga real.

## Pendientes que no cubre esta corrección

### Ampliación de validación local

test/verifactuRecoveryLoad.emulator.cjs superado: 1.000 empresas sintéticas, una vuelta completa en tres ejecuciones de 400, 400 y 200 empresas, sin duplicados. Tiempos medidos de cada ejecución: 40.710 ms, 38.687 ms y 20.004 ms. Duración total de la prueba, incluida preparación: 104.724 ms. Base de datos emulada, worker fiscal sustituido por una función sin envío: no mide SOAP, AEAT, certificados, latencias cloud ni coste facturable. No extrapolar estas cifras a un compromiso comercial.

Preparado docs/VERIFACTU_MIGRACION_WINDOWS.md. La comprobación de scripts/test_verifactu_release_signatures.ps1 detectó los 8 scripts PowerShell sin firma y terminó con error de bloqueo esperado. No se firmó ni se instaló nada. Sigue pendiente disponer del medio de firma del editor, firmar y verificar el paquete final, y ensayar la actualización en Windows piloto. No hay despliegue ni push nuevos en esta ampliación: solo pruebas, comprobación de firma y documentación.

Medir rendimiento e índices en un entorno de ensayo representativo, revisar costes de lectura con el volumen comercial previsto, firma del instalador Windows y plan de migración. No dar por terminado todo el punto 3 ni la preparación comercial por estas pruebas.

## Historial: diagnóstico previo

## Resultado

Tres pruebas locales en functions/test/aeatRecoveryCapacity.test.cjs superadas. Ejecutan la orquestación actual de functions/index.js con dependencias simuladas, sin certificados, Firestore ni tráfico AEAT.

- Se recorren 100 empresas sintéticas aunque falle la primera.
- Se excluyen configuraciones de producción y rutas ajenas a companies.
- Se confirma una limitación del diseño secuencial: con 100 empresas y un coste hipotético de 6 segundos por empresa, el recorrido requiere 600 segundos, por encima del límite configurado de 540 segundos. Es un cálculo con reloj virtual, no una medición real de rendimiento ni una carga ejecutada en hosting.

## Pendiente para cerrar capacidad/equidad

El recuperador inicia el recorrido completo en cada ejecución, sin cursor persistente multiempresa. Una carga grande o lenta puede agotar el tiempo antes de atender las últimas empresas. Además, recoverAeatCompanyTest pagina candidatos sin presupuesto explícito por empresa.

Siguiente implementación: recorrido con presupuesto acotado por empresa y cursor persistente entre ejecuciones, asegurando avance aunque una empresa falle; evitar solapamientos mediante reserva transaccional del planificador y conservar las reservas existentes de envío por empresa. Verificar recuperación tras caída, rotación justa, desactivación global y alcance TEST en emulador antes de publicar.

Este bloque solo añade pruebas y documentación: no cambia el planificador desplegado, no habilita envíos automáticos ni producción. La firma del instalador y el cierre de migración siguen siendo tareas separadas. No se declara terminada la capacidad comercial.
