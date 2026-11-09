# Development database

These SQL files are separate from the Vite frontend. The frontend never executes them or connects to the database. All example business data is fictional.

## Changes on November 9, 2026

The existing 12-table database covers locations, supplier items, recipes, receiving, daily sales and the inventory ledger. Its main gap for the invoice screens was invoice storage. Migration `005_invoice_schema.sql` adds:

- `invoices`: supplier, location, invoice number/date/amount, document metadata, review status and optional receipt reference.
- `invoice_lines`: product descriptions, quantities, prices and optional ingredient mapping.
- `invoice_review_events`: records for future manual-review actions and notes.
- A unique constraint for approved supplier invoice numbers, plus matching-brand/supplier/location checks when linking a receipt.

Original receipts, sales, inventory balances and posting functions are preserved. All 15 tables have RLS enabled. API access remains disabled; this is still an owner-operated development schema. Making the GitHub source public does not make the database public.

## SQL execution order

For a **new** empty development database, run `001_schema.sql`, optionally `002_demo.sql`, then `005_invoice_schema.sql`. Scripts 003 and 004 verify the original fictional baseline; 006 verifies the supplement against that baseline.

For the **existing initialized** development project, run only `005_invoice_schema.sql` once, then `006_verify_invoice_schema.sql`. Do not rerun 001, 002 or 005 after they have been applied.

## Validation

Migration 005 was applied to the existing Supabase development project on November 9, 2026. All nine checks in 006 passed there: 15 tables, RLS on all tables, duplicate approval protection, unchanged API access restrictions, and unchanged original inventory balances. No invoice test records were inserted into the hosted database.

The supplement is checked locally with PGlite 0.5.14. The test starts an isolated in-memory database and does not use cloud credentials:

```sh
node tests/invoice-schema.test.mjs /absolute/path/to/pglite/dist/index.js
```

Nine checks cover required approval fields, receipt matching, cross-brand constraints, line validation, duplicate approval, review events, unchanged inventory and denied API access. Run `006_verify_invoice_schema.sql` in Supabase for read-only hosted verification.

## Remaining integration work

The schema does not implement OCR, document storage uploads, authenticated reviewer identity, automatic audit-event writing, invoice/line total reconciliation or an approval API. Application-level review transactions and authorization policies remain future work. Credit notes, tax/discount calculation, line-level receiving reconciliation and inventory par settings also remain outside this supplement. No frontend authentication examples were changed.
