# Pantry — Restaurant Operations Frontend

A restaurant demo adapted **directly from [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)** (MIT). This repository contains the original React/Vite template source, with restaurant pages added inside its existing layout. It is not a full ERP backend.

## Run locally

On Windows, open this project in VS Code, choose **Terminal > New Terminal**, and run:

```powershell
.\start-dev.cmd
```

Open http://127.0.0.1:5173/ and keep the terminal running. Press Ctrl+C to stop. The launcher uses an existing Node/pnpm installation, or the installed Codex runtime when those commands are not on PATH. It installs dependencies only when they are missing and does not change the system PATH.

For a standard Node/pnpm environment on any supported platform:

Use Node.js 24 and pnpm 11.

```sh
pnpm install
pnpm dev
```

The first Vite start generates the restaurant route entries. Then:

```sh
pnpm build
node --experimental-strip-types --test tests/restaurant.test.mjs
```

## What changed

- Added overview, invoices, receiving, inventory, daily sales, recipes, suppliers, reports and a demo guide.
- Replaced sidebar labels and links with restaurant navigation.
- Reused the template's layout, responsive sidebar, themes, UI components and styling.
- Added fictional browser-local data and interactions. No new backend service, HTTP endpoints, OCR service or POS integration was added.
- Retained upstream authentication/API-related source unchanged. Its optional Clerk examples remain examples and require the original configuration; they are not restaurant authentication.

Receipt posting adds demo inventory; daily sales deduct recipe ingredients. Invoice approval is a separate local review action and never receives goods. These are browser simulations, not deployed database operations. Data is stored in localStorage on this browser. Uploaded documents are previewed locally and their previews last only while the page instance remains open.

## Database schema supplement

The separate development database started with 12 tables for locations, suppliers, purchasing, recipes and inventory. The November 9 schema supplement adds three tables for invoice headers, invoice lines and review events, plus a constraint preventing approval of a duplicate supplier invoice number. Invoice-to-receipt references must match the same supplier and location.

This is a schema supplement for future integration. The frontend still uses local demo data. It does not connect to Supabase or run these SQL files. See [database/README.md](database/README.md) for installation order, validation and current limitations.

## Where to edit

| File                                                | Purpose                                                  |
| --------------------------------------------------- | -------------------------------------------------------- |
| `src/features/restaurant/index.tsx`                 | Restaurant pages and forms using original UI components  |
| `src/features/restaurant/data.ts`                   | Fictional sample data and pure local demo calculations   |
| `src/components/layout/data/sidebar-data.ts`        | Restaurant sidebar links and labels                      |
| `src/routes/_authenticated/restaurant/$section.tsx` | Restaurant page routing                                  |
| `src/components/ui/`                                | Original shared UI components                            |
| `docs/UPSTREAM.md`                                  | Exact source version, attribution and modification scope |

## Source and license

Original author: **Sat Naing**. Upstream commit: `e16c87f213a5ba5e45964e9b67c792105ec74d26` (package version 2.2.1). The full original MIT license is retained in [LICENSE](LICENSE), and the original README is preserved in [docs/UPSTREAM-README.md](docs/UPSTREAM-README.md).

The earlier custom prototype is preserved by the Git tag `custom-prototype-v1`. The current main branch is the upstream-template adaptation.
