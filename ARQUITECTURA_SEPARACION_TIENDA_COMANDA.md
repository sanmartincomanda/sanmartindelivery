# Arquitectura Recomendada: Separar Tienda Virtual y Comanda

Fecha: 2026-06-26

## Resumen ejecutivo

Si, recomiendo separar la tienda virtual de la comanda.

La razon principal no es solo costo: tambien es seguridad, aislamiento operativo y control de crecimiento.

Hoy la app publica y la operacion interna comparten la misma Realtime Database. Eso hace que:

1. La tienda publica pueda tocar datos que no deberian ser publicos.
2. El consumo de RTDB suba aunque no haya muchos pedidos reales.
3. La comanda interna quede amarrada al comportamiento de trafico de la tienda.

La mejor arquitectura para el siguiente salto es esta:

1. `Tienda virtual` en una base de datos publica y ligera.
2. `Comanda / cocina / driver / admin` en una base interna separada.
3. Un `integrador` entre ambas que solo reciba pedidos y devuelva estados minimos.

## Conclusión rápida

La separacion si tiene sentido.

De hecho, en tu caso ya hay una señal muy clara:

- Antes, con pedidos manuales internos, el consumo era manejable.
- Al abrir la tienda publica y dejar la misma base compartida, el consumo subio demasiado.

Eso no significa que la tienda "sea mala", sino que hoy esta montada sobre una base pensada tambien para operacion interna.

## Hallazgos actuales

## 1. La tienda publica sigue leyendo RTDB directamente

Hallazgos en codigo:

- La tienda carga catalogo desde RTDB en `src/components/TiendaVirtualView.jsx`.
- Tambien carga categorias, promociones y cupones desde RTDB.
- El flujo de pedidos y estado del pedido vive en `src/services/orders.js`.

Impacto:

- Cada visita publica genera lecturas contra la misma base donde vive la operacion.
- Aun sin comprar, la tienda ya consume.

## 2. La base interna y la base publica estan mezcladas

Nodos actuales relevantes:

- `orders`
- `rutaOrders`
- `clients`
- `storeUsers`
- `drivers`
- `systemUsers`
- `storeOrderStatus`
- `storeCatalog`
- `storePromotions`
- `storeCoupons`

Problema:

- La misma RTDB guarda catalogo publico y datos operativos sensibles.
- Esto aumenta riesgo de seguridad y costo.

## 3. Las reglas actuales son demasiado abiertas

Hoy, gran parte de los nodos operativos tienen `.read: true` y `.write: true`.

Eso implica:

- superficie publica demasiado amplia
- mas posibilidad de lecturas no controladas
- mas consumo involuntario

## 4. La comanda interna no deberia depender del trafico de tienda

La operacion interna debe poder seguir funcionando aunque:

- la tienda este caida
- la tienda se publique a mas gente
- haya bots, recargas o trafico alto

Hoy ese aislamiento no existe del todo.

## Arquitectura objetivo recomendada

## Opcion recomendada: 2 bases + integrador

### Base 1: Tienda virtual

Debe guardar solo lo publico o semipublico de tienda:

- catalogo
- categorias
- promociones
- cupones
- usuarios de tienda
- carrito local o metadata ligera
- estado resumido del pedido para el cliente

Tecnologia recomendada:

- `Firestore` para datos
- `Firebase Storage` para imagenes

Motivo:

- Firestore escala mejor para lecturas publicas moderadas.
- Storage es mucho mas apropiado para imagenes que RTDB.
- La tienda necesita consultas ligeras, no listeners operativos pesados.

### Base 2: Comanda / operacion interna

Debe guardar solo lo operativo:

- `orders`
- `rutaOrders`
- `drivers`
- `clients`
- `systemUsers`
- `orderCounters`
- colas y procesos SICAR
- estados internos de cocina y reparto

Tecnologia recomendada:

- Puedes dejarla en `Realtime Database` en una primera fase si ya esta estable.

Motivo:

- Ya tienes bastante logica montada ahi.
- No hace falta migrar toda la operacion el mismo dia.

### Integrador entre tienda y comanda

Debe ser la unica puerta entre ambos mundos.

Responsabilidades:

