# Origen WEB / APP de pedidos

Los nuevos pedidos de Tienda Virtual guardan `storeOrderSource` en el registro
actual y en su copia original. El archivo historico conserva el campo.

- `web`: navegador de escritorio o movil, incluida PWA.
- `android_app`: aplicacion nativa Capacitor Android.
- `ios_app`: aplicacion nativa Capacitor iOS.
- Ausente o desconocido: Origen no registrado.
- Pedidos manuales: no agregan este campo.

La captura se hace en createOrder usando Capacitor, no el user agent ni un
campo enviado por el formulario. No cambia canal, precios, puntos, descuentos,
SICAR ni las reglas de entrega. No agrega lecturas o listeners de Firebase.

Se muestra en Pedidos, Cocina, detalle de pedido, historial de clientes,
Reportes / Historial y exportacion del historial. Se puede buscar WEB o
APP Android en el historial. El original tiene prioridad al presentar el origen.

No se reclasifican pedidos antiguos: no existe evidencia suficiente para ello.
La version Android 1.2.10 ya enviada no incluye este campo. Se necesita una
nueva compilacion y actualizacion instalada, ademas de publicar el frontend
web/AdminTV. Las regalias se gestionan manualmente por decision del negocio;
esta identificacion no activa beneficios.

Este dato es atribucion declarada por el cliente, no una prueba antifraude.
Antes de otorgar automaticamente beneficios exclusivos de Android se debe
validar elegibilidad en backend (por ejemplo, con verificacion Play Integrity),
con reglas de stock, limites y cancelacion. No autorizar regalos solo con
storeOrderSource.

## Verificacion local (2026-10-16)

- test:store-order-source y test:order-traceability: correctos.
- test:web-release, test:retail-home, test:store-editorial,
  test:manual-route y test:admin-reports: correctos.
- Compilacion web y frontend Android: correctas. Android se compilo en
  tmp/order-source-android, sin reemplazar dist web ni generar un nuevo AAB.
- Chromium a 360 x 800: componente real StoreOrderDetails con pedidos
  sinteticos WEB, APP Android y sin origen; etiquetas legibles, sin overflow.
  Captura local: output/playwright/order-source-mobile.png.
- No se probaron pedidos reales, ni un dispositivo Android fisico.
- Sin cambios de base de datos, reglas Firebase, despliegues o Play Console.
