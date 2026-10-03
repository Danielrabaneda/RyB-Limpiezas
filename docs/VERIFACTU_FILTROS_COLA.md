# Consulta de la cola por periodo

Publicado en Firebase Hosting, sin desplegar funciones ni reglas. Verificado que el sitio sirve index-BPfkGKQo.js. La compilación de referencia anterior reprodujo index-DYR8VmNe.js, confirmando que se mantienen los cambios de las otras pantallas. Grafo actualizado; sin push a GitHub en este bloque.

Filtros independientes de año y mes, opción Todos y botón Ver todos. El periodo usa createdAt del registro convertido a Europe/Madrid, no la fecha de factura. Una anulación puede pertenecer a un mes distinto del alta.

Paginación visual de 10 filas, contador de coincidencias, fecha del registro y mensaje de periodo vacío. Se elimina el truncado anterior de 50 filas. Los registros sin fecha válida permanecen visibles con Todos. Los filtros no alteran la preparación, envío, anulación ni subsanación.

Pruebas: límites de mes/año en Madrid, Timestamp de Firestore, fecha inválida, filtros combinados, acceso a la fila 61 y ajuste de página fuera de rango. Cuatro pruebas, incluida la regresión de guardado, superadas; compilación web correcta.

Alcance: paginación visual sobre la colección que ya cargaba la pantalla; no es paginación de consultas Firestore. Con volúmenes muy grandes deberá trasladarse al servidor para reducir lecturas. No se cambian permisos, documentos fiscales ni entorno.
