# Referencia oficial de LimpiaGest web

Firebase publicó la versión `c80499dcfa5dcc58` el **20 de noviembre de 2026 a las 17:40 (hora peninsular)**. Esta carpeta conserva los 152 archivos de esa publicación y la configuración de Hosting que los servía. La captura se cotejó con los dos dominios oficiales y con las huellas de Firebase.

| Archivo o carpeta | Contenido |
| --- | --- |
| `site/` | Archivos exactos de la publicación, incluido el instalador público |
| `manifest.json` | Inventario, tamaños y huellas SHA-256 |
| `hosting-config.json` | Reglas de publicación y caché de la web |
| `verify.mjs` | Comprobación local y comparación opcional con ambos dominios |

La página carga `assets/index-hQ_PNSgh.js`. Esta entrada utiliza `assets/InvoicesPage-DGQEYQLS-wa20261120.js`, que conserva el cálculo de importes netos durante la edición, la referencia de la factura rectificada en el listado y el PDF, y la opción de compartir el PDF por WhatsApp. El inventario contiene también las revisiones anteriores que permanecían alojadas.

Para comprobar los archivos desde la raíz del repositorio:

```powershell
node releases/hosting/c80499dcfa5dcc58/verify.mjs
node releases/hosting/c80499dcfa5dcc58/verify.mjs --live
```

La primera comprobación sirve para conservar la referencia histórica. La segunda comprueba que los archivos siguen disponibles en `ryb-limpiezas-app.web.app` y `limpiagest.es`. Para verificar cuál está activa en cada momento, hay que consultar además el canal `live` de Firebase.

`site/` es el resultado publicado. Los archivos editables del repositorio tienen su propio historial y todavía no reproducen esta publicación. Esta referencia corresponde a la web y a sus recursos públicos. Firestore, Authentication, las funciones y las credenciales se gestionan en Firebase.
