# Development database

These SQL files define the schema used by the Node invoice backend. The browser calls `/api`; it never executes SQL or receives database credentials. All example business data is fictional.

## Changes on November 16, 2026

Migration `007_invoice_workflow.sql` adds optimistic revision checks, tax/shipping/discount amounts, invoice supplier-pack references and pack-size snapshots. It prevents a second approved identical document, prevents linking one receipt to multiple invoices, locks reviewed invoice headers/lines, and makes review events append-only. No browser-role grants were added. The original receipt posting function and inventory ledger are reused unchanged.

The local backend automatically creates a persistent PGlite database and applies 001, 002, 005 and 007. It provides upload/manual entry, save, review, full receiving and workspace APIs. Migration 007 was verified locally; **it has not been applied to hosted Supabase in this update**. Remote database startup only checks required columns and never runs migrations or seed scripts.

## Changes on November 9, 2026

The existing 12-table database covers locations, supplier items, recipes, receiving, daily sales and the inventory ledger. Its main gap for the invoice screens was invoice storage. Migration `005_invoice_schema.sql` adds:

- `invoices`: supplier, location, invoice number/date/amount, document metadata, review status and optional receipt reference.
- `invoice_lines`: product descriptions, quantities, prices and optional ingredient mapping.
- `invoice_review_events`: records for future manual-review actions and notes.
- A unique constraint for approved supplier invoice numbers, plus matching-brand/supplier/location checks when linking a receipt.

Original receipts, sales, inventory balances and posting functions are preserved. All 15 tables have RLS enabled. API access remains disabled; this is still an owner-operated development schema. Making the GitHub source public does not make the database public.

## SQL execution order

For a **new** empty remote development database, run `001_schema.sql`, optionally `002_demo.sql`, then `005_invoice_schema.sql` and `007_invoice_workflow.sql`. Scripts 003/004 verify the original fictional baseline; 006 verifies the November 9 supplement against that baseline. Baseline balance checks are not valid after normal receiving activity.

For the existing Supabase development project, 001, 002 and 005 were already applied. Review existing duplicate document hashes and receipt links before applying **only 007 once**. Do not rerun 001, 002 or 005. Migration 007 is transactional; existing duplicate approved hashes/receipt links must be resolved through an agreed data review before its unique indexes can be created.

## Validation

Migration 005 was applied to the existing Supabase development project on November 9, 2026. All nine checks in 006 passed there: 15 tables, RLS on all tables, duplicate approval protection, unchanged API access restrictions, and unchanged original inventory balances. No invoice test records were inserted into the hosted database.

The supplement is checked locally with PGlite 0.5.14. The test starts an isolated in-memory database and does not use cloud credentials:

```sh
node tests/invoice-schema.test.mjs
pnpm test:backend
```

Nine checks cover required approval fields, receipt matching, cross-brand constraints, line validation, duplicate approval, review events, unchanged inventory and denied API access. Run `006_verify_invoice_schema.sql` in Supabase for read-only hosted verification.

## Remaining scope

OCR, authenticated reviewer identity, customer-facing authorization policies, remote file storage, partial receiving, corrections/credit notes, existing-receipt matching and inventory par settings remain future work. Tax/shipping/discount values are manually entered, not calculated from tax rules. Current application transactions write review events and validate totals. They are designed for a trusted single operator on localhost, not an exposed production API. No original template authentication examples were changed.
