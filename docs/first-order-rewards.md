# Regalo de primera compra

## Estructura de datos

El motor reutilizable vive bajo `storeIncentives` en Firebase Realtime Database:

- `config/campaigns/{campaignId}`: nombre, tipo, estado, vigencia, sucursales y limite por pedido.
- `config/tiers/{campaignId}/{tierId}`: nombre interno, minimo, maximo, orden y marca premium.
- `config/items/{campaignId}/{tierId}/{itemId}`: nombre, imagen, SKU SICAR, proveedor, stock disponible/reservado, costo, vigencia, sucursales y orden.
- `reservations/{reservationId}`: auditoria de cliente, telefono protegido, pedido, monto elegible, intervalo, regalo, sucursal y estado.
- `claims/users/{uid}` y `claims/phones/{phoneHash}`: bloqueo contra doble beneficio por cuenta o telefono.

Los pedidos beneficiados guardan `firstOrderReward` como una instantanea inmutable de la reserva. El regalo no se agrega a `items`, no modifica el subtotal y se envia a SICAR como una linea separada con precio `C$0.00` y descuento del 100%.

Al confirmar la reserva se registran en `storeUsers/{uid}`:

- `first_order_reward_used`
- `reward_campaign_id`
- `reward_tier_id`
- `reward_item_id`
- `reward_order_id`
- `reward_redeemed_at`

## Endpoint

`POST /.netlify/functions/first-order-reward` requiere un token Firebase en `Authorization: Bearer <token>`.

Acciones disponibles:

- `eligibility`: valida cuenta, telefono, primera compra, vigencia y sucursal.
- `reserve`: valida nuevamente el subtotal y reserva una unidad mediante transaccion.
- `confirm`: enlaza la reserva al pedido creado y marca el beneficio como utilizado.
- `release`: devuelve el stock de una reserva o pedido cancelado.
- `reconcile`: accion administrativa que libera reservas vencidas/canceladas y marca entregas.

Las reservas pendientes vencen a los 20 minutos. Una nueva reserva o una conciliacion administrativa devuelve automaticamente su inventario.

## Campana inicial

El script `npm run store:seed:first-order-reward` crea, sin sobrescribir datos existentes:

- C$500 a C$999.99
- C$1,000 a C$1,499.99
- C$1,500 en adelante

La campana se crea pausada y sin regalos. Antes de activarla en AdminTV se deben cargar para cada intervalo el SKU real, imagen, stock y sucursales. Esto evita publicar productos o existencias inventadas.

## Reglas operativas

- Solo cuentan productos pagados para calcular el intervalo.
- Pedidos cancelados o fallidos no consumen el beneficio.
- Bajar de intervalo invalida la seleccion anterior.
- Un articulo sin stock, inactivo, fuera de vigencia o de otra sucursal no puede reservarse.
- La validacion definitiva ocurre en servidor; el frontend solo presenta el estado.
- Al cancelar se devuelve una unidad y se limpia el uso del beneficio asociado al pedido.
