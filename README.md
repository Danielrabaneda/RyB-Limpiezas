# LimpiaGest

La referencia de la web publicada el 20 de noviembre de 2026 es la [versión `c80499dcfa5dcc58`](releases/hosting/c80499dcfa5dcc58/README.md). Contiene los 152 archivos exactos de Hosting y el inventario para cotejarlos con ambos dominios oficiales.

Esta rama conserva también el código editable de la web que se recuperó a partir de esa publicación, incluidos los últimos cambios de facturas. Para comprobar la referencia o compilar el código:

```powershell
node releases/hosting/c80499dcfa5dcc58/verify.mjs
npm ci
npm run build
node --test test/invoiceEditNet.spec.cjs
```

Firebase mantiene las versiones de las funciones y de las reglas de acceso de forma independiente. Antes de publicar cambios, consulta el canal `live` y comprueba qué servicios afecta el despliegue.
