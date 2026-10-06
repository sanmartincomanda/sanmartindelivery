# Aplicacion Android de tienda

Este proyecto Android empaqueta exclusivamente la tienda virtual. Los modulos de
administracion, cocina, driver y CRM no forman parte del bundle movil.

## Requisitos locales

- Node.js 22 o superior.
- Java 21.
- Android SDK API 36 y Build Tools 36.0.0.
- Variable `ANDROID_HOME` apuntando al Android SDK.

## Generar APK de prueba

```powershell
npm.cmd install
npm.cmd run android:apk
```

El APK se genera en:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## Sincronizar cambios web

Cada cambio de la tienda debe copiarse al proyecto Android antes de compilar:

```powershell
npm.cmd run android:sync
```

## Publicacion en Google Play

El APK debug es solo para pruebas. Google Play usa el Android App Bundle (`.aab`)
de `release`. La app ya tiene una clave de carga: conservarla para las
actualizaciones, no generar una nueva. `android/keystore.properties`, las llaves
`*.jks` y `*.keystore` estan excluidos de Git; no publicar sus contrasenas.

Identificador definitivo de la aplicacion:

```text
com.sanmartinsr.app
```

Antes de compilar, revisar el mayor `versionCode` usado en Play Console e
incrementarlo junto con `versionName` en `android/app/build.gradle`.

```powershell
npm.cmd run android:sync
Push-Location android
.\gradlew.bat :app:assembleRelease :app:bundleRelease :app:lintRelease --console=plain
Pop-Location
```

Salidas: `android/app/build/outputs/apk/release/app-release.apk` y
`android/app/build/outputs/bundle/release/app-release.aab`. Subir el AAB, no el
APK debug. Verificar firma, ID, version y API minima antes de publicar.

En este equipo el SDK esta en `D:\Android\Sdk`; las variables de entorno antiguas
pueden apuntar a `C:\Android\Sdk`. Ajustar `ANDROID_HOME` y `ANDROID_SDK_ROOT`
solo para el proceso de compilacion. Si Java falla al abrir su conexion local en
Windows, usar una carpeta temporal local corta y existente para `TEMP`, `TMP`,
`java.io.tmpdir` y `jdk.net.unixdomain.tmpdir`, sin desactivar protecciones de red.
