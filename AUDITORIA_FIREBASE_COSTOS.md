# Auditoria Firebase y plan de reduccion de consumo

Fecha: 2026-06-19

## Resumen ejecutivo

El consumo alto de Firebase Realtime Database no parece venir de "usar mucho la app", sino de una combinacion de 3 patrones de arquitectura:

1. Las fotos de producto se guardan dentro de Realtime Database como base64/Data URL.
2. La tienda publica y el admin leen nodos completos (`storeCatalog`, `orders`, `clients`) y luego filtran en el cliente.
3. Hay logica de mantenimiento que corre desde el navegador del cliente y vuelve a leer `orders` completo.

La conclusion principal es esta:

- Si, las fotos del catalogo no deberian vivir en Realtime Database.
- Si, el uso actual puede disparar cientos de MB aunque solo abras la app unas pocas veces.
- El segundo culpable grande no son las fotos unicamente: tambien lo es leer `orders` completo desde varias vistas.

## Alcance de esta auditoria

Esta auditoria es de codigo y arquitectura local. No incluye acceso al panel de Firebase ni metricas reales por nodo desde consola. Los impactos numericos abajo son inferencias razonables a partir del codigo actual.

## Hallazgos prioritarios

### P1. Las imagenes del catalogo estan en Realtime Database

Evidencia:

- Carga manual de imagen como Data URL en [src/components/ConfiguracionView.jsx](src/components/ConfiguracionView.jsx)
  - `reader.readAsDataURL(file)` en linea 488.
- Compresion de imagen SICAR a Data URL en [src/services/sicarCatalog.js](src/services/sicarCatalog.js)
  - `canvas.toDataURL('image/jpeg', 0.82)` en linea 118.
- Persistencia del campo `image` dentro del producto en [src/services/storeCatalog.js](src/services/storeCatalog.js)
  - `image: String(source.image ?? fallback.image ?? '').trim()` en linea 124.

Impacto:

- Realtime Database cobra transferencia de texto JSON. Una imagen base64 pesa mas que el binario original.
- Cada lectura del catalogo arrastra la foto completa dentro del JSON del producto.
- El costo escala con cada apertura, reconexion o listener en vivo.

Riesgo:

- Muy alto para ancho de banda.
- Medio para latencia de carga inicial.
- Medio para memoria del navegador.

### P1. La misma imagen puede quedar duplicada en el mismo producto

Evidencia:

- El producto guarda `image`.
- La metadata `sync` tambien guarda `sicarImage` en [src/services/storeCatalog.js](src/services/storeCatalog.js)
  - lectura en linea 86
  - escritura en linea 300
  - persistencia en actualizacion de precios en linea 339

Impacto:

- Un mismo SKU puede cargar la foto dos veces dentro del mismo documento JSON.
- Si el catalogo tiene 200+ SKUs, el sobrecosto puede ser enorme.

Observacion:

- Para comparar si la foto cambio basta `imageHash`, `imageUrl` o `storagePath`.
- No hace falta guardar el blob/base64 dos veces.

### P1. La tienda publica abre un listener vivo al catalogo completo

Evidencia:

- `onValue(ref(database, STORE_CATALOG_PATH), ...)` en [src/components/TiendaVirtualView.jsx](src/components/TiendaVirtualView.jsx) linea 455.

Impacto:

- Cada apertura de tienda descarga el catalogo completo.
- Si cambia un solo SKU, el cliente vuelve a recibir el nodo actualizado.
- Para un catalogo grande con fotos embebidas, esto es caro aunque el usuario no compre nada.

Observacion:

- El catalogo no necesita tiempo real fuerte en la tienda publica.
- La tienda ya usa cache local, pero el listener sigue consultando Firebase.

### P1. La tienda publica lee `orders` completo para mostrar pedidos del usuario

Evidencia:

- `onValue(ref(database, 'orders'), ...)` en [src/components/TiendaVirtualView.jsx](src/components/TiendaVirtualView.jsx) linea 533.
- Luego filtra en el cliente por `storeUserKey` o telefono.

Impacto:

- Cada usuario autenticado en la tienda lee todos los pedidos del sistema.
- Mientras crezca el historial, esta vista se vuelve progresivamente mas cara.

Riesgo:

- Muy alto para transferencia.
- Alto para privacidad y superficie de datos en cliente.

### P1. La tienda publica corre una limpieza de pedidos viejos desde el navegador

Evidencia:

- `cleanupExpiredStoreOrders()` se ejecuta en [src/components/TiendaVirtualView.jsx](src/components/TiendaVirtualView.jsx) linea 493.
- Esa funcion hace `get(ref(database, 'orders'))` en [src/services/orders.js](src/services/orders.js) linea 58.

Impacto:

- Cada vez que abre la tienda, un cliente puede disparar una lectura completa de `orders`.
- Eso mezcla logica de mantenimiento con experiencia publica.
- Es una de las causas mas claras de consumo innecesario.

Recomendacion:

- Mover esta limpieza a backend programado o al panel admin manual.

