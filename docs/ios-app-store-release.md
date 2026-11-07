# Publicacion iOS

## Aplicacion

- Nombre: `Carnes San Martin`
- Bundle ID: `com.sanmartinsr.app`
- Version inicial: `1.0.0`
- Ultimo build: `4` (codigo de app `7b7fd25f02101aaba6cfdeb6946f757ebd9a1dac`), cargado para TestFlight; App Review sigue retirada
- Distribucion inicial: Nicaragua
- Plataforma: iOS y iPadOS

El proyecto nativo esta en `ios/App` y se sincroniza con:

```bash
npm run ios:sync
```

## Estado vigente: correccion cargada, pendiente prueba fisica (2026-11-07)

La compilacion 1.0.0 (4) fue firmada, validada y cargada a Apple mediante run
`42423444946`. Corrige el bloqueo comun de Google/Apple: un cargador async
devolvia el Proxy de Capacitor, cuyo metodo `then` sintetizado hacia que la
promesa nunca terminara antes de abrir el proveedor. Se usa ahora una fachada
normal; la regresion se reproduce con el Proxy real, no solo con mocks planos.

Run nativo `42423423517`: Google abre su consentimiento, cancela y permite
reintentar; Apple llega al controlador nativo y recupera el formulario tras el
error del simulador sin Apple ID. Dos pruebas correctas, pero no constituyen
un ingreso exitoso con cuentas reales. Queda la prueba del titular en iPhone
antes de reenviar a revision. Build 4 incluye tambien cajas mixtas 2-5 y Home.
Detalle y evidencias en `docs/ios-native-auth-repair-2026-11.md`.

## Historial: retirada por fallo de acceso (2026-11-07)

El titular reporto que "Continuar con Apple" queda procesando sin abrir la
ventana nativa y autorizo retirar la version hasta corregirla. Despues pidio
publicar primero los cambios anteriores en GitHub y web antes de empezar a
modificar Apple. Se completo esa publicacion como `c8c5e67`, documentada en
`docs/store-box-sales.md`; no se modifico codigo de autenticacion iOS.

Se cancelo el envio `7a9424ae-0e77-45d8-868c-6808461a69b5` desde App Store
Connect con confirmacion expresa. Tras actualizar, Apple muestra la version
**Rechazado por el desarrollador** y el envio **Eliminado**. No hay envio publico
activo de esta version. Comprobante:
`tmp/apple-review-withdrawn-login-2026-11-07.png`.

En ese momento quedaron pendientes el diagnostico y un nuevo build. La
correccion y carga posteriores se describen arriba. Sigue pendiente comprobar
el ingreso completo en un iPhone real antes de volver a enviar a revision.

## Historial: envio a App Review (2026-11-07, luego cancelado)

El titular volvio a autorizar expresamente terminar el envio a Apple. Se
sustituyo la compilacion 2 de la ficha por 1.0.0 (3), ya cargada y procesada,
con las correcciones de acceso y cobertura documentadas en
`docs/store-access-2026-11.md`. No se genero ni cargo otro IPA.

Apple termino de procesar las capturas existentes. Se guardo la compilacion 3,
se anadio a revision y se confirmo "Enviar a revision". La consola devolvio
"1 articulo enviado" y el estado **Pendiente de revision** el 7 de noviembre
de 2026, aproximadamente a las 15:53 de Nicaragua.

- Solicitud: `7a9424ae-0e77-45d8-868c-6808461a69b5`.
- Compilacion: `3fee5558-48f6-46fa-9210-2e5008f10fe4`.
- Publicacion automatica al aprobarse, conservando Nicaragua como mercado.
- Comprobante local: `tmp/apple-review-submitted-build3.png`.
- La confirmacion de Apple indica que la revision puede tardar hasta 48 horas;
  no equivale a aprobacion ni a disponibilidad publica.
