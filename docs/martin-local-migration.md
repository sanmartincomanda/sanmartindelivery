# Martin IA: local migration (2026-10-09)

The owner explicitly requested removing Martin SI from AdminTV and Firebase to
stop its cloud consumption. The local replacement is installed in `D:/Martin-IA`.
It uses Node.js and SQLite, Windows-user-encrypted credentials, and loopback-only
HTTP at `http://127.0.0.1:4317`. Its runtime has no Firebase SDK or database client.
Whaticket and OpenAI remain external providers, with their own costs.

## Removed from the web application

The navigation item, lazy route, components, polling clients and tests of the
retired cloud dashboard are removed. An old saved view is handled by the existing
available-navigation fallback to Home. The release gate rejects cloud Martin
markers while continuing to require the retail storefront, editorial, manual
Ruta orders and commercial Whaticket client linking.

## Cloud boundaries

Only AI-agent resources and these two private database subtrees are retired:

- `integrations/whaticket/training`
- `integrations/whaticket/agent`

Four independent commercial Functions must remain: `whaticketOrdersApi`,
`resolveWhaticketClient`, `mirrorWhaticketClientLink`, `notifyWhaticketOrderStatus`.
Do not delete the whole Whaticket integration, shared API credentials, clients,
catalog, order intake/idempotency records, orders, original-order snapshots,
SICAR queues or loyalty data.

## Recovery and local operation

Verified compressed backups, hashes, original deployed source and pre-removal
AdminTV files are stored under `D:/Martin-IA/backups`, outside Git. Private
conversations and keys must never be committed or added to a public deployment.
Detailed operation results are in `D:/Martin-IA/migration` on the owner's PC.

Local observation starts paused. Reading a conversation or an archived report
does not call the AI. Evaluation and owner chat require explicit user actions
and reserve against conservative daily/monthly local caps. The local runtime
does not automatically send WhatsApp messages or create orders. Historic trials
are retained as data, not silently resumed. The computer must remain powered
on for local observation. No cloud auto-restart mechanism should be recreated.
