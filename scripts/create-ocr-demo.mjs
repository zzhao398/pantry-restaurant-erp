import { mkdir, writeFile } from 'node:fs/promises'
import { invoiceImage, invoicePdf } from '../tests/helpers/invoice-fixtures.mjs'

await mkdir('examples/invoices', { recursive: true })
await writeFile('examples/invoices/ocr-demo.png', invoiceImage())
await writeFile(
  'examples/invoices/ocr-demo-scan.pdf',
  invoicePdf({ scan: true })
)
await writeFile('examples/invoices/ocr-demo-text.pdf', invoicePdf())
console.log('Created three fictional OCR demo invoices in examples/invoices/.')
