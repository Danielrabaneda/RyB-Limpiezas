# Pipeline Comercial de LimpiaGest

## Pantallas

### Dashboard y Kanban

La cabecera muestra oportunidades abiertas, valor total y ponderado, conversión y tiempo medio de cierre. Debajo aparece la bandeja de seguimientos de los próximos siete días y los filtros por responsable, servicio y prioridad.

El Kanban incluye las etapas `Nuevo lead`, `Contactado`, `Interesado`, `Presupuesto enviado`, `En negociación`, `Ganado` y `Perdido`. Cada columna presenta número de oportunidades y valor acumulado. Las tarjetas se arrastran entre columnas; prioridad y falta de actividad producen alertas visuales.

### Vista de lista

Presenta oportunidad, etapa, servicio, responsable, cierre previsto, probabilidad e importe. Comparte búsqueda y filtros con el Kanban.

### Ficha lateral

Incluye datos comerciales editables, recorrido visual de etapas, llamada telefónica, registro de llamada, creación de presupuesto, recordatorio y timeline cronológico. Marcar una oportunidad como perdida exige indicar un motivo.

### Captación rápida

El formulario solicita únicamente nombre, contacto, teléfono, correo, zona, servicio, origen, valor y prioridad. Permite vincular una comunidad existente o conservar el registro como lead. También se admiten archivos CSV con cabeceras habituales en español.

## Flujo operativo

1. El comercial crea o importa un lead.
2. Registra una llamada o mueve la tarjeta a `Contactado` en pocos segundos.
3. Califica el lead y completa importe, probabilidad y fecha de cierre.
4. Desde la ficha crea un presupuesto, que conserva `opportunityId` y `clientId`.
5. Enviar el presupuesto mueve automáticamente la oportunidad a `Presupuesto enviado`.
6. Aceptar o convertir el presupuesto a servicio mueve la oportunidad a `Ganado`; rechazarlo la mueve a `Perdido`.
7. El presupuesto aceptado puede generar las tareas recurrentes de planificación o un borrador de factura.

## Modelo de datos

`companies/{companyId}/opportunities/{opportunityId}` contiene datos de contacto, enlace CRM, etapa, servicio, valor, probabilidad, cierre, responsable, origen, prioridad, recordatorio, referencia al presupuesto y actividad. Las actividades se guardan inicialmente dentro de la oportunidad para que la ficha responda con una sola lectura y pueda usarse bien desde móvil.

Los presupuestos almacenan `opportunityId`. Los cambios comerciales originados desde el generador actualizan de manera automática la etapa y el timeline de la oportunidad.

## Métricas

- Oportunidades abiertas.
- Valor bruto y valor ponderado por probabilidad.
- Conversión sobre oportunidades cerradas.
- Tiempo medio de cierre de oportunidades ganadas.
- Número y valor por etapa.
- Días sin actividad por oportunidad.
- Seguimientos previstos para hoy y próximos siete días.
- El modelo conserva responsable y motivo de pérdida para desgloses posteriores por comercial y causa.

## Seguridad y configuración

Las oportunidades están aisladas por empresa y solo son accesibles por administradores activos. Las etapas base se centralizan en `pipelineService.js`, preparadas para sustituirse por configuración persistida cuando se habiliten perfiles separados de Comercial y Solo lectura.

## Consideraciones de usabilidad

- Una tarjeta completa cambia de estado con un único arrastre.
- Registrar una llamada requiere elegir la acción e introducir el resultado.
- Teléfonos utilizan enlaces de llamada nativos en móvil.
- Las columnas se desplazan horizontalmente en pantallas pequeñas.
- Los formularios se reducen a una columna y la ficha ocupa todo el ancho en móvil.
- Los datos económicos permanecen visibles sin abrir cada oportunidad.
