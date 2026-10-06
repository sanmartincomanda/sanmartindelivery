# Tienda San Martin: evolucion retail

## Alcance y auditoria inicial

Fecha: 2026-10-06. Frontend React existente; servicios, base de datos, precios,
reservas, pagos y creacion de pedidos quedan fuera de esta migracion.

Se recorrieron en produccion Granada, Nindiri, Masaya, categorias, subcategoria,
producto, carrito, acceso, registro, actividad sin sesion y paginas legales.
No se enviaron pedidos, registros ni cobros reales.

Hallazgos:
- Inicio: invitacion, Gold y descargas desplazan los primeros productos.
- Categorias: paso intermedio grande, sin productos; volver pierde contexto.
- Agregar abre un formulario en vez de permitir compra rapida.
- Carrito mezcla cupones, entrega y beneficios; checkout duplica esos bloques.
- Retiro puede intentar enviar directamente desde el carrito.
- Botones de volver sin nombre accesible cuando se oculta su texto.
- Diferencias visuales entre web y el contenedor Android.
- Actividad expande el seguimiento dentro de una lista larga.

## Inventario de QA (antes de implementar)

Cada fila requiere interaccion funcional y revision visual del estado indicado.
Los flujos con cuenta se comprobaran con fixtures locales sin escritura remota.

| Area | Controles / recorrido | Estados y evidencia |
| --- | --- | --- |
| Inicio | sucursal, buscar, limpiar, categorias, ver seleccion | carga, sin resultados, texto largo, fotos |
| Catalogo | categoria, subcategoria, atras | producto inmediato, scroll restaurado |
| Producto | abrir, cantidad, agregar, quitar, atras | lb/unidad, minimo, incremento, oferta |
| Carrito | sumar, restar, editar, quitar, continuar | vacio, total, descuento, persistencia |
| Checkout | entrega, direccion, horario, pago, beneficios, revision | ida/vuelta, pickup, Ruta, cerrado |
| Direccion | guardadas, otra, mapa, permisos | conservar direccion, fuera de cobertura |
| Beneficios | cupon, Gold, bienvenida | invalido, elegido, sin stock, regresar |
| Actividad | en curso, anteriores, abrir pedido | estados reales, detalle, pago pendiente |
| Perfil | informacion, direcciones, Gold, ayuda | lista, editor, regreso sin perder carrito |
| Navegacion | tabs, atras UI, atras navegador, Escape, Tab | foco, historial, no salir por accidente |
| Red | offline, recarga, fallo de imagen | aviso, fallback, sin falso envio |
| Responsive | 360x800, 390x844, 430x932, tablet, desktop | sin overflow, CTA visible, safe area |
| Movimiento | abrir/cerrar, agregar, tabs, reduced motion | sin animacion continua ni confetti |

Escenarios adversos obligatorios: vaciar carrito durante checkout; cambiar
modalidad y regresar; abrir Gold y volver al mismo paso; navegador atras/adelante;
perder conexion antes de confirmar. No afirmar compras reales validadas usando
solo una simulacion.

## Estrategia

Se reutilizan los handlers, selectores y componentes de mapa/recompensas.
La nueva capa publica es independiente del modo dashboard de admintv.
La navegacion guarda solo estado de interfaz en history; nunca credenciales,
datos de pago ni datos personales. El carrito y checkout conservan su estado
React existente. No se agregan APIs ni reglas comerciales.

## Implementacion y skills

Skill utilizada: `playwright-interactive`, para inventario previo, pruebas con
navegador real, sesiones persistentes, screenshots y revision visual separada.
No se usaron skills de generacion de imagenes ni servicios nuevos.

Se refino el [sistema visual](storefront-design-system.md) conservando Space
Grotesk y azul/rojo corporativos. Se agregaron RetailProductCard, RetailCheckout,
un hook de navegacion/foco y una capa CSS publica. React sigue en la version del
repositorio. No se agregaron dependencias de produccion, endpoints ni tablas.

## Que cambia para el cliente

1. Inicio compacto: buscador y sucursal arriba, categorias pequenas, hasta cuatro
   selecciones comerciales. Gold y descarga de app dejan de desplazar productos.
2. Categoria abre productos directamente. Subcategorias compactas, catalogo en
   lotes de 24 y nombres completos; al volver se conserva el lote visible.