- Se repitieron correctamente test:store-access, test:apple-auth,
  test:google-auth y test:ios-config. El consentimiento Google/Apple exitoso
  en un iPhone fisico sigue sin confirmacion del titular; no se afirma probado.
- Los cambios locales posteriores de cajas mixtas de 2 a 5 productos y filas
  horizontales de Home NO estan en este IPA. Sus reglas y frontend web ya se
  publicaron en `c8c5e67`; falta incluirlos en una proxima version nativa.

Las secciones siguientes conservan el historial de preparacion; sus estados
anteriores de "no enviada" quedan sustituidos por este registro.

## Validacion sin firma

El workflow `.github/workflows/ios-build.yml` compila la aplicacion en un runner
`macos-26` con Xcode 26. Esto valida el proyecto iOS sin certificados y genera una
aplicacion para el simulador como artefacto temporal.

## Requisitos de Apple

1. Membresia activa del Apple Developer Program.
2. Registro de App Store Connect creado para `com.sanmartinsr.app`.
3. Certificado Apple Distribution y perfil App Store para el mismo Bundle ID.
4. Clave de App Store Connect API para automatizar la carga a TestFlight.

Los certificados, perfiles y claves privadas deben guardarse como secretos de
GitHub. Nunca deben agregarse al repositorio.

## Secretos configurados

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`

El workflow firmado ya produce el archivo `.ipa`, lo valida y lo carga a
App Store Connect. Las claves privadas nunca forman parte del IPA ni del codigo.

## Estado del primer lanzamiento (2026-11-07)

- Rama de preparacion: `release/ios-app-store`. No modifica la web publicada
  ni vuelve a enviar Android.
- App Store Connect: app `6832058425`, SKU `CSM-IOS-001`, idioma `es-MX`,
  version `1.0.0`, aun **en preparacion para el envio**.
- Bundle ID registrado: `com.sanmartinsr.app`, equipo `592BNYJX36`.
- Ficha guardada: descripcion, texto promocional, palabras clave, soporte,
  copyright, subtitulo. Categorias: Comida y bebida / Compras.
- Descarga gratuita. Disponibilidad: solo Nicaragua al publicarse.
  Mac con Apple silicon y Vision Pro deshabilitados para el primer lanzamiento.
- Certificado Apple Distribution creado, vence 2027-11-07. El certificado con
  clave privada cifrada y su contrasena estan en los secretos de GitHub;
  ninguna clave privada esta en el repositorio.
- Firebase iOS app: `1:41323183250:ios:293d96e144f574e6917a4b`, dentro del
  proyecto existente `comanda-digital-ac1ec`. No se modificaron reglas, pedidos,
  precios o puntos. Se creo una cuenta cliente exclusiva para Apple, autorizada
  por el titular, sin compras ni recompensas. El plist es configuracion publica
  de cliente, no una clave de administracion.

## Google nativo y SPM

El paquete Authentication 8.0.0 compila sin Google en SPM y deja el cuerpo del
proveedor excluido por `RGCFA_INCLUDE_GOOGLE`. `scripts/prepareIos.mjs` agrega
GoogleSignIn 9.0.0 y la bandera a ese target, sin alterar Android. Tambien
normaliza las rutas SPM generadas por Capacitor en Windows.

`GoogleService-Info.plist` se incluye en Resources y su `REVERSED_CLIENT_ID`
esta registrado en `Info.plist`. El propio plugin inicializa Firebase al cargar;
no se duplico esa inicializacion en AppDelegate.

Ejecutar siempre `npm run ios:sync` o los pasos completos del workflow, no solo
`npx cap sync ios`. `npm run test:ios-config` verifica el proyecto y la
preparacion reproducible. `npm run test:google-auth` verifica que web, Android
e iOS conserven sus flujos de autenticacion correspondientes.

## Carga firmada

`.github/workflows/ios-appstore.yml` esta preparado para crear un archivo IPA
en macOS 26, instalar firma en un llavero efimero, comprobar el Bundle ID del
perfil y eliminar los materiales temporales al finalizar. `upload=false`
solo construye; `upload=true` valida y carga a App Store Connect. **No envia
automaticamente a revision ni publica la app.** Cada carga necesita un numero
de build nuevo. El perfil se aplica solo al target Release de la app, no a SPM.

El titular acepto las condiciones de la API. Perfil App Store con capacidad
Sign in with Apple y los siete secretos instalados. Clave de carga limitada
al rol Developer. La firma se aplica solo al target de la app.

Se despacha desde el workflow registrado en la rama principal, sin publicar web:

```bash
gh workflow run ios-build.yml --ref release/ios-app-store -f release=true -f build_number=3
```

El ejemplo usa el siguiente numero libre, no vuelve a cargar el build 2.

- Build 1: run `42404126827`, firmado, validado y procesado por Apple.
- Build 2: run `42404530784`, firmado, validado y procesado por Apple.
  Asociado a la ficha 1.0.0 y al grupo privado `San Martin - Revision interna`.
- Unico tester interno: titular existente de la cuenta. Invitacion enviada;
  distribucion automatica desactivada. No se creo enlace publico de prueba.
- IPA local: `tmp/ios-app-store-1.0.0-2/App.ipa` (gitignored).
- Cargar un IPA no significa enviarlo a App Review ni publicarlo.

## Continuar con Apple

- Proveedor `apple.com` habilitado en Firebase, con autorizacion del titular.
- App ID primario `com.sanmartinsr.app`; Services ID
  `com.sanmartinsr.app.login`; callback
  `https://comanda-digital-ac1ec.firebaseapp.com/__/auth/handler`.
