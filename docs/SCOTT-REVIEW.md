# Project 1: basic workflow review

Repository: https://github.com/zzhao398/pantry-restaurant-erp

## Short update

**English:** I have connected the shadcn-admin-based frontend to a basic local backend using our PostgreSQL schema. The current workflow supports document upload, manual invoice entry, line-item review, duplicate checks, approval or rejection, and a separate full-delivery confirmation that updates inventory once. Records persist after restarting. OCR, staff authentication and hosted Supabase integration are not completed yet. I would like to confirm the business rules before extending the workflow.

**中文：** 我已经把基于 shadcn-admin 的前端连接到了基础本地后端，沿用我们现有的 PostgreSQL 数据库结构。目前支持上传文件、手工录入发票、明细审核、重复检查、通过或拒绝审核，并在单独确认整批到货后一次性更新库存。重启后记录仍然保留。OCR、员工身份认证和线上 Supabase 接入尚未完成，希望先确认业务规则再扩展。

## Five-minute demo

1. Run `start-dev.cmd` and open http://127.0.0.1:5173/.
2. Upload an example PDF/image, or select **Manual invoice**. Use fictional information only.
3. Choose Manhattan demo and Demo Food Supply. Enter a unique invoice number and date. Set total USD 7.00.
4. Add Rice / 1 kg bag, quantity 2, unit price 3.50. Save and approve. Explain that approval does not receive stock.
5. Confirm the full delivery. Show Receiving and Inventory: Manhattan rice increases by 2,000 g exactly once.
6. Reopen the invoice to show its locked details, receipt link and review history. Demonstrate a mismatched total or duplicate invoice number being blocked. Refresh/restart to show persistence.

The browser QA performed on November 16 left fictional local invoice `SCOTT-DEMO-001` approved and received. It changed local Manhattan rice from 7,000 g to 9,000 g. That QA record is not part of the GitHub seed and was not sent to Supabase.

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

Revision numbers prevent competing edits from overwriting each other. Tax/shipping/discount amounts support total checks. Supplier-pack references and size snapshots connect invoice lines to receiving. Reviewed invoices/lines are locked, review events are append-only, and unique indexes block duplicate approved files and receipt links. The original receipt/inventory tables and posting function are reused. Migration 007 is included and locally tested; it has not been applied to the hosted Supabase database in this update.
