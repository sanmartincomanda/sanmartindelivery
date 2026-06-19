# Despliegue Firebase y migracion a Storage

Fecha: 2026-06-19

Este documento deja el orden exacto para pasar los cambios de optimizacion de Firebase a produccion sin romper la tienda.

## Objetivo

Aplicar en este orden:

1. Reglas e indices de Firebase.
2. Deploy de la app web.
3. Migracion de fotos legacy a Storage.
4. Limpieza de pedidos vencidos.
5. Validacion final de consumo y funcionamiento.

## Archivos listos para deploy

- [firebase.json](./firebase.json)
- [.firebaserc](./.firebaserc)
- [firebase.database.rules.json](./firebase.database.rules.json)
- [firebase.storage.rules](./firebase.storage.rules)

## Paso 0. Preparacion

Trabaja desde la raiz del proyecto:

```powershell
cd "C:\Users\Microsoft Windows 11\Documents\APLICACIONES\sanmartindelivery-main\sanmartindelivery-main"
```

Si hace falta iniciar sesion en Firebase:

```powershell
npm run firebase:login
```

Verifica que el proyecto objetivo sea `comanda-digital-ac1ec`:

```powershell
npm run firebase:use
```

## Paso 1. Subir reglas e indices de Firebase

Este paso debe ir primero, antes de usar la migracion de fotos en la app.

```powershell
npm run firebase:deploy:rules
```

Que aplica:

- indices para `orders.fecha`, `orders.storeUserKey`, `orders.repartidorCodigo`
- indice para `rutaOrders.fecha`
- indice para `clients.codigo` y `clients.telefono`
- reglas de Storage para `/store/catalog/**`

## Paso 2. Publicar la app

Si Netlify ya esta conectado a `main`, basta con confirmar que el ultimo push ya llegue al deploy.

Validaciones minimas despues del deploy:

1. La tienda abre.
2. El catalogo sigue cargando.
3. Admin entra a configuracion.
4. Driver entra sin error.
5. Historial sigue cargando.

## Paso 3. Migrar fotos legacy a Storage

Este paso ya corre desde la app.

Ruta:

1. Abrir Administracion.
2. Ir a `Configuraciones`.
3. Entrar a `Catalogo de tienda virtual`.
4. Presionar `Migrar fotos a Storage`.

Que hace:

- toma fotos base64 legacy del catalogo
- las sube a Firebase Storage
- reemplaza el catalogo para que use URLs
- limpia metadata pesada heredada

Recomendacion:

- Ejecutarlo una sola vez.
- Esperar a que termine completo.
- No cerrar la pantalla mientras corre.

## Paso 4. Limpiar pedidos vencidos

Despues de que la app nueva ya este publicada, la limpieza manual debe hacerse desde configuracion.

Ruta:

1. Abrir `Configuraciones`
2. Presionar `Limpiar pedidos vencidos`

Esto reemplaza la limpieza automatica que antes corria incorrectamente desde la tienda publica.

## Paso 5. Validacion final

### Catalogo

Revisa varios productos y confirma:

1. La foto carga bien.
2. El precio sigue correcto.
3. La tienda carga mas rapido que antes.

### Pedidos

Revisa estos flujos:

1. Crear pedido manual.
2. Crear pedido en tienda virtual.
3. Ver pedido del cliente autenticado.
4. Enviar pedido desde lista.
5. Ver pedido en app driver.
6. Ver historial por rango de fechas.

### Consumo esperado

Despues de la migracion deberias ver mejoras claras en:

1. Menos descarga por abrir la tienda.
2. Menos descarga por revisar historial.
3. Menos descarga por usar driver.
4. Menos transferencia del catalogo.

## Orden recomendado exacto

1. `npm run firebase:deploy:rules`
2. esperar confirmacion de Firebase
3. confirmar deploy de Netlify/main
4. abrir app admin
5. correr `Migrar fotos a Storage`
6. correr `Limpiar pedidos vencidos`
7. probar tienda, admin, cocina y driver
8. revisar en consola Firebase el uso de ancho de banda las siguientes horas

## Riesgos conocidos

### Si no despliegas reglas de Storage primero

La migracion de fotos puede fallar por permisos.

### Si haces la migracion antes del deploy de app

No aprovechas aun las nuevas lecturas ligeras.

### Si alguien abre una version vieja en cache

Puede seguir leyendo catalogo con logica anterior hasta refrescar. Lo recomendable es probar con hard refresh tras deploy.

## Comandos utiles

```powershell
npm run build
npm run firebase:use
npm run firebase:deploy:rules
```

## Checklist de cierre

- [ ] Reglas Firebase aplicadas
- [ ] App publicada
- [ ] Fotos migradas a Storage
- [ ] Limpieza manual ejecutada
- [ ] Tienda validada
- [ ] Driver validado
- [ ] Historial validado
- [ ] Consumo revisado en Firebase