- Clave de login separada de la clave de carga. Solo guardada en Firebase y
  copia local protegida fuera del repositorio; no se entrega al cliente.
- Remitente `noreply@comanda-digital-ac1ec.firebaseapp.com` registrado en el
  relay privado de Apple, coincidente con las plantillas actuales de Firebase.
- Boton negro estandar solo en iOS. Google y correo conservan sus flujos;
  no aparece un boton Apple inoperante en Android o web.
- Nonce nativo verificado por Firebase JS; no se crea una segunda sesion
  Firebase nativa. Perfil incompleto pide consentimiento para nombre, telefono
  y direccion; no vincula cuentas automaticamente por coincidencia de correo.
- Al solicitar eliminacion, la cuenta vinculada a Apple se reautentica y
  revoca el acceso mediante Identity Platform antes de registrar la solicitud.
  El borrado de los datos comerciales sigue el proceso existente (hasta 30 dias),
  no se presenta como borrado inmediato. No se desplegaron Functions ni reglas.

## Ficha y privacidad

- Privacidad publicada y corregida tras dos aprobaciones expresas: 17 tipos de
  datos. La inspeccion de todos los `PrivacyInfo.xcprivacy` del IPA firmado
  detecto cuatro tipos adicionales declarados por GoogleSignIn/Firebase:
  ubicacion aproximada, ID de dispositivo, otros datos de uso y diagnosticos.
  Tambien se declaro analisis para ID de usuario y otros tipos de datos.
  Los diagnosticos no estan vinculados; los otros 16 tipos si. Ninguno se usa
  para seguimiento publicitario entre empresas. Vista detallada verificada.
- Repetir la inspeccion de los manifiestos del IPA en futuras actualizaciones
  de SDK; no deducir las etiquetas solo de los formularios visibles de la tienda.
- Politica: `https://tienda.sanmartinsr.com/privacidad`.
- Solicitudes: `https://tienda.sanmartinsr.com/eliminar-cuenta`.
- Clasificacion calculada 4+, no categoria infantil. Sin apuestas, contenido
  sexual/violento, red social, chat entre clientes o navegador no restringido.
  Miembro Gold no es una caja de recompensas aleatorias ni una apuesta.