1. Recibir pedido de la tienda.
2. Validar payload.
3. Escribir pedido en la base interna de comanda.
4. Devolver a la tienda:
   - numero de pedido
   - estado inicial
   - total aproximado
5. Reflejar de vuelta a la tienda solo estados minimos:
   - pendiente
   - preparando
   - listo
   - en camino
   - entregado
   - cancelado

## Qué no recomiendo

## No recomiendo seguir con una sola RTDB compartida

Aunque se puede endurecer con reglas, seguirias teniendo:

- acoplamiento entre publico e interno
- mayor complejidad de permisos
- riesgo de volver a exponer nodos
- crecimiento de costo mas dificil de controlar

## No recomiendo que la tienda lea la base interna

La tienda no deberia leer directamente:

- `orders`
- `clients`
- `drivers`
- `systemUsers`
- `rutaOrders`

La tienda debe hablar con un integrador, no con la operacion directa.

## Qué recomiendo separar exactamente

## Datos que deben ir a la base de tienda

- `storeCatalog`
- `storeCatalogMeta`
- `storeCategories`
- `storePromotions`
- `storeCoupons`
- `storeUsers`
- `storeOrderStatus` o su equivalente resumido

Notas:

- `storeOrderStatus` debe ser una version resumida, no una copia completa del pedido operativo.
- Las fotos deben vivir en `Storage`, no dentro del JSON del producto.

## Datos que deben quedarse en comanda

- `orders`
- `rutaOrders`
- `clients`
- `drivers`
- `systemUsers`
- `orderCounters`
- `sicarQuoteQueue`
- procesos de cocina, despacho y repartidor

## Datos que deben viajar por integrador

### De tienda hacia comanda

- cliente
- telefono
- direccion
- geolocalizacion
- fulfillment type (`delivery` / `pickup`)
- items
- cupon aplicado
- observaciones
- canal de origen

### De comanda hacia tienda

- numero de pedido
- total aproximado o final
- estado publico
- nombre del repartidor si ya fue asignado
- timestamps minimos visibles al cliente

## Recomendación de tecnologia por modulo

## Tienda virtual

Recomendacion:

- `Firestore`
- `Storage`

Porque:

- mejor para lecturas por documento y colecciones pequeñas
- mas natural para catalogo, promociones y usuarios de tienda
- reduce riesgo de bajar nodos completos

## Comanda

Recomendacion:

- `RTDB` en corto plazo

Porque:

- ya existe logica operativa
- cambios en vivo y flujos actuales ya estan montados
- migrarla despues es posible, pero no es el primer cuello de botella

## Integrador

Recomendacion:

- `Cloud Function` o servicio backend privado
- Alternativa: tu bridge/API propia si quieres control local

Porque:

- centraliza validacion
- evita exponer la base interna al cliente
- te permite auditar trafico y errores

## Opciones posibles

## Opcion A. Dos proyectos Firebase separados

### Ventajas

- mejor aislamiento
- seguridad mas clara
- facturacion separada
- menos riesgo de cruzar reglas por error

### Desventajas

- un poco mas de configuracion
- integracion entre proyectos

### Veredicto

Es mi opcion favorita para tu caso.

## Opcion B. Un mismo proyecto, dos bases distintas

Ejemplo:

- tienda en Firestore
- comanda en RTDB

### Ventajas

- despliegue mas simple
- menos credenciales

### Desventajas

- el aislamiento sigue siendo menor que con dos proyectos
- errores de configuracion siguen siendo mas faciles

### Veredicto

Aceptable si quieres avanzar mas rapido.

## Opcion C. Misma RTDB, solo reglas mas duras

### Ventajas

- casi no exige migracion

### Desventajas

- no resuelve el desacople de arquitectura
- reduce riesgo, pero no lo elimina
- sigues mezclando publico e interno

### Veredicto

Solo la usaria como medida temporal, no como destino final.

## Recomendación final

Si tu prioridad es dejar esto sano para crecer:

1. `Tienda virtual` en una base separada.
2. `Comanda interna` en otra base.
3. `Integrador` central para alta de pedidos y reflejo de estado.

## Impacto esperado

## Seguridad

Mejora fuerte porque:

- la tienda ya no toca nodos internos
- drivers y cocina quedan fuera de la superficie publica
- `clients` deja de estar expuesto por trafico publico

## Costos

Debe mejorar porque:

