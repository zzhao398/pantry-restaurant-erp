# Basic backend: development operation

## Run and data modes

Use Node 24 / pnpm 11, `pnpm install --frozen-lockfile`, then `pnpm dev`. On this Windows machine, `start-dev.cmd` also locates the installed Codex Node runtime. The frontend listens on 127.0.0.1:5173; Vite proxies `/api` to the Node service on 127.0.0.1:3001. Ctrl+C closes both services and the database. Stop an old instance before starting another. Do not open the same PGlite data directory from another process.

With no `DATABASE_URL`, PGlite uses the native filesystem under `.pantry/database`. First startup loads SQL 001, fictional seed 002, supplement 005 and workflow 007. Starting again preserves existing data. The browser's old localStorage demo is not imported. Original uploads are stored under `.pantry/uploads`, outside the static web root, with random filenames. Download uses the invoice ID; request paths cannot choose arbitrary filesystem paths.

Stop the server and back up the entire `.pantry` directory together. Database records and document files must remain paired. A process crash between writing an upload and committing its invoice can leave an unreferenced file; automatic deletion/recovery is not implemented. Restore the complete backup to recover the local prototype. Do not commit this directory or real invoices.

The private hosted Site is static and clearly labeled as a separate browser demo. It cannot run this Node/PGlite backend. `pnpm build` keeps that demo mode. `VITE_DATA_MODE=api` is available for a future build served behind a correctly configured same-origin API, but **a production server and staff authentication are not included**. Do not expose the local API using a public tunnel or change its binding to a public interface.

## Optional PostgreSQL / Supabase connection

The adapter was verified against `restaurant-inventory-dev` on November 18, 2026, through the Edge upload/review/receiving workflow and direct cloud checks. Session pooling on port 5432 uses TLS certificate verification. See [CLOUD-VERIFICATION.md](CLOUD-VERIFICATION.md). Use this development database only, not the unrelated paid project.

1. Migration `database/007_invoice_workflow.sql` was applied to the existing development project on November 16; do not reapply it there. For a new database, follow the order in `database/README.md`.
2. Copy `.env.example` to `.env` locally. Set `DATABASE_URL` to the provider's PostgreSQL connection string, using the correct database user, password and TLS configuration. Store credentials only in the local ignored `.env` or a server secret store. Use certificate verification; do not set `rejectUnauthorized: false`. If the direct host is unreachable on the network, use the provider's session-pooler connection details.
3. Set `PANTRY_BRAND_ID` to the intended restaurant brand UUID. The initial fictional brand is `10000000-0000-0000-0000-000000000001`. The configured database role must have the existing owner/admin access needed by the private schema and invoker functions. Anonymous browser roles remain denied.
4. Restart `pnpm dev`. The header should say `PostgreSQL connected`. An invalid connection/missing migration fails startup; there is no fallback to local data.

The configured machine keeps the password separately in `PGPASSWORD` inside the ignored `.env`; the connection URI omits the password, so it needs no URL encoding. The URI uses `sslmode=verify-full` and `sslrootcert=.pantry/certs/supabase-ca.crt`, downloaded from the certificate link in Supabase Database Settings. Credentials and that local certificate are not shipped with the repository. `start-dev.cmd --local` / `pnpm dev:local` explicitly choose the separate PGlite database without loading `.env`.

Files remain on this machine even when SQL uses a remote database. Object storage, multi-server file access and real staff authentication need a separate deployment design. `PANTRY_REVIEWER_LABEL` is a server-configured descriptive label, **not a verified user identity**. The template's mock login / optional Clerk example is not wired to this API.

## API

All writes require `X-Pantry-Request: 1`. JSON routes require `Content-Type: application/json`. The backend checks loopback Host, allowed local Origin and cross-site fetch headers. These reduce browser cross-site request risk; they do not authenticate other local processes or OS users. The API is intended for one trusted local operator.

| Method / path                    | Behavior                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET /api/health`                | Database mode and API readiness                                                                     |
| `GET /api/workspace`             | Brand-scoped reference records, invoices, receipts, balances, movements and read-only sales/recipes |
| `POST /api/invoices`             | JSON `{location_id}` for manual draft; or multipart `location_id` + `file`                          |
| `GET /api/invoices/:id`          | Header, lines, review history and possible duplicates                                               |
| `PUT /api/invoices/:id`          | Validated header/line replacement; requires current `revision`                                      |
| `POST /api/invoices/:id/review`  | `{revision, action: approved/rejected/duplicate, note}`                                             |
| `POST /api/invoices/:id/receive` | `{received_on: YYYY-MM-DD, confirmed: true}`; full receipt exactly once                             |
| `GET /api/invoices/:id/document` | Original file as an attachment                                                                      |

Save payload fields are defined in `src/features/restaurant/api.ts` (`InvoiceForm`). Unknown fields, including browser-supplied actor/brand overrides, are rejected. Errors return `{error}` with 400 for input errors, 403 for request-boundary violations, 404 for missing records/files, and 409 for stale edits or duplicate/locked records. Files are limited to 10 MB with MIME/signature checks; this is not antivirus scanning or OCR.

SQL uses parameterized statements and brand filters. Save/review/receive operations use a transaction and row locks. Revisions prevent stale saves. Approval validates four-decimal totals in PostgreSQL numeric arithmetic and serializes checks for a supplier; unique indexes arbitrate concurrent number/hash conflicts. Approved documents are immutable. Receiving uses the pack-size snapshot saved at review time and the existing `post_receipt` function; the invoice lock, unique receipt reference and transaction prevent double inventory posting. Approval creates no stock movement.

Manual invoice creation/upload are not deduplicated as transport retries: a retried creation may make another draft. The document hash/number warnings expose those drafts, and only one matching invoice may be approved. Review/receipt retries are idempotent. Every financial amount in this version is USD; taxes are manually entered. Whole delivered quantities must equal invoice quantities, with all lines mapped to the selected supplier's packs. Partial receiving, prior receipt linking, unit conversion beyond saved pack sizes and review reversals are deliberately pending Scott's decision.

## Validation

`pnpm test:backend` exercises the actual HTTP handler with an isolated PGlite database and temporary uploads, including exact file download, amount mismatch, rollback after a bad second line, competing revision updates, immutable review/audit records, normalized duplicate numbers, hash duplicates, concurrent receipt confirmation, pack snapshot stability, bad uploads/requests and durable restart. It never connects to Supabase. `node tests/invoice-schema.test.mjs` checks the original invoice supplement; `node --test tests/restaurant.test.mjs` checks the retained browser demo. TypeScript and the Vite production build are checked separately.

Implementation references: [PGlite persistence](https://pglite.dev/docs/filesystems), [node-postgres transactions](https://node-postgres.com/features/transactions), [Vite development proxy](https://vite.dev/config/server-options#server-proxy).
