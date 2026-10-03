# Diseño de la landing 3D de LimpiaGest

## Objetivo

Convertir propietarios de empresas de limpieza de 5 a 15 empleados en usuarios de una prueba completa de 30 días, sin tarjeta y con alta autónoma.

Promesa principal:

> Toda tu empresa de limpieza bajo control desde una sola app.

Apoyo:

> Planifica servicios, controla las horas y factura sin olvidos ni reclamaciones.

CTA principal: **Probar LimpiaGest gratis**
Microcopy: **30 días · Sin tarjeta · Acceso completo**

## Dirección visual

- Landing oscura y tecnológica, con fondos azul noche, azul eléctrico y acentos cian.
- Producto claro y limpio dentro de los dispositivos, preservando el contraste entre la web comercial y la aplicación real.
- Escena principal: centro de operaciones formado por un portátil, una tableta y un móvil en profundidad, usando capturas reales anonimizadas.
- Movimiento pausado, preciso y ligado a hitos de lectura. Evitar partículas y efectos decorativos sin significado.
- El contenido y los CTA permanecen siempre en HTML; la escena 3D nunca contiene la única versión de información esencial.

## Recorrido y storyboard 3D

| Estado | Mensaje | Escena | Movimiento | Alternativa móvil/reducida |
| --- | --- | --- | --- | --- |
| 1. Control | Toda tu empresa bajo control | Portátil central con planificación; móvil a la derecha | Entrada suave y pequeña respuesta al cursor | Composición estática con profundidad CSS |
| 2. Planifica | Ningún servicio se queda atrás | Calendario avanza al frente; tarjetas de servicio se ordenan | Cámara se aproxima a la planificación | Captura recortada y carrusel táctil |
| 3. Controla horas | Horas claras, sin discusiones | Pantalla de horas sustituye al calendario; móvil muestra jornada activa | Conexión visual entre móvil y panel | Dos capturas apiladas |
| 4. Resuelve | Evidencias para responder ante reclamaciones | Detalle de servicios ocupa el foco | Los estados pasan a completado | Captura única con anotaciones HTML |
| 5. Factura | Del servicio terminado a la factura | Facturación entra como última capa del centro | Las tareas completadas convergen en facturas | Captura de facturación sin WebGL |
| 6. Empieza | 30 días para ponerlo todo bajo control | Los dispositivos se alinean y aparece el CTA | Escena se estabiliza; sin bucle | CTA y precios en HTML |

## Arquitectura de contenido

### 1. Navegación

- LimpiaGest
- Cómo funciona
- Funcionalidades
- Precios
- Acceso clientes
- CTA persistente: **Probar gratis**

### 2. Hero

Etiqueta: **Software para autónomos y pequeñas empresas de limpieza**

Título: **Toda tu empresa de limpieza bajo control desde una sola app.**

Texto: **Planifica servicios, controla las horas de tu equipo y convierte el trabajo realizado en facturas, sin olvidos ni reclamaciones difíciles de resolver.**

CTA principal: **Probar LimpiaGest gratis**
CTA secundario: **Ver cómo funciona**

Debajo del CTA: **30 días gratis · Sin tarjeta · Acceso a toda la plataforma**

### 3. Problema

Título: **Cuando todo depende de ti, cualquier olvido cuesta dinero.**

Mostrar únicamente tres dolores:

- Servicios olvidados o mal planificados.
- Horas incorrectas y difíciles de comprobar.
- Reclamaciones sin información centralizada.

### 4. Historia de producto

Usar las cuatro pantallas reales: planificación, control horario, detalle de servicio y facturación. La captura móvil acompaña a planificación y horas para demostrar el recorrido entre oficina y operario.

Mensajes:

- **Planifica el mes de un vistazo.**
- **Comprueba las horas sin perseguir a nadie.**
- **Sabe qué se hizo y cuándo.**
- **Factura el trabajo terminado desde el mismo lugar.**

### 5. Configuración guiada

Título: **Empieza hoy, sin depender de un técnico.**

Pasos:

