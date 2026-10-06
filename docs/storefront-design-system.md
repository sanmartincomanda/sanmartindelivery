# Sistema visual de tienda publica

Revision retail: 2026-10-06. Aplicable a web/PWA y al frontend del contenedor
Android. No sustituye los estilos de administracion, cocina o driver.

## Direccion

Producto, nombre completo, unidad, precio y accion antes que publicidad.
Fondo blanco, superficies neutras, azul corporativo para navegacion y rojo
para compra. Sin madera, vidrio, sombras grandes ni confetti. No crear datos
de producto, recomendaciones personalizadas o tracking que la API no provee.

## Tokens

Implementados en `src/styles/storefrontRetail.css`, cargado despues de las
capas anteriores para migrar sin alterar el dashboard.

| Grupo | Valores |
| --- | --- |
| Marca | Azul `#0044c5`, rojo `#ff000c` |
| CTA rojo | `#d60917`, variante oscura para texto blanco legible |
| Texto | Principal `#142c3c`, secundario `#586875` |
| Superficies | Blanco `#ffffff`, suave `#f5f7f8`, borde `#e1e6e9` |
| Gold | Superficie `#f8f3e7`, texto `#614916`, boton `#73581e` |
| Radios | 8-10 px controles, 12 px fotos, 16-18 px sheets |
| Espacios | Base 4 px; 8, 12, 16, 24 y 28 px |
| Motion | 140-150 ms controles/fotos, 160 ms tabs, 210-220 ms pantallas |

## Tipografia e imagen

- Se conserva Space Grotesk, archivo local ya presente en el proyecto.
- Titulos 20-26 px, producto 14 px sin truncar el nombre, precio 17 px.
- Texto auxiliar 11-14 px; campos 16 px para evitar zoom automatico en iOS.
- Fotos cuadradas en listado, `object-fit: contain`, dimensiones reservadas.
- Detalle con imagen amplia, sin recorte agresivo ni deformacion.
- Skeleton de imagen limitado a tres ciclos; fallback existente si falla la foto.

## Arquitectura de pantallas

Inicio / Categorias / Actividad / Perfil son destinos principales.
Categoria -> subcategoria -> producto conserva contexto al volver.
Carrito -> Entrega -> Direccion/Sucursal -> Horario (Ruta) -> Pago ->
Beneficios -> Revision -> Confirmacion -> Seguimiento.

`useRetailNavigation` registra estado de interfaz en History API: pantalla,
filtros, identificador de producto/pedido y cantidad en edicion. No guarda
credenciales, direccion, cupones ni datos de pago en el historial.
El estado comercial permanece en TiendaVirtualView y sus servicios existentes.
Los mapas y editores anidados consumen primero la accion Volver.

## Componentes

- `RetailProductCard`: foto, nombre, unidad/SKU, precio, oferta y Agregar/stepper.
- `RetailCheckout`: presentacion progresiva; recibe modelo y callbacks del
  CheckoutSheet existente, no calcula nuevas reglas ni crea pedidos por su cuenta.
- Perfil: menu antes de formularios, con informacion, direcciones, Gold y ayuda.
- Actividad: En curso / Anteriores; detalle independiente con estados reales.
- Gold: pantalla blanca y acento dorado sobrio; movimientos y canjes existentes.
- Confirmacion: pantalla simple con acceso al seguimiento, sin prometer pago cobrado.
- Tareas breves: horario, sucursal y premios conservan sus sheets y controles.

## Responsive

- 360/390/430 px: dos columnas de catalogo; carriles horizontales en inicio.
- Desde 700 px: tres columnas, categorias en dos columnas, detalle dividido.
- Desde 1181 px: cuatro columnas y carrito lateral; ancho util hasta 1400 px.
- Navegacion inferior blanca de cuatro destinos; acceso al carrito sobre ella.
- Pantallas internas completas en movil; panel amplio hasta 880 px en escritorio.
- Mapa portallado: pantalla completa en movil y hasta 920 px en escritorio.
- Safe areas en encabezados de pantallas, footer, carrito, mapa y navegacion.

## Accesibilidad y estados

Foco visible de 3 px, etiquetas de botones/campos, `aria-pressed`, regiones
de estado, foco contenido en dialogs e interfaz de fondo `inert`.
Controles principales de al menos 44 px. No se impide el zoom del navegador.
`prefers-reduced-motion` desactiva motion y skeleton animado.
Offline conserva la vista montada y bloquea confirmar, sin simular exito.

## Limites de esta migracion

Se conservan las capas antiguas para proteger las superficies administrativas.
Queda deuda de CSS y un chunk web grande; no es una reescritura completa ni
una certificacion WCAG. Los ensayos y limites concretos estan en
[la auditoria](storefront-retail-qa.md).