3. Agregar no obliga a abrir detalle. La tarjeta cambia a controles de cantidad
   usando el minimo/incremento existentes. Detalle abre una pantalla independiente.
4. Carrito persistente: barra movil o panel lateral en escritorio.
5. Checkout separado en carrito, modalidad, direccion/sucursal, horario Ruta,
   pago, beneficios y revision. Retiro ya no intenta enviar desde el carrito.
6. Direcciones y mapa mantienen los callbacks originales. El mapa tiene mayor
   superficie util, ayuda compacta y confirmacion accesible. Atrás del navegador
   cierra primero el mapa y conserva el formulario de registro.
7. Perfil es un menu; informacion y direcciones abren sus propios editores.
8. Actividad separa pedidos en curso/anteriores, con detalle y seguimiento.
   Se elimina el mapa decorativo que podia parecer GPS real.
9. Gold usa una pantalla clara, premios, puntos y movimientos. Un premio agotado
   no se presenta como el siguiente objetivo de progreso.
10. Confirmacion lleva al seguimiento del pedido creado. No se modifica el
    envio, cobro, reserva, cancelacion ni actualizacion de un pedido.

## Resultados funcionales

Ejecutor: `scripts/testStorefrontRetail.mjs`. Ultima corrida: **27/27 grupos
aprobados**, sin errores JavaScript en las paginas frescas del recorrido.
[Salida estructurada de esa corrida](screenshots/retail-2026/qa-results.json).

"Catalogo real" significa consulta de datos existentes desde localhost, sin
cuentas ni pedidos nuevos. "Fixture" usa los componentes reales con callbacks
locales y datos ficticios; NO equivale a una compra backend de extremo a extremo.

| # | Recorrido probado | Entorno / comprobacion |
| --- | --- | --- |
| 1 | Inicio y primera fila | Catalogo real; hasta 4 selecciones, foto antes de 450 px, sin overflow |
| 2 | Todas las categorias y regreso | Catalogo real; cada categoria abre productos sin pantalla intermedia |
| 3 | Categoria > producto > cantidad > carrito | Catalogo real; guardar cantidad, recuperar scroll y modalidad al volver |
| 4 | Busqueda y consulta vacia | Catalogo real; sin coincidencias, recuperar resultados, Escape conserva consulta |
| 5 | Registro y mapa | Sin registrar; GPS denegado, Atrás conserva nombre, mover pin y confirmarlo manualmente |
| 6 | Sin conexion y recuperacion | Catalogo ya cargado permanece; aviso aparece/desaparece al cambiar la red |
| 7 | Delivery completo | Fixture; direccion, cambio efectivo, cupon invalido/valido, Gold, notas, total y callback |
| 8 | Retiro completo | Fixture; sucursal > pago > revision; no envia antes de confirmar; sin costo de envio |
| 9 | Ruta y horario | Fixture con selector real; franja obligatoria, regreso conserva seleccion, envio gratis |
| 10 | Tienda cerrada | Fixture; checkout navegable, Delivery no confirma, Ruta habilitada, horario abre/cierra |
| 11 | Cobertura, offline y carrito vacio | Fixture; fuera de cobertura/sin red bloquean confirmar; vacio no continua |
| 12 | Regalia de bienvenida | Fixture; elegir, cerrar, linea C$0.00; selector sin regalos no ofrece agotados |
| 13 | Perfil y direcciones | Fixture; editar informacion y direccion guardada, guardar y comprobar callback |
| 14 | Actividad y tracking | Fixture; pendiente, preparando, preparado, enviado, entregado y cancelado; detalle legible |
| 15 | Miembro Gold | Fixture; movimientos, volver, premio agotado no canjeable |
| 16 | Atrás/Adelante del navegador | Catalogo real; producto conserva cantidad en edicion, carrito y etapa de compra |
| 17 | Minimo Ruta C$1000 | Fixture; debajo del minimo no avanza; descuento que baja del minimo bloquea confirmar |
| 18 | Tres metodos de pago | Fixture; efectivo/tarjeta/link mantienen seleccion al volver, sin pasarela ni cobro |
| 19 | Error de fotografia | Fallo de red provocado; fallback existente carga; imagen lazy con dimensiones reservadas |
| 20 | Catalogo paginado | Catalogo real; 24 > 48 productos, detalle y regreso sin perder el lote |
| 21 | Escritorio y contraste CTA | Carrito lateral >=300 px, detalle >=800 px; CTA >=44 px y contraste >=4.5:1 |
| 22 | Pantalla con teclado/texto aumentado | Viewport 360x500, CTA visible; perfil con texto 200% sin overflow horizontal |
| 23 | Responsive | 360x800, 390x844, 430x932, 820x1180 y 1440x960; inicio y footer checkout dentro de pantalla |
| 24 | Foco, Tab, Escape y reduced motion | Foco dentro del dialogo, Tab contenido, Escape vuelve, animacion desactivada |
| 25 | Sucursales | Granada, Nindiri y Masaya: nombre correcto y catalogo disponible |
| 26 | Frontend Android | Entrada StoreApp, catalogo > agregar > carrito > entrega; sin choque de estilos nativos |
| 27 | Errores JavaScript | Ningun pageerror en el recorrido completo de la corrida final |

