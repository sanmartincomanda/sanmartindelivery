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

El APK debug es solo para pruebas. Para Google Play se debe crear una llave de
firma privada, configurar el build `release` y generar un Android App Bundle
(`.aab`). Las llaves `*.jks` y `*.keystore` estan excluidas de Git.

Identificador definitivo de la aplicacion:

```text
com.sanmartinsr.tienda
```
