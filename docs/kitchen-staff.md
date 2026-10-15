# Kitchen preparer directory

AdminTV: **Configuracion > Preparadores**. Add and edit full names and kitchen
aliases. "Retirar" soft-disables a person; the Inactivos filter allows reactivation.
This is personnel assignment, not login-account management. The shared Cocina
login remains under Acceso Cocina and is not changed by this feature.

## Data

`kitchenStaff/schemaVersion = 1`; `kitchenStaff/members/{stableId}` contains
`name`, `alias`, `active`, `sortOrder`, `revision`, `createdAt`, `updatedAt`,
`updatedBy`. Initial creation copies the ten former hardcoded choices once.
An initialized empty/inactive directory never falls back to the old list.
Root transactions serialize changes, reject stale member revisions and prevent
duplicate names/aliases (including inactive people). No polling is used.

New assignments preserve `cocinero` (the original full-name field), plus
`cocineroId` and `cocineroAlias` as order snapshots. Kitchen and order lists use
the snapshot, not the current directory name. Reports and archives continue
reading `cocinero`. No existing order or historical name is rewritten.

Directory reads: admin, branch_admin, operator, kitchen. Directory writes: admin
only. Clients/drivers have no access to personnel data. Rules validate fields.
The new `cocineroId` validation on `orders` and legacy `rutaOrders` rejects an
inactive or renamed selection and prevents an old open picker recreating a
deleted/cancelled order. Existing snapshots remain valid when finishing orders
after a person is renamed or retired. Legacy clients without IDs are unchanged.

## Deployment

Before web publishing, add only these three rule subtrees to freshly retrieved
live rules, preserving all unrelated live permissions:

- `kitchenStaff`
- `orders/$orderId/cocineroId`
- `rutaOrders/$orderId/cocineroId`

Back up rules and the directory. Initialize with a transaction or conditional
create only if absent. The admin screen also initializes an absent directory.
No changes to orders, credentials, rewards, SICAR, Ruta enablement or AI services
are part of this migration. Do not blindly replace live rules from this checkout.

## Verification

`npm run test:kitchen-staff` uses only the RTDB emulator at `127.0.0.1:19000`,
namespace `demo-kitchen-staff`. An optional argument selects the proposed live
rules file. Eighteen scenarios cover initialization, role restrictions, CRUD,
validation, concurrent duplicate/stale edits, deactivation, snapshots, Delivery
and legacy Ruta assignments, cancelled/deleted orders and no-active-staff states.

Also run the production gates in AGENTS.md, `test:store-reward-reservations`, and
`scripts/testRoutePauseRules.mjs` against the proposed rules. Browser QA uses a
local-only emulator fixture, never real customer orders.