Prueba adicional manual automatizada con **WebKit**: categoria > producto >
agregar > carrito > Retiro > direccion > Atrás; Retiro sigue seleccionado,
sin desbordamiento ni errores JavaScript. WebKit en Windows no sustituye Safari
en un iPhone real.

## Regresiones y compilacion

Los siguientes 10 scripts existentes pasaron sin modificar sus reglas:

- `testFirstOrderRewards.mjs`: intervalos, limites, progreso, stock y snapshot.
- `testAdminReports.mjs`: ventas online y conteo manual.
- `testOrderTraceability.mjs`: filtros, responsables e historial.
- `testStoreProductPromotions.mjs`: porcentajes por producto y vigencias.
- `testStoreCategoryStructure.mjs`: estructura de categorias.
- `testSicarCustomerFields.mjs`: campos de clientes SICAR.
- `testStoreRewardStatus.mjs`: estados de recompensas.
- `testStoreOrderEditor.mjs`: edicion de articulos de pedido.
- `testSharedStorePrices.mjs`: precios Granada/Nindiri.
- `testRouteSanMartin.mjs`: cobertura, costo y fechas.

`npm run build` y `npm run build:android:web`: correctos.
`git diff --check`: sin errores de espacios/conflictos.
Tambien se sirvio el build minificado con Vite preview: catalogo > agregar >
carrito > Retiro > direccion > Atrás, sin errores JavaScript ni overflow.
Se comprobo que `dist` no contiene los fixtures ni el runner de QA.
No se genero un AAB/APK nuevo ni se envio una version a Play Console en este trabajo.

## Revision visual y correcciones encontradas

Se inspeccionaron inicio, categorias, producto, carrito, pago, revision, mapa,
horario, Ruta, Gold, historial Gold, perfil, tracking, escritorio y Android.

- Se corrigio el efecto antiguo que devolvia catalogo/busqueda a Inicio al hacer scroll.
- Se quitaron iconos duplicados de buscar/volver generados por pseudo-elementos antiguos.
- Se aislaron las capas oscuras de Gold que ocultaban nombres y boton de movimientos.
- El tracking heredaba columnas reservadas para una ilustracion: el texto ahora usa todo el ancho.
- Se corrigio el ancho heredado del selector de sucursal para evitar una fila extra innecesaria.
- Se agregaron etiquetas accesibles, foco contenido y regreso de mapas anidados.
- La cantidad en edicion viaja con el historial visual; el carrito no se recrea al regresar.
- Se oscurecio solo el rojo de botones con texto blanco para superar contraste 4.5:1.
- Se verificaron screenshots con imagenes cargadas, no solo skeletons transitorios.

En 390x844, el marco de la primera fotografia pasa aproximadamente de **618 px
a 330 px** desde el borde superior. Ahora se ven nombre, precio y Agregar de la
primera fila sin bajar la pagina. Esta es una mejora de composicion, no una
medicion de velocidad de red.

## Evidencia antes/despues

Las capturas con cuenta usan datos ficticios y estan identificadas como fixtures.

