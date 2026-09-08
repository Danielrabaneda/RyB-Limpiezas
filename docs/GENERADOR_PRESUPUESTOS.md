# Generador de Presupuestos de LimpiaGest

## Pantallas y flujo

1. **Listado comercial**: indicadores de pendientes, valor en negociación y conversión; buscador, filtro por estado, tabla y accesos a seis plantillas.
2. **Editor**: datos del CRM y condiciones en la cabecera, líneas agrupadas por zonas, totales automáticos, notas internas/externas y vista PDF simultánea. En móvil, Editor y Vista PDF se muestran como pestañas.
3. **Documento profesional**: identidad fiscal, cliente, validez, partidas, IVA opcional, condiciones y pie corporativo.
4. **Conversión**: un presupuesto aceptado puede generar tareas recurrentes en planificación o un borrador de factura, conservando el `quoteId` como referencia.

El acceso se encuentra en **Panel de gestión → Presupuestos**. También existe una acción **Presupuesto** en la ficha de cada comunidad y un acceso rápido en Dashboard.

## Modelo de datos

Todas las colecciones se alojan bajo `companies/{companyId}`:

- `quotes`: cabecera, cliente, oportunidad opcional, estado, versión, fechas, responsable, frecuencia, condiciones, líneas, importes, configuración visual, auditoría y actividad.
- `quoteVersions`: copia inmutable de la versión anterior cuando se modifica un documento ya enviado.
- `communities`: origen CRM del cliente, dirección y datos fiscales.
- `communityTasks`: destino al convertir el presupuesto en servicio recurrente.
- `invoices`: destino al convertir el presupuesto en factura; contiene la referencia `quoteId`.
- `settings/billing`: logo, datos fiscales, color, tamaños de marca y pie del documento.

Las reglas permiten acceso a presupuestos únicamente a administradores activos del mismo tenant. Las versiones se pueden crear y consultar, pero no modificar ni borrar.

## Plantillas base

- Comunidades: portal y escaleras por mes, garaje por m², cristales por unidad.
- Oficinas/locales: limpieza general por hora y aseos por unidad.
- Fin de obra: limpieza profunda por m² y remates por hora.
- Viviendas: limpieza general por hora con IVA reducido configurable.
- Industrial/almacenes: limpieza de nave por m².
- Especiales: cristales por m² y desinfección por servicio.

Todas las partidas, secciones, unidades, cantidades, precios, descuentos e IVA son editables.

## Estados y trazabilidad

`draft → sent → viewed → accepted/rejected/expired → converted_service/converted_invoice`

Cada cambio de estado añade un evento con fecha y usuario. La creación y cada modificación conservan autor y fecha. La numeración sigue `PRE-AAAA-0001` y se calcula dentro de cada empresa y ejercicio.

## PDF

El documento se genera en el navegador con jsPDF y AutoTable, evitando que datos comerciales salgan de la infraestructura de LimpiaGest. Usa la identidad definida en facturación y permite ocultar el desglose de IVA. Para una futura aceptación electrónica se recomienda generar el PDF definitivo en servidor, guardar su hash SHA-256 y usar un enlace firmado de un solo uso con registro de IP, fecha y consentimiento RGPD.

## Próximas integraciones previstas

El campo de referencia comercial del modelo admite enlazar oportunidades cuando se incorpore el pipeline. El envío real por correo debe conectarse al mismo transporte seguro ya empleado por facturación; la interfaz actual registra el estado y conserva el documento listo para descarga.
