# Pedidos manuales de Ruta San Martin

## Cambio

Admintv > Nuevo pedido > Ruta San Martin, disponible desde Granada.

- Fecha y franja obtenidas de `getRouteSanMartinSlots`, igual que en la tienda.
- Manana: 9:00 a.m. - 12:00 p.m.; tarde: 1:00 p.m. - 5:00 p.m., cuando corresponde.
- Antes de las 22:00 de Nicaragua se permite la tarde del dia siguiente; no se exige 24 h cerradas para esa opcion.
- Minimo C$1,000 en productos, cobertura de Ruta desde Granada y envio gratis. No permite pedidos de Ruta solo con notas.
- Contacto, direccion y coordenadas editables por pedido. No modifica el directorio del cliente. No usa el GPS de la oficina para capturar el pin de Ruta.
- El formulario conserva productos y programacion al alternar modalidad; rechaza franjas vencidas al confirmar y refresca los horarios cada 30 s y al recuperar el foco.
- Una misma solicitud no se envia dos veces por doble clic. Un fallo conserva los datos del formulario.

## Integracion

No hay tablas, endpoints ni reglas nuevas. `prepareManualRouteOrder` es un adaptador del formulario: reutiliza cobertura, minimo y calendario existentes.

Se llama al mismo `createOrder`, con `channel: MANUAL_CHANNEL`, `fulfillmentType: ruta_san_martin`, `routeSlotId` y metadatos de Granada. El servicio revalida antes de guardar y conserva su secuencia global RS, fecha/franja, registro original y cola SICAR. Cocina, Pedidos y Driver ya clasifican por modalidad, no por canal: se mantiene RUTA separado de Delivery y el arrastre de pendientes de dias anteriores.

No se cambia autenticacion, backend, reportes, precios, Gold, checkout, reservas o asignacion automatica de driver. Los pedidos siguen siendo manuales para reportes.

## QA ejecutado (2026-10-06)

Inventario funcional: modalidad, fecha, franja, minimo, cliente, direccion/pin, cantidades, guardar/reintentar, secuencia, separacion RUTA, permanencia de pendientes y regresiones Delivery/Pickup. QA visual: controles de Ruta, direccion, producto/cantidad y CTA en movil/tablet/escritorio.

`npm run test:manual-route`: 136 aserciones del adaptador y suite existente `testRouteSanMartin.mjs` aprobadas. Incluye C$999.99/C$1,000, notas sin productos, coordenadas vacias/invalidas, otras sucursales, cobertura, fechas pasadas/fuera de rango, 21:59:59/22:00, todas las opciones del calendario publico, envio C$0, particion Ruta/Delivery y pendientes hasta entrega.

Pruebas en navegador Chromium con el formulario real y servicios de lectura/escritura simulados:

1. Ruta muestra solo la tarde de manana a las 15:00 y ambas franjas para el dia posterior.
2. Elegir otra fecha desmarca la franja anterior.
3. Seleccionar cliente rellena telefono, direccion y pin.
4. C$250 rechaza guardar; cambiar a cuatro unidades de C$250 cumple el minimo.
5. Rechaza guardar sin franja, sin pin, sin direccion/telefono y fuera de 40 km.
6. A las 21:59:59 conserva la tarde de manana; a las 22:00 retira esa fecha, desmarca y avisa.
7. Cambiar Ruta > Pickup > Ruta conserva productos y seleccion de Ruta.
8. Error simulado al guardar mantiene el formulario; el reintento con doble clic genera una sola llamada.
9. Guardado simulado de tarde con cliente existente: canal manual, Granada, envio C$0 y slot correcto.
10. Guardado simulado de manana con cliente nuevo escrito: mismo contrato, contacto y pin del pedido.
11. Delivery manual con nota y sin pin conserva su tarifa pendiente y no incluye slot de Ruta.
12. Pickup manual conserva envio cero y no incluye slot de Ruta.
13. Nindiri no ofrece Ruta.
14. Revision visual y ancho de documento en 360x800, 390x844, 768x1024 y 1440x1000: sin desbordamiento horizontal; campos, franjas y cantidades legibles.
15. Alta de cliente simulada: carga nombre, telefono y direccion en el pedido, y pide el pin del cliente sin ofrecer el GPS de la oficina para Ruta.

Evidencias: `docs/screenshots/manual-route-mobile.jpg`, `docs/screenshots/manual-route-desktop.jpg`, `docs/screenshots/manual-route-products-mobile.jpg` (datos ficticios).

`npm run build`: aprobado; advertencia de chunks >500 kB ya existente.

`node scripts/testAdminReports.mjs` y `node scripts/testOrderTraceability.mjs`: aprobados.

## Reproducir / limites

`npx vite --config tests/manual-route/vite.config.mjs` abre el entorno aislado en `http://127.0.0.1:5192/`. Permite variar reloj/sucursal y simular un fallo. Los datos son ficticios, las escrituras se sustituyen y CSP bloquea conexiones externas. Este harness no se incluye en el build de produccion.

No se creo ningun pedido real ni se escribio en Firebase/SICAR durante QA. La integracion final de `createOrder` y su transaccion RS se conserva sin cambios; no se ejercito contra produccion. Las pruebas visuales son Chromium con viewport simulado, no un dispositivo fisico.