| Pantalla | Antes | Despues |
| --- | --- | --- |
| Inicio | [Antes](screenshots/retail-2026/before-home-390.png) | [Despues](screenshots/retail-2026/after-home-390.png) |
| Categorias | [Antes](screenshots/retail-2026/before-categories-390.png) | [Despues](screenshots/retail-2026/after-categories-390.png) |
| Producto | [Antes](screenshots/retail-2026/before-product-390.png) | [Despues](screenshots/retail-2026/after-product-390.png) |
| Carrito | [Antes](screenshots/retail-2026/before-cart-390.png) | [Despues](screenshots/retail-2026/after-cart-390.png) |

Mas capturas: [mapa](screenshots/retail-2026/after-map-390.png),
[revision de compra](screenshots/retail-2026/after-review-390.png),
[confirmacion](screenshots/retail-2026/after-confirmation-390.png),
[Gold](screenshots/retail-2026/after-gold-390.png),
[tracking](screenshots/retail-2026/after-tracking-390.png),
[carrito desktop](screenshots/retail-2026/after-desktop-cart.png),
[Android](screenshots/retail-2026/after-android-delivery-390.png).

## Performance y accesibilidad

Sin librerias de router/motion nuevas. Lista en lotes de 24, inicio acotado,
imagenes lazy con `decoding=async`, dimensiones fijas, busqueda diferida y
animaciones cortas de transform/opacity. No se procesaron ni alteraron las
fotografias originales ni se cambio proveedor de mapas.

El build web conserva una advertencia de chunk grande: TiendaVirtualView
518.26 kB / gzip 130.08 kB y CSS 286.41 kB / gzip 37.38 kB. Se preservaron capas
legadas por compatibilidad con administracion; extraerlas es deuda pendiente.
No se afirma una mejora de Core Web Vitals ni 60 fps en hardware real sin medirlos.

Se verificaron targets principales, contraste del CTA, teclado, foco, zoom de
texto simulado, labels, estados vivos y reduced motion. No se bloqueo zoom en
viewport. No equivale a una auditoria WCAG completa ni a prueba con lector de
pantalla humano.

## Riesgos y limites pendientes

- No se hicieron pedidos/cobros/canjes reales ni se escribieron perfiles reales.
  Autenticacion real, pasarela y reserva de stock requieren ensayo controlado
  con cuenta de pruebas y entorno de pagos autorizado.
- Los escenarios de checkout verifican los callbacks y modelos existentes;
  las reglas backend se preservan y sus tests pasan, pero no se simula exito de
  SICAR, driver, cocina o conciliacion bancaria.
- No se probo en un telefono fisico. Safe-area, teclado y Android se comprobaron
  en emulacion de viewport/contenedor y con compilacion, no en un APK instalado.
- Offline conserva el catalogo ya cargado, no garantiza primer arranque sin red.
- Mapas y fotos siguen dependiendo de sus proveedores actuales y de la red.
- Hay nombres de producto con caracteres mal codificados en el catalogo existente;
  no se modificaron datos comerciales para disimularlos.
- No se inventaron productos frecuentes, recomendaciones ni GPS de repartidor.

## Reproducir QA

1. `npm ci`.
2. Instalar Playwright para QA si no existe: `npm install --no-save --package-lock=false playwright`,
   seguido de `npx playwright install chromium`.
3. Servir web: `npm run dev -- --host 127.0.0.1 --port 5178`.
4. En otra terminal: `npm run dev -- --host 127.0.0.1 --port 5179 --mode android`.
5. Ejecutar `node scripts/testStorefrontRetail.mjs`.

Variables opcionales: PLAYWRIGHT_MODULE_PATH y CHROME_PATH para instalaciones
existentes, STOREFRONT_QA_URL y NATIVE_QA_URL para otros puertos locales.
El runner rechaza dominios no locales. Los resultados y capturas completos se
guardan en `output/playwright/storefront-2026/` (ignorado por Git).
Los fixtures no forman parte del build de produccion.

## Publicacion y recuperacion

El push a main activa `storefront-firebase-hosting.yml`, que construye y publica
Firebase Hosting `tiendavirtual-2ced1`. No despliega reglas ni modifica datos.
Despues se debe comprobar el dominio y la carga de sus assets con navegador
limpio. Para volver al frontend previo, revertir el commit de esta migracion y
dejar que el mismo workflow publique; no restaurar bases de datos.
