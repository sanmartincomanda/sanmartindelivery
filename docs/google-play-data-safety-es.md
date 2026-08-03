# Google Play - Seguridad de los datos

Configuracion preparada para `com.sanmartinsr.tienda`.

## URLs publicas

- Politica de privacidad: https://tienda.sanmartinsr.com/privacidad
- Eliminacion de cuenta: https://tienda.sanmartinsr.com/eliminar-cuenta
- Correo de soporte: carnessanmartingranada1@gmail.com

## Respuestas generales

- La aplicacion recopila datos: **Si**.
- Los datos se cifran durante la transmision: **Si**.
- El usuario puede solicitar eliminacion: **Si**.
- La aplicacion vende datos personales: **No**.
- Publicidad dentro de la aplicacion: **No**.

## Datos recopilados

Declarar los siguientes tipos cuando Play Console los solicite:

| Categoria | Dato | Motivo principal | Obligatorio |
| --- | --- | --- | --- |
| Ubicacion | Ubicacion aproximada | Elegir sucursal y cobertura | Opcional hasta usar delivery |
| Ubicacion | Ubicacion precisa | Calcular entrega y entregar pedido | Obligatorio para delivery |
| Informacion personal | Nombre | Cuenta y pedidos | Si para crear cuenta |
| Informacion personal | Correo electronico | Autenticacion y soporte | Si para crear cuenta |
| Informacion personal | Numero de telefono | Pedidos y contacto de entrega | Si para crear cuenta |
| Informacion personal | Direccion | Entrega | Si para delivery |
| Informacion personal | IDs de usuario | Autenticacion y seguridad | Si |
| Informacion financiera | Historial de compras | Pedidos, puntos y soporte | Si al comprar |
| Actividad en la aplicacion | Otro contenido generado por el usuario | Notas y referencias de pedidos | Opcional |
| Dispositivo u otros IDs | Identificadores de aplicacion/autenticacion | Seguridad y funcionamiento de Firebase | Si |

La aplicacion no recopila numeros completos de tarjeta, cuentas bancarias, contactos, SMS,
historial de llamadas, fotos, videos, audio ni datos de salud.

## Uso y manejo

Para cada dato aplicable seleccionar:

- Funcionalidad de la aplicacion.
- Administracion de cuenta.
- Prevencion de fraude, seguridad y cumplimiento.
- Comunicaciones del desarrollador solo cuando corresponda a soporte o estado del pedido.

Los datos de entrega (nombre, telefono, direccion y ubicacion) pueden ser vistos por personal de
la sucursal y el entregador asignado. Si Play Console considera a los entregadores terceros,
declarar esos datos como compartidos para **funcionalidad de la aplicacion**. No se comparten para
publicidad ni venta.

## Acceso para revision

La tienda permite navegar sin iniciar sesion. Para revisar pedidos, historial y Miembro Gold se
requiere una cuenta. Antes del envio a revision debe proporcionarse una cuenta de prueba funcional
en `Politicas > Contenido de la aplicacion > Acceso a la aplicacion`.

## Eliminacion de cuenta

El usuario puede solicitarla desde `Mi perfil > Eliminar cuenta`. Las solicitudes autenticadas se
guardan en `storeAccountDeletionRequests` y aparecen en `Tienda Virtual > Clientes` para seguimiento.
Tambien se admite solicitud externa desde la URL publica indicada arriba.
