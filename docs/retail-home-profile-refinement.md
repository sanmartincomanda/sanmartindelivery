# Inicio y perfil: refinamiento retail

Diseno comprobado el 2026-11-13. Publicacion web autorizada el 2026-11-14,
seguida por nuevas apps. La version Android 1.2.15 (18) enviada anteriormente
no contiene estos cambios nuevos.

## Publicacion web del 14 de noviembre

- GitHub main y release/ios-app-store: d9d39a5055f20b05b32d81eeaba9327e55b73c71.
- Netlify produccion: 6af867366e4181ff3d6b4e53. El dominio real
  https://tienda.sanmartinsr.com/release.json devuelve ese commit.
- Firebase Hosting: workflow 43601705360 finalizado correctamente.
- HTML y nuevo JS descargados del dominio real: perfil refinado y anuncios
  despues de los productos presentes. La comprobacion visual posterior al
  despliegue esta pendiente de habilitar navegador; no se afirma realizada.
- Repetidos build, web-release, retail-home, retail-interactions, categorias,
  editorial y manual-route. Sin cambios de backend ni datos de clientes.
- Siguientes binarios: Android 1.2.16 (19), iOS 1.0.2 (7). No interpretar
  esta preparacion como aprobacion de las tiendas.

## Auditoria y decisiones

- Se inspecciono la tienda real de Granada antes de editar, con sus cinco
  promociones Black Meat November y trece presentaciones por caja.
- La publicidad editorial desplazaba las promociones. Ahora categorias y
  accesos preceden al primer carril promocional. Black November conserva sus
  cinco productos y las cajas conservan el orden configurado en AdminTV.
- Ajuste solicitado el 14 de noviembre: "Hoy se come bien" y hamburguesas
  aparecen despues de los grupos de productos, antes de "Ver todo el catalogo".
  Se mantienen sus destinos Linea Gold y busqueda de hamburguesas.
- La identidad se mantiene: azul #0044C5, rojo de marca, Space Grotesk,
  fotografias reales, fondo calido y vectores de carniceria existentes.
- Categorias: icono exterior de 68 px, simbolo de 44 px, area de 84 x 108 px,
  nombres que pueden ocupar dos lineas. Se corrigio la precedencia de CSS
  heredado que recortaba iconos y etiquetas al ampliar el tamano.
- Accesos Promos/Pedidos/Gold: una fila de controles neutros, iconos lineales,
  sin bordes de colores ni divisores. Area tactil minima de 44 px.
- Perfil: nombre y avatar inicial, accesos a pedidos/direcciones, una fila
  sobria de Gold y menu alineado con informacion y ayuda/privacidad. Se oculta
  el buscador y la fila de sucursal en esta pantalla, no el carrito.
- Perfil se extrajo a un componente de presentacion con los callbacks
  existentes. No hay APIs, dependencias, reglas comerciales ni datos nuevos.
- No se cambiaron precios, descuentos, puntos, pedidos, autenticacion ni
  inventario. SICAR y su cambio local preexistente permanecen intactos.

## Pruebas automaticas

Aprobadas: build web; test:web-release (4); test:retail-home;
test:retail-interactions; test:store-editorial; test:store-categories;
test:box-sales; test:box-sales-ui; test:store-product-promotions;
test:manual-route (578 aserciones y cobertura/fecha); test:google-auth;
test:apple-auth; test:store-access; test:popup-ads.

Se agregaron pruebas de los siete accesos del perfil, nombres largos, cuenta
vacia, Gold deshabilitado, etiquetas tactiles y titulos editables de campanas.
El fixture CSS de categorias se actualizo para usar las mismas clases raiz
que la tienda real, con aserciones sobre altura, iconos y etiquetas multilinea.

## Navegador real

- Inicio a 360x800, 390x844, 430x932, 820x1180 y 1440x960: sin desbordamiento
  horizontal; tres accesos en una fila; promociones y todos sus productos.
- Perfil con nombre largo a 360, 430, 820 y 1440 px: sin desbordamiento;
  botones entre 48 y 81 px de alto, columnas e iconos alineados.
- Pollo -> Res directamente sin regresar a Inicio; regresar a Inicio;
  promocion -> producto -> agregar 1 lb -> carrito -> subir a 1.5 lb ->
  entrega -> volver. Se conservo 1.5 lb y el total de C$227.52; luego se
  vacio el carrito local. No se confirmo un pedido.
- Perfil de prueba: direcciones y regreso, Gold y regreso, informacion,
  ayuda/privacidad e historial. Datos ficticios, sin guardar en Firebase.
- Entrada nativa en modo Android en navegador: ingreso como invitado,
  cierre de anuncio, categorias 68 px, controles 44 px, Black November
  primero y sin overflow. No equivale a probar un APK en telefono fisico.
- Se observo un aviso React de createRoot repetido durante recarga en
  caliente del fixture de desarrollo. No hubo un fallo bloqueante del flujo.
- Capturas locales en ../output/: retail-before-home.jpg,
  retail-after-home-390.jpg, retail-after-profile-390.jpg,
  retail-after-home-desktop.jpg y retail-native-preview-390.jpg.
  Mediciones en retail-responsive-checks.json.

## Limites y publicacion

- No se crearon cuentas, compras, reservas ni cobros reales.
- No se realizo inicio de sesion nativo en un iPhone o Android fisico.
- No es una certificacion de accesibilidad ni una auditoria de toda la app.
- Build mantiene la advertencia existente sobre chunks mayores de 500 kB;
  no se agregaron dependencias ni imagenes nuevas.
- Antes de publicar, integrar origin/main y repetir los controles de release.
  Web y apps usan el mismo frontend, pero las apps empaquetadas necesitan
  nuevas versiones: no modificar ni atribuir este diseno al paquete 18.