- la tienda deja de consultar bases operativas
- el catalogo se puede cachear mejor
- las imagenes salen de RTDB
- el estado del pedido pasa a ser un resumen pequeño

## Operacion

Tambien mejora porque:

- cocina y driver no dependen del trafico publico
- la tienda puede evolucionar sin romper operacion interna
- la comanda puede seguir estable aunque cambie el frontend publico

## Riesgos de la migración

## Riesgo 1. Duplicar logica

Si no se define bien el integrador, puedes terminar con reglas duplicadas en tienda y comanda.

Mitigacion:

- una sola capa de integracion para crear pedidos

## Riesgo 2. Estados desfasados

Si la comanda cambia estado y no se refleja bien, el cliente ve informacion atrasada.

Mitigacion:

- definir solo estados publicos
- sincronizacion unidireccional clara desde comanda hacia tienda

## Riesgo 3. Romper pedidos durante el cambio

Mitigacion:

- migracion por fases
- periodo de convivencia corta
- rollback claro

## Plan de migración recomendado

## Fase 1. Auditoria y congelamiento de alcance

Objetivo:

- decidir exactamente que datos son publicos y cuales internos

Entregables:

- lista final de nodos por base
- definicion del payload del integrador
- definicion del estado publico del pedido

## Fase 2. Crear base de tienda separada

Objetivo:

- levantar estructura limpia de tienda

Contenido inicial:

- catalogo
- categorias
- promociones
- cupones
- usuarios tienda

Importante:

- fotos en Storage
- no guardar imagenes en RTDB

## Fase 3. Montar integrador de pedidos

Objetivo:

- que la tienda ya no cree pedidos directo en la base operativa

El integrador debe:

1. recibir pedido
2. validar
3. generar numero
4. escribir en comanda
5. responder a tienda

## Fase 4. Publicar estado resumido del pedido

Objetivo:

- que el cliente vea su estado sin leer `orders` interno

Contenido sugerido:

- `orderKey`
- `estado`
- `total`
- `timestamp`
- `repartidorNombre`
- `pickup/delivery`

## Fase 5. Cerrar accesos directos entre tienda y comanda

Objetivo:

- cortar ya cualquier dependencia directa

Esto incluye:

- la tienda no debe leer `orders`
- la tienda no debe leer `clients`
- la tienda no debe leer `drivers`
- la tienda no debe leer `systemUsers`

## Fase 6. Endurecer reglas y monitoreo

Objetivo:

- asegurar que el costo no vuelva a dispararse

Acciones:

- reglas privadas por modulo
- alertas de billing
- revisar lecturas por pantalla
- medir tamaño de nodos publicos

## Orden recomendado de ejecucion

1. Diseñar la separacion de datos.
2. Crear base de tienda separada.
3. Mover catalogo/promociones/cupones/usuarios tienda.
4. Crear integrador de pedidos.
5. Reflejar solo estado publico.
6. Cerrar tienda contra base interna.
7. Revisar costo y seguridad.

## Qué dejaría igual por ahora

Para no abrir demasiados frentes a la vez, yo dejaria igual temporalmente:

- comanda manual
- cocina
- driver
- admin interno
- logica actual operativa de pedidos internos

La primera gran separacion debe ocurrir del lado de tienda publica.

## Señales de éxito

La migracion va bien si ocurre esto:

1. La tienda funciona sin leer `orders` internos.
2. El cliente puede comprar sin tocar `clients` operativos.
3. Cocina y driver siguen igual o mejor.
4. El costo de RTDB deja de crecer por trafico publico.
5. Las reglas quedan mucho mas simples y seguras.

## Recomendación final del auditor

Si me preguntas que haria yo, haria esto:

1. Separar `tienda virtual` y `comanda`.
2. Dejar la `comanda` como sistema operativo interno.
3. Rehacer la `tienda` como consumidor liviano de catalogo publico.
4. Unir ambas con un integrador de pedidos y estados.

No recomendaria seguir creciendo sobre una sola RTDB compartida para ambos mundos.

## Nota importante

Este documento es una recomendacion de arquitectura. No implica que haya que migrar todo de una sola vez.

La mejor estrategia es:

- separar primero la tienda
- conservar la operacion interna estable
- y hacer la integracion por fases controladas