- Derechos sobre contenido de terceros declarados tras confirmacion del titular.
- Credenciales de revision guardadas solo en el apartado privado de Apple y
  archivo local protegido fuera del repo. No usar cuentas de clientes reales.
- Capturas reales cargadas en consola: tres de iPhone Dynamic Island mediano
  (1206x2622) y tres de iPad 13 pulgadas (2064x2752), en orden tienda, producto
  y carrito. Sin maquetas, pedidos reales ni datos privados de clientes.
- Al intentar anadir la version a revision, Apple solo indica: "Una o mas
  capturas de pantalla deben terminar de procesarse". Las seis imagenes y
  sus miniaturas estan guardadas. No borrar ni volver a cargar los archivos
  mientras se procesan. Reintentar el envio cuando Apple termine; no existe
  todavia una solicitud de revision enviada ni aprobacion de publicacion.

## Verificacion y pendientes

- Compilacion base sin firma: run `42400950172`, correcta.
- Compilacion con Google SPM y plist: run `42401906803`, correcta.
- Prueba de arranque nativo con captura: run `42402103604`, correcta (7m32s).
  Se instalo y abrio la app en iPhone 17 Pro Max del simulador; el proceso siguio
  vivo y la captura muestra ingreso, Google, correo y Navegar catalogo sin
  desbordamiento. Captura local: `tmp/ios-startup-42402103604/iphone-startup.png`.
  Esto no prueba compras ni el login real con una cuenta Apple/Google.
- Icono App Store comprobado: PNG de 1024x1024 sin canal alfa.
- Arranque con Apple nativo: run `42403740994`, correcto. La captura descubrio
  un estilo azul que sobreescribia el boton Apple; corregido en build 2.
- Pruebas locales correctas: `test:apple-auth`, `test:google-auth`,
  `test:ios-config`, `test:box-sales`, `test:box-sales-ui`, `test:retail-home`,
  `test:store-editorial`, `test:store-order-source`, `test:manual-route`,
  `build:ios:web`. Queda advertencia preexistente de bundles mayores de 500 KB.
- Run `42404528186` agoto seis minutos mientras inicializaba el simulador,
  antes de instalar la app. Se amplio el limite a 12 minutos. Run `42405416292`
  se cancelo para seleccionar el tamano de iPhone requerido por la ficha.
- Run `42405742633`: arranque real de iPhone correcto, boton Apple negro
  verificado en `tmp/ios-startup-build2/iphone-startup.png` (1206x2622).
  El target de pruebas fallo al compilar porque faltaba `PRODUCT_NAME`;
  corregido en `5bb38d4`. Ahora compila las pruebas antes de arrancar simuladores.
- Run `42407245997`: compilacion y arranque correctos; XCTest agoto el tiempo
  al lanzar la app mediante el depurador. Se corrigio el entorno de captura:
  apertura con simctl, conexion con activate() y ejecucion sin paralelismo.
- Run `42409009679`: correcto, 23m14s. Recorrido nativo completo de invitado
  en iPhone 17 Pro e iPad Pro 13-inch (M5): ingreso visible, catalogo, detalle
  de Corbata por caja, agregar una caja y abrir carrito. Ambas pruebas con
  cero fallos; imagenes revisadas visualmente. No se confirmaron compras.
  Evidencia local: `tmp/ios-shopping-42409009679/`, incluidos logs y xcresult.
  El codigo de app sigue siendo el de build 2; solo cambiaron CI y documentacion.
  No sustituye una prueba de autenticacion con Apple real.
- El titular pospuso su prueba fisica. No estan comprobados de extremo a
  extremo el ingreso con Apple/Google, el mapa ni la revocacion de una cuenta
  Apple real. Los tests de tokens/revocacion usan dobles de prueba.
- Estado actual: IPA cargado, disponible en TestFlight privado; ficha en
  preparacion a la espera del procesamiento de capturas por Apple,
  **no enviada a App Review ni publicada en App Store**.
