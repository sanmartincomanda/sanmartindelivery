# Auditoria Inicial: Integracion Tienda Virtual + SICAR

Fecha de auditoria: 2026-06-18

## Conclusion rapida

Si es posible integrar la tienda en linea con el catalogo de SICAR.

La forma correcta no es conectar React directo a MySQL, sino crear una capa de sincronizacion o API interna que lea SICAR y publique el catalogo filtrado hacia Firebase, que ya es la fuente de datos operativa de la app.

## Hallazgos de la app actual

### Arquitectura actual

- La app es un frontend `React + Vite`.
- No existe backend propio dentro del proyecto.
- La operacion diaria vive sobre `Firebase Realtime Database`.

### Modulo tienda

- La tienda publica se abre por hash `#tienda`.
- El catalogo visible se alimenta desde `storeCatalog` en Firebase.
- Si no hay datos remotos, hoy se usan semillas locales en `src/data/tiendaVirtual.js`.
- El checkout crea pedidos en Firebase usando `createOrder(...)` con canal `tienda_virtual`.

Referencias:

- `src/App.jsx`
- `src/components/TiendaVirtualView.jsx`
- `src/services/orders.js`
- `src/services/storeCatalog.js`
- `src/data/tiendaVirtual.js`

### Modulo driver

- El modulo driver consume los pedidos ya creados en Firebase.
- La asignacion, entrega y geolocalizacion tambien actualizan Firebase.

Referencia:

- `src/components/DriverView.jsx`

### Implicacion tecnica

La app ya tiene una separacion util:

- SICAR puede ser la fuente maestra de productos/precios/inventario.
- Firebase puede seguir siendo la capa de publicacion para tienda, pedidos y drivers.

Eso reduce el impacto porque no hay que reescribir el flujo de tienda ni el modulo driver.

## Hallazgos en SICAR

Conexion validada a:

- Host: `127.0.0.1`
- Puerto: `3307`
- Base: `sicar`

### Tablas relevantes encontradas

- `articulo`: catalogo de productos
- `venta`: encabezado de venta
- `detallev`: detalle de venta
- `categoria`: categoria del articulo
- `unidad`: unidad de venta
- `articuloimagen` + `imagen`: imagenes relacionadas a articulos

### Volumen observado

- Articulos totales: `1320`
- Articulos activos (`articulo.status = 1`): `744`
- Ventas totales: `487954`
- Detalles de venta totales: `1077925`

Periodo auditado:

- Desde `2026-03-18`
- Hasta `2026-06-18` inclusive

En ese periodo:

- Ventas: `18778`
- Lineas de detalle: `43303`

### Estados utiles

- `venta.status = 1`: ventas vigentes
- `venta.status = -1`: ventas anuladas/canceladas
- `articulo.status = 1`: articulos activos
- `articulo.servicio = 0`: productos fisicos

### Regla Pareto 95% observada

Filtrando por:

- `venta.status = 1`
- `articulo.status = 1`
- `articulo.servicio = 0`

Resultados:

- SKUs vendidos en el periodo: `502`
- SKUs que cubren el `95.01%` del volumen vendido por cantidad: `125`
- SKUs que cubren el `95.03%` del monto vendido: `117`

Esto confirma que el filtro de "95% mas vendido en los ultimos 3 meses" es totalmente viable.

### Muestra de top vendidos por cantidad

1. `00069` HUESO CORRIENTE (E)
2. `00097` FILETE DE POLLO (G)
3. `00028` CORBATA (E)
4. `00092` POSTA DE CERDO (E)
5. `00015` IN ENTERA (POSTA PIERNA) (E)
6. `00100` PECHUGA LIMPIA (G)
7. `00059` HIGADO (E)
8. `00104` ALAS (E)
9. `00003` MOLIDA ESPECIAL 80/20 (P) (E)
10. `00073` TRG (E)

### Validacion de productos actuales de la tienda

Los codigos semilla actuales de la tienda que si existen en SICAR son:

- `00393` BISTEC POSTA DE PIERNA VP (E)
- `00442` MANO DE PIEDRA VP (E)
- `00444` POSTA DE GALLINA VP (E)

Los combos locales `1001`, `1002` y `1003` no aparecieron como articulos en la consulta directa de SICAR, por lo que deben tratarse como:

- productos compuestos propios de la tienda, o
- paquetes/recetas si ya existen con otra estructura en SICAR

### Imagenes

- Registros en `articuloimagen`: `109`

Esto abre la posibilidad de sincronizar imagenes desde SICAR, aunque requerira una transformacion adicional porque la tabla `imagen` guarda binarios.

## Riesgos y observaciones importantes

### 1. No conviene conectar el navegador directo a MySQL

La app actual corre del lado cliente. Si React se conectara directo a SICAR:

- se exponen credenciales
- se rompe seguridad basica
- se amarra la tienda a la red local donde vive SICAR

La integracion debe hacerse con una capa intermedia.

### 2. Inventario disponible requiere definicion de negocio

En la muestra, productos actuales como `00393`, `00442` y `00444` tienen `disponible = 0` y existencia negativa.

