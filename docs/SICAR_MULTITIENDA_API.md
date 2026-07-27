# API SICAR multitienda

Cada sucursal instala el mismo integrador local. El archivo privado `sicar.local.json` identifica la tienda y contiene solamente la conexion SICAR de ese servidor.

## Configuracion por servidor

1. Copiar `config/sicar.branch.example.json` como `sicar.local.json` en la raiz del proyecto.
2. Usar `branchId` con uno de estos valores: `granada`, `masaya` o `nindiri`.
3. Completar la conexion MySQL local y generar una `apiKey` distinta por sucursal.
4. Mantener `bindHost` en `127.0.0.1`. Para acceso desde otra maquina se recomienda VPN; no se debe exponer MySQL ni el puerto 3077 directamente a Internet.
5. Instalar la tarea de inicio automatico con `scripts/installSicarIntegratorTask.ps1`.

`enableBackgroundSync` permite ejecutar la API sin procesar colas. En operacion normal debe quedar en `true`. `enableQuoteSync` controla especificamente la creacion y vigilancia de cotizaciones.

El integrador filtra la cola por `storeBranchId`. Un servidor Masaya nunca procesa una cotizacion de Granada o Nindiri.

## Endpoints v1

- `GET /api/v1/sicar/health`
- `GET /api/v1/sicar/catalog`
- `GET /api/v1/sicar/catalog/recent?days=30`
- `GET /api/v1/sicar/image?code=00023`
- `POST /api/v1/sicar/prices` con `{ "codes": ["00023"] }`
- `POST /api/v1/sicar/quote` con `{ "orderKey": "2026-07-27-001", "applyToFirebase": true }`

Cuando `apiKey` esta configurada, enviar uno de estos encabezados:

```text
X-SanMartin-Api-Key: CLAVE_DE_LA_SUCURSAL
```

o:

```text
Authorization: Bearer CLAVE_DE_LA_SUCURSAL
```

Las rutas anteriores `/api/sicar/*` se mantienen para compatibilidad con Granada. Las rutas `/api/v1/sicar/*` incluyen siempre `branchId` en la respuesta.

## Flujo recomendado

La tienda y Firebase son centrales. Cada servidor local escucha solamente pedidos de su sucursal, crea o actualiza la cotizacion en su SICAR y devuelve el resultado a Firebase. Esto evita conexiones entrantes desde Internet y permite agregar nuevas tiendas copiando el mismo agente y cambiando solo `sicar.local.json`.
