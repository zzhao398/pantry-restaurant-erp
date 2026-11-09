# Pantry — Restaurant Operations

Project 1 frontend prototype for Zhenhan Zhao. A restaurant workspace for invoice
review, receiving, inventory, daily sales, recipes, suppliers and purchasing reports.

## Run

Requires Node.js 22.13+ (Node 24 recommended) and pnpm 11.25.

```sh
pnpm install
pnpm dev
pnpm build
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/restaurant.test.mjs
```

## Try the demo

1. Start in Manhattan: Jasmine rice is 7 kg and chicken breast is 3 kg.
2. Receive stock: add 1 pack of rice, 1000 g per pack, then post the receipt.
3. Inventory now shows 8 kg rice. Its history includes the new receipt.
4. Record 2 servings of Chicken rice bowl, preview use, then post sales.
5. Rice becomes 7.7 kg and chicken 2.8 kg; Queens still has 4 kg rice.
6. Upload an image/PDF invoice and enter its fields, or review a sample invoice.
   Approval never adds stock. A duplicate supplier/number is blocked.
7. Refresh: business records remain in this browser. Use Settings to reset.

The interface is English for Scott's review. All restaurant and supplier data is
fictional. The sample week is November 3–9, 2026. New forms default to that sample
date and accept another date. This is not a live restaurant system.

## Scope and storage

- Custom React + TypeScript interface using the supplied Vinext/Sites starter.
- Responsive navigation, searchable/filterable tables, accessible dialogs.
- Receiving and sales drafts, posting, inventory history, recipe editing.
- Local file previews and manual invoice-header review, duplicate number check.
- Inventory and purchasing CSV downloads; overview figures derive from records.
- Local browser storage only. File previews are session-only object URLs.
- No OCR, Supabase API, POS, user roles, payment, or real backend implementation.
- No real database migration or SQL permissions were changed.

The existing database reference is in `database/`. The demo follows its concepts
but is not a generated database client: IDs, nested lines and additional display
fields need an adapter. Read [backend handoff](docs/BACKEND-HANDOFF.txt) before
connecting the UI. Never place a Supabase service-role key in frontend code.

## Code

- `app/page.tsx`: workspace, pages, file preview and invoice review.
- `components/transaction-form.tsx`: receiving/sales forms and previews.
- `lib/restaurant.ts`: typed demo model, seed data, pure posting functions.
- `app/globals.css`: responsive visual design.
- `tests/restaurant.test.mjs`: nine inventory/approval regression checks.
- `docs/BACKEND-HANDOFF.txt`: schema mapping, additions and proposed contracts.

## Research and attribution

Reviewed [ERPNext purchase receipts](https://docs.frappe.io/erpnext/purchase-receipt)
and [purchase invoices](https://docs.frappe.io/erpnext/purchase-invoice) as workflow
references. Reviewed [Tabler](https://github.com/tabler/tabler), an MIT dashboard
UI kit, as a layout/component reference. No source from these projects was copied
or forked. Dependencies retain their own licenses; starter vendor notices remain.

## Verification

TypeScript and production build pass. Nine business-rule tests pass. Browser QA
covered receiving +1 kg, sales -300 g rice/-200 g chicken, refresh persistence,
Queens isolation, invoice approval, duplicate rejection, 390px mobile navigation
and demo reset. File upload and CSV download still need a full manual acceptance
check with representative client documents; no actual OCR results are claimed.

中文：这版是可操作的纯前端演示。进入收货页面加库存，录入销量按配方扣减，
发票可预览并手工审核。已有数据库保持原样，后续需要补充的字段与接口都在
docs/BACKEND-HANDOFF.txt。不要把演示用本地存储当成真实业务存储。