Antes de sincronizar stock hay que decidir si la tienda:

- solo publica por historial de venta
- publica por historial de venta y stock positivo
- publica aunque el stock venga en cero, dejando validacion manual

### 3. "95% mas vendido" necesita definicion exacta

Hay dos lecturas validas:

- 95% acumulado por cantidad vendida
- 95% acumulado por monto vendido

Para carne y tienda de volumen, recomiendo arrancar con:

- `95% acumulado por cantidad vendida`

y guardar tambien el monto para analitica.

### 4. Las categorias de SICAR no coinciden 1:1 con las de la tienda

La tienda hoy usa categorias amigables como:

- `res`
- `pollo`
- `cerdo`
- `embutidos`
- `abarroteria`
- `promociones`

SICAR trae categorias como:

- `PRODUCTOS SELECTOS`
- `PRODUCIDOS`
- `POLLO`
- `SOPA`
- `VISCERAS`
- `PRODUCTOS GOLD`

Se necesita una tabla de mapeo para no romper filtros visuales ya existentes.

## Propuesta de integracion recomendada

## Opcion recomendada: sincronizacion SICAR -> Firebase

### Flujo

1. Un script o microservicio interno lee SICAR.
2. Calcula ventas de los ultimos 3 meses.
3. Selecciona solo los SKUs dentro del 95% acumulado.
4. Normaliza nombre, precio, stock, categoria, unidad e imagen.
5. Publica el resultado en Firebase `storeCatalog`.
6. La tienda y el modulo driver siguen operando sin cambios estructurales.

### Ventajas

- Mantiene tu app actual casi intacta
- No expone MySQL al cliente
- Permite sincronizacion programada
- Facilita rollback si algo sale mal

### Campos sugeridos en `storeCatalog`

- `code`
- `name`
- `price`
- `unit`
- `category`
- `subcategory`
- `active`
- `image`
- `description`
- `source: 'sicar'`
- `sicarArtId`
- `stockDisponible`
- `stockExistencia`
- `ventas90dCantidad`
- `ventas90dMonto`
- `tickets90d`
- `rank90dCantidad`
- `isTop95Cantidad`
- `lastSyncAt`

### Donde encaja en el proyecto

- La UI de tienda ya consume `storeCatalog`.
- El modulo de configuracion ya administra productos desde Firebase.

Por eso la integracion natural es reemplazar o complementar la carga manual de `storeCatalog`, no tocar el checkout.

## Implementacion sugerida por fases

### Fase 1. Solo lectura y publicacion

- Crear script Node local que consulte SICAR
- Publicar top 95% hacia Firebase
- No tocar checkout ni driver

### Fase 2. Reglas de negocio

- Definir filtro de inventario
- Mapear categorias SICAR -> categorias tienda
- Separar productos unitarios y combos

### Fase 3. Overrides manuales

- Permitir que `ConfiguracionView` active/desactive productos sincronizados
- Permitir imagen y descripcion comercial aunque el producto venga de SICAR

### Fase 4. Automatizacion

- Sincronizacion cada 15, 30 o 60 minutos
- Log de errores
- Marca visual de ultima sincronizacion

## Consulta base recomendada

La base de la sincronizacion puede partir de una consulta como esta:

```sql
SELECT
  a.art_id,
  a.clave,
  a.descripcion,
  c.nombre AS categoria,
  dv.unidad,
  SUM(dv.cantidad) AS cantidad_vendida,
  SUM(dv.importeCon) AS monto_vendido,
  COUNT(DISTINCT dv.ven_id) AS tickets,
  a.precio1,
  a.disponible,
  a.existencia
FROM detallev dv
INNER JOIN venta v ON v.ven_id = dv.ven_id
INNER JOIN articulo a ON a.art_id = dv.art_id
LEFT JOIN categoria c ON c.cat_id = a.cat_id
WHERE v.fecha >= '2026-03-18'
  AND v.fecha < '2026-06-19'
  AND v.status = 1
  AND a.status = 1
  AND a.servicio = 0
GROUP BY
  a.art_id, a.clave, a.descripcion, c.nombre, dv.unidad,
  a.precio1, a.disponible, a.existencia
ORDER BY cantidad_vendida DESC;
```

Como SICAR corre en MySQL 5.6, el calculo del acumulado 95% conviene hacerlo en el script de sincronizacion, no dentro de SQL con ventanas analiticas.

## Recomendacion final

Si, la integracion es viable y ademas encaja bien con tu arquitectura actual.

La ruta mas sana es:

- SICAR como fuente maestra
- script/API interna para sincronizar
- Firebase como capa publicada para la tienda

## Siguiente paso recomendado

Construir un primer sincronizador de prueba que:

- lea SICAR
- calcule el top 95% por cantidad en los ultimos 3 meses
- publique esos productos en Firebase `storeCatalog`
- deje fuera servicios y combos locales por ahora

Cuando hagamos eso, la tienda en linea empezara a mostrar catalogo real de SICAR sin romper pedidos ni drivers.
