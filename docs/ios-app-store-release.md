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
