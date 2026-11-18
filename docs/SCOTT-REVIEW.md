# Project 1: basic workflow review

Repository: https://github.com/zzhao398/pantry-restaurant-erp

## Open and run for the meeting

In VS Code, open this project folder and press **Ctrl+Shift+B** to run **Pantry: Start configured database (.env)**. Or run this in its terminal:

```powershell
.\start-dev.cmd
```

Open http://127.0.0.1:5173/restaurant/invoices. Keep the terminal running. Stop an existing instance with Ctrl+C before starting another; both modes use ports 5173 and 3001.

**中文：** 在 VS Code 打开项目后，按 Ctrl+Shift+B 启动演示；也可在终端执行上面的命令。本机配置现在连接 Supabase，页面顶部应显示 **PostgreSQL connected**。前端和 API 在本机运行，数据库记录保存在云端。`start-dev.cmd --local` 是独立的本机数据库模式，记录不会自动同步。

**Verified status, November 18:** the Edge browser -> local API -> Supabase workflow passed. A fictional PDF was uploaded, saved, approved and received through the interface. Direct cloud queries confirmed each stage. Approval left rice at 7,000 g; receiving added 2,000 g once. A repeated receipt request and a server restart retained 9,000 g, one receipt movement and four review events. The downloaded original matched the uploaded file byte for byte. See [cloud verification](CLOUD-VERIFICATION.md).

**演示开场：** “This is the first working version of the manual invoice workflow. The interface connects through a local backend to Supabase. I’ve verified upload, review, receiving, duplicate-receipt prevention and persistence after a restart.”

**中文：** “这是人工发票处理流程的第一个可运行版本。页面通过本机后端连接 Supabase，已经验证上传、审核、收货、防重复入库，以及重启后的数据保留。”

## Short update

**English:** I have connected the shadcn-admin-based frontend to a basic backend and our Supabase database. I added basic local OCR and PDF extraction: uploading an invoice fills a draft form for human verification. Users check and save the details, approve or reject the invoice, and confirm actual delivery separately to update inventory once. The system checks totals and duplicates. OCR currently supports basic English invoice layouts; staff authentication, cloud document storage and production backend hosting remain pending. I would like sample supplier invoices and confirmation of the business rules before extending the workflow.

**中文：** 我已经把基于 shadcn-admin 的前端连接到基础后端和 Supabase，并加入基础本地 OCR 和 PDF 提取。上传后自动填写待核对表单，人工检查并保存后进行审核，实际到货再单独确认入库。系统会核对金额和检查重复。OCR 目前支持基础英文发票，员工认证、云端文件存储和正式部署尚未完成，希望获取供应商样本并确认业务规则。

## Five-minute demo

1. Run `start-dev.cmd` and open http://127.0.0.1:5173/. Check the **PostgreSQL connected** badge.
2. Choose Manhattan demo and upload `examples/invoices/ocr-demo-scan.pdf` or `ocr-demo.png`. Wait for the extracted form and expand **Show extracted text**.
3. Verify Demo Food Supply, invoice date, two rice bags at 3.50, one chicken pack at 8.00, tax 1.00, shipping 2.00, discount 1.00, total USD 17.00. Use a unique invoice number for repeated demos.
4. Check supplier-pack matches, correct any field, save and approve. Explain that OCR suggestions require human review and approval does not receive stock.
5. Confirm the full delivery. Show Receiving and Inventory: Manhattan rice increases by 2,000 g and chicken by 1,000 g exactly once.
6. Reopen the invoice to show its locked details, receipt link and review history. Demonstrate a mismatched total or duplicate invoice number being blocked. Refresh/restart to show persistence.

The browser QA performed on November 16 left fictional local invoice `SCOTT-DEMO-001` approved and received. It changed local Manhattan rice from 7,000 g to 9,000 g. That QA record is not part of the GitHub seed and was not sent to Supabase.

The November 18 cloud demonstration retained the separate fictional invoice `TEST-CLOUD-20261116-01` in Supabase. Its source PDF is dated November 16; receiving was confirmed on November 18. Cloud Manhattan rice is now 9,000 g. A new demo receipt will increase this balance again, so record the starting balance before demonstrating.

## Questions to confirm

| English                                                                                       | 中文                                               |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Should invoice approval and physical receiving always be separate steps?                      | 发票审核和实际收货是否始终分成两个步骤？           |
| Do we need partial deliveries, backorders, and matching invoices to receipts already entered? | 是否需要部分到货、欠货，以及匹配已经录入的收货单？ |
| Which invoice fields and sample supplier documents should we support first?                   | 第一阶段优先支持哪些字段和哪些供应商的样本发票？   |
| Should duplicate invoice numbers be checked across all locations for the same supplier?       | 同一供应商的重复发票号是否应该跨所有门店检查？     |
| How should taxes, freight, discounts, credit notes and corrections be handled?                | 税费、运费、折扣、贷项通知和更正应该如何处理？     |
| Who may upload, approve and receive, and where should the shared backend be hosted?           | 谁可以上传、审核和收货？共享后端应该部署在哪里？   |

## Database additions in this version

Revision numbers prevent competing edits from overwriting each other. Tax/shipping/discount amounts support total checks. Supplier-pack references and size snapshots connect invoice lines to receiving. Reviewed invoices/lines are locked, review events are append-only, and unique indexes block duplicate approved files and receipt links. The original receipt/inventory tables and posting function are reused. Migration 007 was applied to the development Supabase database on November 16 and passed the cloud SQL checks. The full application-to-cloud integration test also passed on November 18.
