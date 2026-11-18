# Basic invoice extraction

Uploads now trigger `POST /api/invoices/:id/extract` automatically. The server uses a local child process to read searchable PDF text with [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) or recognize raster images with [Tesseract.js](https://github.com/naptha/tesseract.js). Scanned PDF pages are rendered before recognition, as described in the [Tesseract PDF FAQ](https://github.com/naptha/tesseract.js/blob/master/docs/faq.md). The English model ships as an npm dependency; no OCR API key or runtime model download is required. The Tesseract donation-only postinstall is explicitly disabled.

## Human review workflow

1. Upload a PDF, PNG, JPEG or WebP. The original file and empty database draft are saved first.
2. Extraction runs automatically; the interface shows progress. A successful result fills the unsaved form and displays warnings and expandable extracted text.
3. Check vendor, invoice number/date, tax, shipping, discount, total and item rows. Match each row to a supplier pack. Exact known supplier names and unique supplier SKUs may be preselected; names that merely look similar are not used for stock mapping.
4. Click **Save details** to write checked fields into the database. Reopening a saved invoice uses the human-edited values, not the original extraction suggestions. Approved records remain locked.
5. Approve after verification; confirm actual delivery separately to update stock. Approval now requires mapped packs so an invoice cannot become locked before its receiving information is complete.

The extraction endpoint never approves, posts inventory, creates suppliers or changes invoice fields. It validates the current revision before and after recognition. Extraction JSON/text is stored beside the local original as `*.ocr.json`, and is served only after looking up the brand-scoped invoice. No schema migration is needed. The original and extraction metadata are local even when invoice records use Supabase; back up the entire `.pantry` directory.

## Supported scope and fallback

- English printed invoices, USD, standard rows in Description / Qty / Unit Price / Amount order, or Qty / Description / Unit Price / Amount with a recognized header.
- US date conventions or ISO dates; explicit invoice-number/date/total labels. `Amount due` is not assumed to equal the invoice total. Missing or conflicting fields are left for review.
- Amount rows must reconcile quantity × price before being suggested. Missing taxes/fees stay at the existing form default of zero with a warning. Always check omissions against the original.
- Maximum 10 MB upload, 5 PDF pages, 12 million rendered pixels per page/image, 100 recognized lines, 30,000 characters and 90 seconds. One extraction job at a time. Exceeding a limit produces a manual-entry message; pages are not silently dropped.
- Poor photos, rotated pages, handwriting, unusual columns, merged cells, multi-page carry-forward totals and non-English invoices may require manual entry. Text-bearing PDFs use their text layer when suitable; text-layer errors can affect extraction. This is a rules-based prototype, not a general invoice understanding model.
- Failed/busy recognition leaves the original and editable draft intact. Retry using **Extract invoice details** before making edits, or fill the form manually. A saved draft is not automatically rescanned.
- The feature runs in the connected local app (`pnpm dev` / `start-dev.cmd`), not the separate static Sites browser demo.

## Files and validation

- `server/ocr-worker.mjs`: PDF text/rendering, image decoding and Tesseract recognition.
- `server/ocr.mjs`: isolated process, timeout, concurrency bound and parsing.
- `server/invoice-extraction.mjs`: conservative field/row extraction and catalog matching.
- `server/http.mjs`: extraction route and local metadata persistence.
- `src/features/restaurant/extraction-form.ts`: suggestions applied only to untouched drafts.
- `src/features/restaurant/connected.tsx`: automatic scan, progress, form filling and review warnings.

Run `pnpm test:ocr`, `pnpm test:ocr-form`, `pnpm test:backend` and `pnpm build`. The OCR suite uses real Tesseract on generated invoice images and scanned PDFs, PDF text extraction, unsupported input/limits, and HTTP upload → extraction → human correction → approval → repeated receiving in an isolated database. The form tests cover saved-edit preservation and manual fallback. Demo documents in `examples/invoices` are fictional and can be regenerated with `pnpm demo:invoices`.

**Scott update:** I added basic local OCR and PDF extraction. After upload, recognized fields populate a draft form for human verification. Checked values are saved to Supabase through the backend, and approval and physical receiving remain separate. It supports basic English invoices; I would like sample supplier invoices to improve parsing coverage.

**中文：** 已加入基础本地 OCR 和 PDF 提取，上传后自动填写待核对表单。人工确认后的信息通过后端保存到 Supabase，审核和实际收货继续分开。目前优先支持基础英文发票，需要供应商样本来扩展识别格式。
