# Miembro Gold: canjes al archivar pedidos

## Incidente del 15 de octubre de 2026

Un canje de 1,500 puntos seguia en estado `reserved` en un pedido `Enviado`.
Los 79 puntos de la compra ya se habian acreditado correctamente. A las 06:00
el pedido paso de `orders` a `orderHistory`; a las 06:10 el mantenimiento de
reservas, que solo buscaba en pedidos activos, lo considero huerfano y devolvio
los 1,500 puntos. No fue un segundo premio ni un error de calculo de la compra.

El operador ya habia corregido el saldo manualmente. Esta correccion no vuelve
a descontar puntos ni reescribe ese movimiento. La evidencia con datos del
cliente se conserva fuera de Git, en `tmp/gold-noeris-audit.json`.

## Comportamiento corregido

- La ausencia en `orders` no autoriza una devolucion. Archivar, borrar una
  cotizacion, perder conectividad o exceder la retencion no devuelven puntos.
- El integrador vincula la reserva a su pedido, conservando `orderKey`,
  `orderDate` y `linkedAt` dentro del hold y del movimiento. La vinculacion no
  cambia el saldo y libera `pendingReservationId` del checkout ya confirmado.
  Un fallo entre ambos pasos se recupera mediante lecturas puntuales; un
  conflicto entre pedidos se senala para revision, sin elegir uno al azar.
- Las reservas antiguas se contrastan con pedidos activos, el movimiento del
  canje, el historial y el pedido original. Las lecturas historicas se limitan
  al dia de la reserva y al siguiente por los checkouts que cruzan medianoche.
- Las reservas sin pedido verificable quedan pendientes de revision: **no se
  reembolsan automaticamente por tiempo transcurrido**. Un fallo de checkout
  sin pedido comprobable requiere revisar la reserva antes de liberarla. No
  aplicar solo un ajuste de saldo dejando el hold pendiente.
- Se conserva la regla existente: puntos de compra al enviar (desde
  2026-09-16); confirmacion del canje al entregar; devolucion por cancelacion
  confirmada mientras exista la reserva. No se introduce una nueva regla de
  puntos, ni se devuelve un premio ya confirmado como entregado.
- Cada liberacion conserva un recibo transaccional en
  `storeRewardAccounts/{uid}/releasedReservationIds/{reservationId}`. Los
  reintentos reparan el movimiento sin volver a acreditar el saldo. Los
  cierres de canje tambien son idempotentes. Ningun callback reutiliza datos
  de un intento anterior de la transaccion.

## Operacion y costo

La revision reutiliza el temporizador existente de diez minutos; no crea
suscripciones ni procesos nuevos. Si no hay holds sin vincular, no consulta
pedidos. Las reservas ambiguas se vuelven a investigar como maximo cada seis
horas durante la vida del proceso; los dias consultados se comparten entre
clientes en cada revision. Un fallo de lectura detiene la revision sin
devolver puntos.

El estado de `/api/sicar/health`, en `rewardsSync`, incluye:

- `reservationSafetyVersion: 2026-10-15-archive-safe`
- `orphanRefundPolicy: confirmed_cancellation_only`
- `lastProtectedHolds`, `lastHoldReviewCount`, `lastHoldReview`
- `lastReleasedHolds`, que debe permanecer en cero para este mantenimiento.

`lastHoldReview` muestra hasta 25 identificadores para revision operativa. No
es una orden de ajuste masivo. Revisar pedidos activos, historial, originales
y movimientos antes de liberar una reserva realmente abandonada. Los canjes
ya corregidos manualmente y sin hold no se reconstruyen ni se descuentan.

## Verificacion

`npm run test:store-reward-reservations` requiere el emulador RTDB local en
`127.0.0.1:19000`. Usa exclusivamente el namespace
`demo-gold-reservation-safety`, las reglas actuales y clientes separados para
probar concurrencia. No crea pedidos ni modifica clientes reales.

20 escenarios: reservar/enviar/archivar, legado solo en historial, original tras
borrado, cambio de dia, ausencia de fecha/pedido, retencion vencida, cancelacion
repetida, entrega repetida, recuperacion de movimientos, reembolsos concurrentes,
entrega contra cancelacion, vinculacion contra liberacion, ajuste manual ya
realizado, lectura denegada, reutilizacion de la cache, vinculaciones
contradictorias, recuperacion tras fallos parciales y reintento forzado de
reversion de puntos de compra con un cliente desconectado.

Tambien ejecutar `test:store-reward-status`, `test:order-traceability`, `build`
y los controles web obligatorios de `AGENTS.md`.

Para activar el arreglo hace falta recargar el integrador que importa
`scripts/storeRewardsSync.mjs`; publicar solo hosting o un APK no lo activa.
Reiniciarlo unicamente cuando cotizaciones y archivo esten inactivos, verificar
su supervisor y luego comprobar la version de seguridad y ausencia de errores.
No desplegar reglas, Functions, cambiar saldos ni reactivar Ruta para este arreglo.