### P1. El admin principal tambien escucha `orders` completo y filtra despues

Evidencia:

- `const ordersRef = ref(database, 'orders')` en [src/App.jsx](src/App.jsx) linea 167.
- El filtro por fecha actual ocurre despues en cliente en lineas 193-195.

Impacto:

- Aunque el dashboard solo usa pedidos del dia, la descarga inicial incluye todo el historial de `orders`.

### P2. `clients` tambien se lee completo en pantallas operativas

Evidencia:

- Admin principal: `onValue(clientsRef, ...)` en [src/App.jsx](src/App.jsx) linea 234.
- Driver: `onValue(ref(database, 'clients'), ...)` en [src/components/DriverView.jsx](src/components/DriverView.jsx) linea 330.

Impacto:

- Si la base de clientes crece, cada apertura del admin/driver arrastra toda la coleccion.

### P2. No hay uso de queries ni limites de Firebase en lecturas grandes

Evidencia:

- No aparecen `query()`, `orderByChild()`, `equalTo()`, `limitToLast()` o similares en `src`.

Impacto:

- Toda la app depende de leer nodos completos y filtrar localmente.
- Eso funciona bien con pocas filas, pero escala mal.

### P2. En desarrollo, React StrictMode puede duplicar cargas iniciales

Evidencia:

- `React.StrictMode` en [src/main.jsx](src/main.jsx) linea 6.

Impacto:

- En localhost, algunos efectos se montan dos veces en desarrollo.
- No explica el problema de fondo, pero si puede inflar la sensacion de consumo mientras haces pruebas.

### P3. No se observa uso real de Firebase Storage

Evidencia:

- Hay `storageBucket` configurado en [src/firebase.js](src/firebase.js) linea 9.
- No hay imports reales de `firebase/storage` en `src`.

Impacto:

- Se esta pagando el costo de RTDB para un caso que deberia resolverse con archivos.

## Estimacion de impacto

Estas cifras son inferencias, no mediciones de consola.

Supuesto razonable:

- 205 SKUs sincronizados.
- Foto comprimida por SKU entre 80 KB y 250 KB como Data URL.
- Misma foto duplicada en `image` y `sync.sicarImage`.

Entonces un solo `storeCatalog` completo podria costar aproximadamente:

- Escenario bajo: `205 x 80 KB x 2 = 32.8 MB`
- Escenario medio: `205 x 150 KB x 2 = 61.5 MB`
- Escenario alto: `205 x 250 KB x 2 = 102.5 MB`

Si a eso sumas:

- listener vivo del catalogo,
- lectura completa de `orders`,
- limpieza publica de `orders`,
- varias aperturas,
- reconexiones,
- y pruebas en desarrollo con `StrictMode`,

entonces llegar a ~493 MB en pocas aperturas si es completamente plausible.

## Clasificacion de prioridades

### Prioridad critica: hacer primero

1. Sacar imagenes de RTDB.
2. Eliminar `cleanupExpiredStoreOrders()` del cliente publico.
3. Dejar de leer `orders` completo en la tienda.
4. Dejar de leer `orders` completo en el dashboard admin.
5. Eliminar la duplicacion `image` + `sync.sicarImage`.

### Prioridad alta: hacer despues

1. Reestructurar consultas de clientes y pedidos por fecha/usuario.
2. Cambiar listeners vivos por `get()` o caché versionado donde no se necesita tiempo real.
3. Separar resumenes ligeros de datos pesados.

### Prioridad media

1. Revisar historial/admin para no bajar toda la historia de pedidos.
2. Medir tamano real de nodos y documentar budgets.

## Arquitectura objetivo recomendada

### Objetivo para tienda publica

- Catalogo: JSON liviano o RTDB sin blobs, preferiblemente con `imageUrl`.
- Fotos: Firebase Storage o assets estaticos/CDN.
- Categorias/cupones: nodos pequenos, lectura simple.
- Pedidos del cliente: query resumida por usuario, no `orders` completo.

### Objetivo para admin

- Dashboard del dia: leer solo pedidos activos o solo pedidos de la fecha actual.
- Cocina: leer solo pedidos activos necesarios.
- Driver: leer solo asignaciones activas del repartidor y resumen de cliente necesario.
- Historial: carga bajo demanda, con filtros por fecha y pagina.

### Modelo recomendado de datos

#### Catalogo

`storeCatalog/{code}`

- code
- name
- price
- imageUrl
- thumbUrl
- category
- subcategory
- active
- sync:
  - source
  - syncedAt
  - sicarArtId
  - sicarImageHash
  - overrides

No guardar:

- base64 en `image`
- base64 en `sync.sicarImage`

#### Pedidos

Mantener `orders/{orderKey}` como registro canonico, pero agregar indices o vistas derivadas:

- `ordersByDate/{yyyy-mm-dd}/{orderKey}: true`
- `ordersByUser/{userKey}/{orderKey}: true`
- `activeOrders/{orderKey}: summary`
- `driverOrders/{driverCode}/{orderKey}: summary`

