# Supabase workflow verification - November 18, 2026

The working path is **Edge -> Vite /api proxy -> local Node backend -> Supabase PostgreSQL**. The API and uploaded PDF storage run on this computer. This is a development workflow, not a hosted production application.

## Verified results

| Step | Observed result |
| --- | --- |
| Connection | Session pooler, TLS verified; API reports `postgres`; page shows `PostgreSQL connected`. |
| Upload and save | Fictional PDF and one rice line saved; cloud invoice status `needs_review`, revision 2, two review events. |
| Approval | Status `approved`, revision 3, three events; Manhattan rice remains 7,000 g; no receipt or inventory movement yet. |
| Full receiving | One linked receipt and one +2,000 g movement; Manhattan rice becomes 9,000 g; revision 4 and four events. |
| Repeated receiving request | HTTP 200 returns the existing receipt; revision, events and inventory remain unchanged. |
| Original download | Downloaded bytes and stored document hash match the original PDF. |
| Restart | New backend process reconnects to Supabase; same invoice, receipt, inventory and original download remain available. |

Each stage was independently read through a PostgreSQL connection, in addition to the browser actions and same-origin API checks.

## Retained fictional record

- Invoice: `TEST-CLOUD-20261116-01`, USD 8.00.
- Source invoice date: November 16; receiving date: November 18.
- Invoice ID: `2bde490d-8b47-4918-a0f6-9e44ecc33f11`.
- Receipt ID: `0b4065ab-1390-45ac-a14a-995b51f31181`.
- Two 1 kg rice bags at USD 3.50; tax 1.00 + shipping 1.00 - discount 1.00.
- This clearly marked test record remains in the development database for the Scott demo. It is not part of the GitHub seed. It is separate from the earlier local `SCOTT-DEMO-001` record.

## Run and demonstrate

Open the project folder in VS Code and press **Ctrl+Shift+B**, or run:

```powershell
.\start-dev.cmd
```

Open http://127.0.0.1:5173/restaurant/invoices in Edge. Do not start a second server while ports 3001/5173 are in use. The manual local-only alternative is `start-dev.cmd --local`.

**给 Scott 的一句话：** “The frontend now connects to Supabase through the backend. I verified the full manual invoice-to-inventory workflow, including preventing duplicate receiving and retaining data after a restart.”

**中文：** 前端现在通过后端连接 Supabase。已经验证完整的人工发票到库存流程，包括防止重复入库和重启后的数据保留。

Real staff authentication, partial deliveries, correction workflows, cloud document storage and production backend hosting remain future work. The existing private static Site still uses its separate browser demo.

## Basic OCR follow-up — November 18

Basic local English OCR and PDF extraction have now been added. A fictional image-only PDF was uploaded through the HTTP API to the configured Supabase development workflow. It produced two item suggestions and a USD 17.00 total. In Edge, opening the draft visibly filled supplier, invoice number/date, amounts and both supplier-pack mappings. The invoice number was manually changed to `OCR-CLOUD-20261118-01`, saved through the interface and reloaded without losing that change. Direct PostgreSQL queries confirmed revision 2, two saved lines, `needs_review`, no receipt, and unchanged stock (rice 9,000 g; chicken 3,000 g).

The browser's automated file chooser did not complete, so file upload itself was verified through the same multipart API used by the page. Form filling, manual correction, saving and reloading were verified in Edge. OCR-to-approval-to-receiving and duplicate-receiving protection were tested in an isolated local database. The retained cloud OCR draft is deliberately left for human review. See [OCR.md](OCR.md) for scope and implementation.
