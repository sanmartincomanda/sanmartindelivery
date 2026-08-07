# Sistema visual de tienda publica

Alcance: experiencia del cliente en `tienda.sanmartinsr.com`. Administracion, cocina y driver no usan estas reglas.

## Principios

- El producto, precio, unidad y accion de compra tienen prioridad.
- Una superficie solo se encierra cuando expresa seleccion, entrada de datos o una accion independiente.
- El azul comunica navegacion y confianza; el rojo se reserva para compra, promociones y alertas.
- Los movimientos duran entre 90 y 160 ms y nunca bloquean un toque.
- Toda accion interactiva tiene foco visible y un objetivo tactil minimo de 40 px.

## Tokens

| Grupo | Valores |
| --- | --- |
| Marca | Navy `#0b2f53`, azul `#0c4b85`, rojo `#e51f37` |
| Texto | Principal `#142235`, secundario `#617083` |
| Superficie | Canvas `#f5f6f7`, superficie `#ffffff`, borde `#dfe4e8` |
| Estado | Exito `#117a4b`, advertencia `#a45b08`, error `#b42332` |
| Radios | 8 px, 12 px y 18 px |
| Espaciado | Base de 4 px; usos frecuentes 8, 12, 16, 24 y 32 px |
| Elevacion | Borde o sombra baja; sombra alta solo en overlays |
| Movimiento | 90 ms para presion, 120-160 ms para cambios de estado |

## Tipografia

- Familia: `Avenir Next`, con respaldo en `Trebuchet MS` y `Segoe UI`.
- Titulos de seccion: 18-21 px, peso 850-900.
- Producto: 12-13 px, maximo dos lineas.
- Precio: 16-17 px, peso 900.
- Metadatos: 8-11 px, color secundario.
- Campos moviles: 16 px para evitar zoom automatico.

## Patrones

- Encabezado: marca, cuenta, carrito, sucursal y busqueda; compacto y fijo.
- Categorias: carril horizontal; estado activo azul solido, sin degradado.
- Producto: fotografia real sobre superficie neutra, nombre, precio, unidad y boton de agregar.
- Carrito movil: barra de accion sobre la navegacion inferior solo cuando contiene productos.
- Navegacion movil: fija al borde inferior, sin efecto flotante ni vidrio.
- Modal de producto: pantalla completa en movil y dialogo centrado en escritorio.
- Loading: estructura de producto con skeleton discreto.
- Vacio: mensaje especifico, sugerencia y accion para limpiar filtros.
- Imagen fallida: marca neutral como fallback, sin icono roto del navegador.

## Accesibilidad

- Contraste AA en textos y acciones principales.
- Foco visible de 3 px.
- Respeto de `prefers-reduced-motion`.
- Safe areas en navegacion, carrito y overlays moviles.
- Nombres accesibles existentes se conservan para botones y productos.