Con esto el cliente consulta listas pequenas y luego solo detalles necesarios.

## Plan de ejecucion por fases

## Fase 0. Medicion y congelamiento de riesgo

Duracion estimada: 0.5 a 1 dia

Objetivo:

- Medir antes de tocar produccion.
- Confirmar tamano real de `storeCatalog`, `orders`, `clients`.

Acciones:

1. Revisar en consola Firebase el ancho de banda por ruta si esta disponible.
2. Exportar muestra del nodo `storeCatalog` para estimar peso promedio por SKU.
3. Medir cuantos pedidos historicos existen en `orders`.
4. Confirmar cuantos productos tienen `image` y cuantos tambien `sync.sicarImage`.

Resultado esperado:

- Baseline real para comparar ahorro.

## Fase 1. Corte de hemorragia

Duracion estimada: 0.5 a 1.5 dias

Objetivo:

- Bajar consumo rapido sin reescribir todo.

Acciones:

1. Quitar `cleanupExpiredStoreOrders()` de la tienda publica.
2. Dejar de guardar `sync.sicarImage` en RTDB.
3. Evitar nuevas cargas manuales/SICAR como base64 en RTDB.
4. Mantener solo URL o placeholder mientras migramos.
5. En tienda publica, cambiar el catalogo de `onValue()` a `get()` con cache local si el tiempo real no es necesario.

Impacto esperado:

- Alto ahorro inmediato.

Riesgo:

- Bajo a medio.

## Fase 2. Migracion de imagenes a Storage

Duracion estimada: 1 a 2 dias

Objetivo:

- Sacar el peso multimedia de RTDB.

Acciones:

1. Implementar Firebase Storage en el proyecto.
2. Subir fotos nuevas a Storage.
3. Guardar en catalogo solo `imageUrl`, `thumbUrl`, `imageHash`, `storagePath`.
4. Crear script de migracion para leer base64 actual, subir a Storage y reemplazar el registro.
5. Limpiar base64 legado de `image` y `sync.sicarImage`.

Impacto esperado:

- Muy alto ahorro en descargas.
- Mejor tiempo de carga.

Riesgo:

- Medio, porque requiere migracion controlada.

## Fase 3. Reestructuracion de lecturas de pedidos

Duracion estimada: 1 a 2 dias

Objetivo:

- Dejar de leer `orders` completo desde cliente.

Acciones:

1. Crear estructuras derivadas:
   - `ordersByDate`
   - `ordersByUser`
   - `activeOrders`
   - `driverOrders`
2. Actualizar creacion y cambios de estado para mantener esos indices.
3. Cambiar tienda para consultar solo pedidos del usuario.
4. Cambiar admin para consultar solo pedidos activos o del dia.
5. Cambiar driver para consultar solo pedidos asignados.

Impacto esperado:

- Muy alto ahorro sostenido.

Riesgo:

- Medio, porque toca flujo operativo.

## Fase 4. Limpieza de admin e historial

Duracion estimada: 0.5 a 1 dia

Objetivo:

- Reducir consumo secundario.

Acciones:

1. Cargar historial solo con filtros de fecha.
2. Paginar historial o limitar por ventana de tiempo.
3. Leer `clients` por busqueda o resumen cuando aplique.
4. Revisar listeners de configuracion y cambiarlos a lecturas puntuales si no requieren tiempo real.

Impacto esperado:

- Ahorro medio.

## Fase 5. Operacion y mantenimiento

Duracion estimada: 0.5 dia

Objetivo:

- Evitar que el problema regrese.

Acciones:

1. Crear politica: no guardar blobs/base64 en RTDB.
2. Documentar limites de peso por nodo.
3. Mover tareas de limpieza a backend o a una accion manual de admin.
4. Agregar checklist de revision cuando se agreguen modulos nuevos.

## Orden recomendado de implementacion

1. Fase 1
2. Fase 2
3. Fase 3
4. Fase 4
5. Fase 5

## Recomendacion final

Si quieres el mejor balance entre rapidez y ahorro, la ruta correcta es:

1. Parar ya las lecturas publicas completas de `orders`.
2. Sacar imagenes del catalogo fuera de Realtime Database.
3. Cambiar la tienda para trabajar con un catalogo ligero y pedidos consultados por usuario.

Ese trio es donde esta el mayor retorno.

## Decisiones que conviene tomar antes de implementar

1. Confirmar si quieres usar Firebase Storage o un CDN externo para imagenes.
2. Confirmar si el catalogo de tienda debe ser tiempo real o si puede refrescarse solo cuando sincronizas SICAR.
3. Confirmar si el historial completo debe seguir en RTDB o si mas adelante quieres archivarlo.

## Checklist de aceptacion

La auditoria se considerara resuelta cuando:

1. Ninguna imagen de producto quede guardada como base64 en RTDB.
2. La tienda publica no lea `orders` completo.
3. El dashboard no lea todo `orders` para operar el dia.
4. Abrir la tienda ya no genere descargas masivas tras pocas aperturas.
5. Exista una medicion post-cambio contra el baseline inicial.
