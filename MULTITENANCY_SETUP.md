# Activación de multi-tenancy y suscripciones

La implementación separa los permisos de plataforma de los administradores de
cada empresa. El usuario de arranque indicado por `PLATFORM_ADMIN_EMAIL`
recibirá el permiso `platformAdmin` al actualizarse su documento en `/users`.

## Configuración de Functions

1. Copiar `functions/.env.example` a `functions/.env.<firebase-project-id>` y
   completar los IDs de precio de Stripe.
2. Crear los secretos:

   ```text
   firebase functions:secrets:set STRIPE_SECRET_KEY
   firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
   ```

3. En Stripe, registrar el endpoint:

   ```text
   https://europe-west1-<firebase-project-id>.cloudfunctions.net/stripeWebhook
   ```

4. Suscribirlo a estos eventos:

   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

5. Desplegar Functions, reglas de Firestore, reglas de Storage y Hosting.

## Primer administrador de plataforma

El email configurado en `PLATFORM_ADMIN_EMAIL` funciona como usuario de
arranque. Para dejar el permiso persistido, establecer `platformAdmin: true` en
su documento `/users/{uid}`. El trigger de usuarios actualizará sus custom
claims. Después debe cerrar sesión y volver a entrar para renovar el token.

## Flujo de alta

1. La landing crea una solicitud.
2. El administrador de plataforma abre **Solicitudes**.
3. **Crear empresa** solicita el identificador, código de invitación y una
   contraseña temporal.
4. El backend crea de forma conjunta la empresa, su propietario, configuración,
   código y prueba de 14 días.
5. El propietario inicia sesión y contrata un plan desde **Ajustes**.

## Consola global de Rayba

La cuenta global debe pertenecer al tenant indicado por
`PLATFORM_TENANT_ID` (por defecto `rayba`) y tener `platformAdmin: true`.
En el dashboard de Rayba aparecerá **Consola global**, con:

- resumen de empresas activas, pruebas, incidencias y MRR estimado;
- búsqueda y filtros por plan y estado;
- consumo de operarios, comunidades y administradores;
- cambio de plan y suspensión/reactivación manual;
- datos del propietario, vencimiento y referencia de Stripe.

## Planes y límites recomendados

| Plan | Precio orientativo | Operarios activos | Comunidades | Administradores | Almacenamiento |
| --- | ---: | ---: | ---: | ---: | ---: |
| Autónomo | 19 EUR/mes | 5 | 50 | Sin límite | 2 GB |
| Starter | 39 EUR/mes | 10 | 100 | Sin límite | 5 GB |
| Profesional | 79 EUR/mes | 30 | 300 | Sin límite | 25 GB |
| Empresa | 149 EUR/mes | 100 | 1.000 | Sin límite | 100 GB |
| Enterprise | A medida | Sin límite | Sin límite | Sin límite | A medida |

Los cupos de operarios activos y comunidades se validan en el backend. Los
registros operativos (fichajes, tareas, facturas e histórico) no se limitan.
