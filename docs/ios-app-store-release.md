# Publicacion iOS

## Aplicacion

- Nombre: `Carnes San Martin`
- Bundle ID: `com.sanmartinsr.app`
- Version inicial: `1.0.0`
- Build inicial: `1`
- Distribucion inicial: Nicaragua
- Plataforma: iOS y iPadOS

El proyecto nativo esta en `ios/App` y se sincroniza con:

```bash
npm run ios:sync
```

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

## Datos que se configuraran como secretos

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`
- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_ID`
- `APP_STORE_CONNECT_PRIVATE_KEY_BASE64`

Una vez configurados, se agregara el workflow firmado para producir el archivo
`.ipa`, validarlo y cargarlo a TestFlight.

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
  proyecto existente `comanda-digital-ac1ec`. No se modificaron reglas ni datos
  comerciales. El plist es configuracion publica de cliente, no una clave de
  administracion.

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

El workflow firmado aun no se ha ejecutado: faltan el perfil App Store y los
secretos de la API de App Store Connect. La solicitud de acceso a esa API
presento condiciones de uso adicionales; se pidio confirmacion al titular y
no se aceptaron ni enviaron sin ella.

## Verificacion y pendientes

- Compilacion base sin firma: run `42400950172`, correcta.
- Compilacion con Google SPM y plist: run `42401906803`, correcta.
- Prueba de arranque nativo con captura: run `42402103604`, correcta (7m32s).
  Se instalo y abrio la app en iPhone 17 Pro Max del simulador; el proceso siguio
  vivo y la captura muestra ingreso, Google, correo y Navegar catalogo sin
  desbordamiento. Captura local: `tmp/ios-startup-42402103604/iphone-startup.png`.
  Esto no prueba compras ni el login real con una cuenta Apple/Google.
- Icono App Store comprobado: PNG de 1024x1024 sin canal alfa.
- Falta habilitar e implementar Sign in with Apple como alternativa al login
  Google, previa autorizacion solicitada. Auditar tambien revocacion del token
  Apple al solicitar eliminacion de cuenta y consentimiento para datos de entrega.
- Completar privacidad, clasificacion por edades, capturas reales de iPhone/iPad,
  contacto y acceso de demostracion para revision. No usar credenciales de un
  cliente real ni crear pedidos comerciales durante QA.
- Probar login real, mapa, carrito, cajas mixtas y checkout en iPhone/TestFlight
  antes de seleccionar el build final y enviarlo a revision.
- Ninguna version iOS ha sido cargada, enviada a revision o publicada aun.
