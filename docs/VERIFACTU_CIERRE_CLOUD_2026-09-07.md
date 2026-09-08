# Revisión de cierre cloud P12/PFX — 07/09/2026

## Resultado

No está cerrado el circuito definitivo de producción. La firma Windows aplazada no bloquea por sí misma el canal cloud, pero no elimina los pendientes de software indicados abajo.

La copia tmp/verifactu-production conserva el commit 4283a48 sobre d8b1353. Se ejecutó su batería de servidor: 139 pruebas superadas, sin transmisión AEAT. Incluye las pruebas locales añadidas de duplicado histórico. Este resultado no certifica las partes ausentes ni autoriza publicar/activar producción.

## Diferencias detectadas antes de integrar

1. Recuperación de producción: functions/index.js, recoverAeatCompanyProduction y recoverAeatCloudProductionSubmissions mantienen recorrido secuencial sin cursor persistente multiempresa ni presupuesto por empresa. No incorporan aeatRecoveryScheduler.js publicado para TEST. Adaptar con estado y permisos propios de producción; nunca reutilizar el cursor/lease de TEST ni permitir activar mediante el calendario.
2. Consulta de incidencias: aeatReconciliationWorker.js está limitado a aeatSubmissions, delivery_test e isTestSubmissionEligible. La interfaz oculta Comprobar en AEAT cuando productionActive. Por tanto una incidencia real needs_review no tiene todavía el mismo circuito integrado de consulta conservadora. Implementar y probar offline antes de declarar cerrado; no reinterpretar una consulta TEST como evidencia real.
3. Integración: el bloque de producción modifica 36 archivos y no incorpora las mejoras posteriores del instalador, filtros y recuperación. Evitar sobrescribir el checkout principal o publicar directamente esa copia desactualizada. Integrar cambios de forma selectiva y repetir pruebas de reglas, interfaz, worker y separación por entorno.

## Evidencia externa ya disponible

Historial documentado: alta, subsanación y anulación TEST-VF-2026-0002 aceptadas en pruebas. Consulta TEST-VF-2026-0001 encuentra la factura pero no la huella de la subsanación; continúa rechazada como incidencia histórica. No se realizó nueva consulta externa en esta revisión. El certificado documentado caduca el 20/11/2026 y debe renovarse antes del inicio previsto.

## Orden para continuar

Validación posterior: test/verifactuProductionRecovery.emulator.cjs supera 3 pruebas con Firestore emulado en proyecto demo-verifactu-production-recovery: cursor con fechas iguales y documento anterior eliminado, rotación de 100 empresas ficticias entre ejecuciones acotadas y reserva transaccional que excluye una ejecución simultánea. Sin transporte AEAT ni certificados. La recuperación queda validada localmente (147 pruebas Node + 3 emuladas), todavía no integrada ni publicada.

Siguiente pieza delimitada en tmp/verifactu-production/docs/VERIFACTU_PRODUCTION_QUERY.md: consulta conservadora cloud con permiso separado del envío, para poder consultar durante una suspensión sin reabrir remisiones. Es diseño, no funcionalidad implementada. Mantener la producción bloqueada.

Actualización posterior del 07/09: recuperación de producción adaptada en tmp/verifactu-production, no integrada/publicada. Nuevo aeatProductionRecoveryScheduler.js con estado internalVerifactuRecovery/production, reserva de 600 segundos, presupuesto cooperativo de 420 segundos, páginas de 20 empresas y máximo 400 por ejecución. Usa productionActivation activa y versión exacta; los controles completos de certificado, entorno, empresa y autorización permanecen en el worker. Cada empresa conserva su cursor de candidatos real, con dos páginas de 50 y presupuesto cooperativo de 5 segundos antes de otra operación. No se cancelan operaciones a mitad.

147 pruebas de servidor superadas, incluidas 8 nuevas de recuperación: continuación de 100 empresas, fallos, exclusión concurrente, recuperación de reserva caducada, versión/activación, barrera cerrada, separación de TEST y límite/continuación de candidatos. Dependencias simuladas, sin certificados, tráfico AEAT ni datos reales. Falta verificar esta adaptación en emulador durante la integración y cerrar la consulta de incidencias de producción. No declarar terminada toda la vía cloud.

Primero adaptar recuperación multiempresa de producción en la copia aislada, con pruebas sin red y barreras cerradas. Después completar consulta conservadora de producción y probar resultado incierto, huella diferente, autorización y cambio de certificado. Luego integración selectiva y revisión del expediente de versión/declaración. Mantener Windows firmado aplazado, producción bloqueada y ningún envío real anticipado.
