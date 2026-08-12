# Configuracion de Paylinks Poket

## Secretos en Netlify

Configurar en el proyecto que publica `tienda.sanmartinsr.com` desde:

`Project configuration > Environment variables > Add a variable`

Variables requeridas:

- `POKET_ACCESS_TOKEN`: Personal Access Token entregado por Poket.
- `POKET_MERCHANT_ID`: identificador del comercio Poket.
- `POKET_TERMINAL_ID`: UUID de la terminal Ecommerce Poket.
- `POKET_CALLBACK_URL`: `https://tienda.sanmartinsr.com/?poket=return`.
- `POKET_WEBHOOK_USERNAME`: usuario Basic Auth creado para el webhook.
- `POKET_WEBHOOK_PASSWORD`: clave fuerte y exclusiva para el webhook.
- `FIREBASE_DATABASE_URL`: `https://comanda-digital-ac1ec-default-rtdb.firebaseio.com`.
- `FIREBASE_SERVICE_ACCOUNT_JSON`: JSON completo y en una sola linea de la cuenta de servicio Firebase de comanda.

Variables opcionales:

- `POKET_PAYLINK_TTL_MINUTES`: duracion del enlace; valor recomendado `1440`.
- `POKET_ALLOWED_ORIGINS`: origenes adicionales separados por coma para previews.

Nunca usar el prefijo `VITE_` en secretos. Todo valor `VITE_` termina dentro del navegador y del APK.

## Webhook en Poket

Registrar para `StartPayment` y `FinishPayment`:

`https://tienda.sanmartinsr.com/.netlify/functions/poket-webhook`

Seleccionar autenticacion `Basic` y utilizar exactamente los mismos valores de
`POKET_WEBHOOK_USERNAME` y `POKET_WEBHOOK_PASSWORD` configurados en Netlify.

## Publicacion

Despues de agregar o cambiar variables, ejecutar un nuevo deploy de produccion en Netlify.
Las variables no se aplican retroactivamente a un deploy anterior.

