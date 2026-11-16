# Pantry — Restaurant Invoice Workflow

A restaurant application adapted **directly from [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)** (MIT). The original React/Vite layout and UI components are retained. A basic Node.js backend now supports a manual invoice-to-inventory workflow using the project's PostgreSQL schema.

**Status: local development prototype, ready for workflow review with Scott.** It is not a production ERP or an implemented OCR system. The local app uses persistent database records; the private hosted static preview remains a separately labeled browser demo.

## Run locally

On Windows, open this project in VS Code, choose **Terminal > New Terminal**, and run:

```powershell
.\start-dev.cmd
```

Open http://127.0.0.1:5173/ and keep the terminal running. Press Ctrl+C to stop. One command starts both the frontend (5173) and API (3001), on loopback only. The launcher uses an existing Node/pnpm installation, or the installed Codex runtime when those commands are not on PATH. It checks dependencies against the lockfile without changing the system PATH.

For a standard Node/pnpm environment on any supported platform:

Use Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

The first start creates a local PostgreSQL-compatible database under `.pantry/database` and loads fictional restaurant records. Original invoice files are stored in `.pantry/uploads`. Restarting retains both; neither directory is committed to Git. No cloud credentials are required, and there is no automatic synchronization with Supabase.

Validation:

```sh
pnpm build
pnpm test:backend
node --experimental-strip-types --test tests/restaurant.test.mjs
node tests/invoice-schema.test.mjs
```

## Basic invoice workflow

1. Upload a PDF/image (up to 10 MB), or create a manual invoice.
2. Enter supplier, invoice number/date/total and lines. Map inventory lines to supplier packs.
3. Save details. The API validates references and amounts, stores pack-size snapshots and records a review event.
4. Approve after checking the original document. Line totals + tax + shipping - discount must match the invoice total. Duplicate approved supplier/number combinations and identical uploaded documents are blocked. Reject/duplicate actions require a reason.
5. Confirm the full delivery separately. The backend creates one receipt and calls the existing `restaurant.post_receipt` function. Concurrent/repeated confirmation cannot add the goods twice.
6. Inspect receiving, inventory movements and invoice CSV reports from the same database.

Approval alone never changes stock. Reviewed invoices are locked. Only full deliveries of mapped inventory lines are supported; partial receipts, corrections, existing-receipt matching and credit notes await business confirmation. Sales and recipes are read-only in the connected version. Reviewer labels are explicitly unverified: the template's example login is not backend authentication.

## What changed from the template

- Added overview, invoices, receiving, inventory, daily sales, recipes, suppliers, reports and a demo guide.
- Replaced sidebar labels and links with restaurant navigation.
- Reused the template's layout, responsive sidebar, themes, UI components and styling.
- Preserved the original browser-local demo for the private static preview.
- Added the connected restaurant screens, invoice API, server-side document storage, PostgreSQL adapter, transactions and integration tests in November 2026.
- Retained upstream authentication/API-related source unchanged. Its optional Clerk examples remain examples and require the original configuration; they are not restaurant authentication.

`pnpm dev` runs the connected version and reports an error if its API is unavailable; it never silently falls back to browser demo data. `pnpm build` produces the static demo for the existing private Site. Its localStorage records are separate from the backend. The hosted preview has no Node API or Supabase connection.

## Database schema supplement

The separate development database started with 12 tables for locations, suppliers, purchasing, recipes and inventory. The November 9 schema supplement adds three tables for invoice headers, invoice lines and review events, plus a constraint preventing approval of a duplicate supplier invoice number. Invoice-to-receipt references must match the same supplier and location.

Migration 007 adds revision checks, tax/shipping/discount amounts, supplier-pack snapshots, immutable reviewed records and duplicate-document protection. The API reuses the original 15-table schema and receipt posting function. The local database applies the migrations automatically. Migration 007 has **not** been applied to the hosted Supabase project in this update.

Optional remote PostgreSQL/Supabase configuration uses a server-only `DATABASE_URL`. It does not expose SQL credentials to the browser or grant anonymous database access. See [docs/BACKEND.md](docs/BACKEND.md) and [database/README.md](database/README.md). Remote connection behavior has not been verified against the hosted project in this update.

## Where to edit

| File                                                | Purpose                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| `src/features/restaurant/index.tsx`                 | Restaurant pages and forms using original UI components  |
| `src/features/restaurant/data.ts`                   | Fictional sample data and pure local demo calculations   |
| `src/features/restaurant/connected.tsx`             | Connected invoice, receiving and inventory screens       |
| `src/features/restaurant/api.ts`                    | API types, requests and database-to-form mapping         |
| `server/`                                           | HTTP, validation, transactions and database adapter      |
| `database/007_invoice_workflow.sql`                 | Basic invoice workflow schema additions                  |
| `tests/backend.test.mjs`                            | HTTP, rollback, duplicate, concurrency and restart tests |
| `src/components/layout/data/sidebar-data.ts`        | Restaurant sidebar links and labels                      |
| `src/routes/_authenticated/restaurant/$section.tsx` | Restaurant page routing                                  |
| `src/components/ui/`                                | Original shared UI components                            |
| `docs/UPSTREAM.md`                                  | Exact source version, attribution and modification scope |

## Source and license

Original author: **Sat Naing**. Upstream commit: `e16c87f213a5ba5e45964e9b67c792105ec74d26` (package version 2.2.1). The full original MIT license is retained in [LICENSE](LICENSE), and the original README is preserved in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).

The earlier custom prototype is preserved by the Git tag `custom-prototype-v1`. The current main branch is the upstream-template adaptation.

For the short demonstration and business questions, see [docs/SCOTT-REVIEW.md](docs/SCOTT-REVIEW.md).
