# Source provenance

## Actual code base

- Repository: https://github.com/satnaing/shadcn-admin
- Original preview: https://shadcn-admin.netlify.app
- Imported commit: `e16c87f213a5ba5e45964e9b67c792105ec74d26`
- Package version: 2.2.1
- License: MIT, Copyright (c) 2024 Sat Naing. See the unchanged root LICENSE.

The template's application source and build configuration were copied into this repository. This is an attributed derivative repository, not a GitHub fork. The layout, shadcn UI components, theme, settings and original examples are real upstream code. The upstream Git history, GitHub workflows and editor-specific configuration were not imported.

## Adaptation scope

New source: `src/features/restaurant/`, `src/routes/_authenticated/restaurant/`, and the browser-model checks under `tests/restaurant.test.mjs`.

Modified frontend source: the home route, sidebar data, displayed avatar initials and page metadata. The generated TanStack route tree includes the new route. Project naming, documentation, ignore rules and private static hosting metadata were adjusted. No replacement design system was introduced.

Original `src/main.tsx`, authentication examples, auth store, Axios/error handling and existing example services remain unchanged. The original template does not provide a restaurant invoice, inventory, OCR or ERP backend.

On November 16, a project-specific Node backend (`server/`), connected screens (`connected.tsx`, `api.ts`), one-command development startup and integration tests were added. These are new project code, not upstream backend interfaces. The service uses the original project PostgreSQL schema with migration 007. It defaults to persistent local PGlite; a server-only `pg` adapter can connect to PostgreSQL/Supabase after configuration. This update did not connect to or migrate the hosted Supabase project. The Vite config adds a same-origin `/api` development proxy. Original authentication examples are still examples and do not secure this local API.

On November 9, at the user's request, a separate database schema supplement was added under `database/`: invoice headers, invoice lines and review events, with duplicate-approval and receipt-link constraints. This SQL is our project-specific schema work, not code from shadcn-admin. It does not change the original template's interfaces or implement OCR, file upload, automatic review auditing or an API.

Restaurant calculations in `data.ts` are browser-only demonstrations built for these pages. They are not upstream server interfaces. Original example routes are retained for reference and do not represent implemented restaurant features.

## Other references (not copied source)

- ERPNext purchase-receipt workflow: https://docs.frappe.io/erpnext/purchase-receipt
- ERPNext purchase-invoice workflow: https://docs.frappe.io/erpnext/purchase-invoice
- Tabler was considered as an alternative UI template: https://github.com/tabler/tabler

No ERPNext or Tabler source code is included. Their links are references only; the actual frontend base is shadcn-admin.