1. Crear empresa.
2. Añadir operarios.
3. Añadir clientes o comunidades.
4. Crear el primer servicio.
5. Configurar facturación.

El asistente aparece en el primer acceso, puede omitirse y retomarse desde el panel.

### 6. Prueba y confianza

Sustituir estadísticas y testimonios no verificables por hechos comprobables:

- 30 días de prueba.
- Sin tarjeta.
- Plataforma completa.
- Alta autónoma.
- Configuración guiada opcional.
- Datos protegidos y política de vencimiento explicada antes del registro.

No usar “cientos de empresas”, porcentajes de ahorro ni testimonios ficticios.

### 7. Planes

Mantener los planes y precios visibles. Presentar primero el plan recomendado para empresas de 5 a 15 empleados y conservar la comparación completa en HTML. Repetir **Probar gratis** en cada plan; no solicitar tarjeta hasta la contratación.

### 8. Cierre

Título: **Pon tu empresa bajo control en 30 días.**

Texto: **Prueba todas las funciones, añade tu equipo y crea tus primeros servicios. Decide después.**

CTA: **Empezar prueba gratuita**

## Registro y activación

Solicitar solo:

- Nombre.
- Nombre de la empresa.
- Email.
- Contraseña.
- Teléfono opcional.
- Aceptación separada de términos y comunicaciones comerciales.

Tras el registro, abrir el panel y mostrar el asistente de configuración. No enviar a un panel vacío sin orientación.

## Fin de prueba recomendado

- Avisos por email y dentro de la aplicación 7 días, 3 días y 1 día antes.
- Día 30: bloquear nuevas operaciones y mostrar selección de plan; mantener acceso de solo lectura.
- Periodo de recuperación recomendado: 7 días.
- Tras el periodo de recuperación: eliminar datos de forma irreversible si no se contrata.
- Informar de estas fechas durante el alta y permitir exportar información antes del borrado.

## Capturas anonimizadas

- `public/images/landing-3d/planning-anonymized.png`
- `public/images/landing-3d/hours-anonymized.png`
- `public/images/landing-3d/services-anonymized.png`
- `public/images/landing-3d/billing-anonymized.png`
- `public/images/landing-3d/mobile-anonymized.png`

Todas usan identidades, empresas, comunidades e identificadores fiscales ficticios. Conservar las capturas originales fuera de la landing.

## Comportamiento responsive y accesible

- Escritorio: escena 3D completa con estados por scroll.
- Tableta: escena simplificada, menos profundidad y sombras.
- Móvil: composición 2.5D con capturas animadas; no cargar la escena WebGL completa.
- `prefers-reduced-motion`: mostrar capturas estáticas y transiciones discretas.
- Fallback sin WebGL: recorrido completo en HTML con las mismas capturas y CTA.
- No secuestrar el scroll; mantener navegación por teclado, foco visible y contraste AA.

## Presupuesto de rendimiento

- Contenido y CTA visibles antes de cargar la escena.
- Cargar el 3D después del primer render y solo en dispositivos adecuados.
- Convertir las capturas finales a WebP/AVIF y servir tamaños responsivos.
- Objetivo orientativo: escena y texturas iniciales por debajo de 1,5 MB; resto bajo demanda.
- Limitar resolución de render a la densidad realmente visible y pausar la escena fuera del viewport.

## Métricas

- Clics en **Probar gratis**.
- Inicio y finalización del registro.
- Finalización de cada paso del onboarding.
- Creación del primer operario, cliente y servicio.
- Activación: empresa que completa al menos tres pasos clave durante la prueba.
- Conversión de prueba a pago.
- Abandono por sección y variante móvil/escritorio.

## Recomendación técnica para la futura implementación

Mantener React y Vite. Usar React Three Fiber solo para la escena de dispositivos y cámara; mantener textos, precios, formularios y navegación en el DOM. Usar un único controlador de estados de scroll. Separar la landing actual en componentes antes de incorporar la escena, porque `LandingPage.jsx` concentra actualmente estilos, contenido y comportamiento en un archivo extenso.
