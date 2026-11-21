# Referencia oficial de LimpiaGest web

Firebase publicó la versión `c80499dcfa5dcc58` el **20 de noviembre de 2026 a las 17:40 (hora peninsular)**. Esta carpeta conserva los 152 archivos de esa publicación y la configuración de Hosting que los servía. La captura se cotejó con los dos dominios oficiales y con las huellas de Firebase.

| Archivo o carpeta | Contenido |
| --- | --- |
| `site/` | Archivos exactos de la publicación, incluido el instalador público |
| `manifest.json` | Inventario, tamaños y huellas SHA-256 |
| `hosting-config.json` | Reglas de publicación y caché de la web |
| `verify.mjs` | Comprobación local y comparación opcional con ambos dominios |

La página publicada carga `assets/index-hQ_PNSgh.js`. Esta entrada utiliza `assets/InvoicesPage-DGQEYQLS-wa20261120.js`, que conserva el cálculo de importes netos durante la edición, la referencia de la factura rectificada en el listado y el PDF, y la opción de compartir el PDF por WhatsApp. El inventario contiene también las revisiones anteriores que permanecían alojadas.

## Comprobación

```powershell
node releases/hosting/c80499dcfa5dcc58/verify.mjs
node releases/hosting/c80499dcfa5dcc58/verify.mjs --live
```

La primera orden coteja los archivos del repositorio con el inventario. La segunda los compara también con los dos dominios oficiales. Para saber qué versión está activa en cada momento, consulta además el canal `live` de Firebase.

## Código editable

El código editable está en `src/` y se compila con `npm run build`. La reconstrucción partió de la compilación local más próxima y reincorporó las correcciones observadas en el archivo de facturas publicado. De los 69 módulos y hojas de estilo alcanzables desde la entrada, 68 coincidieron tras normalizar los nombres generados y los comentarios de licencia. Se cotejaron los textos y propiedades del módulo de facturas y se comprobaron siete recorridos de WhatsApp contra la versión publicada, con datos ficticios. Cuatro casos de rectificación coincidieron en el listado y el PDF. Pasó también la comprobación de importes netos y decimales.

`site/` conserva la publicación original byte por byte. La nueva compilación genera sus propios nombres de archivo. El registro cubre Hosting, incluida su configuración pública. Las funciones de Firebase y las reglas de acceso tienen sus propias versiones.
