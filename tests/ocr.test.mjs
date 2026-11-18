import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDatabase } from '../server/database.mjs'
import { createHandler } from '../server/http.mjs'
import { parseInvoiceText } from '../server/invoice-extraction.mjs'
import { extractInvoice } from '../server/ocr.mjs'
import {
  invoiceText,
  invoiceImage,
  invoicePdf,
} from './helpers/invoice-fixtures.mjs'

const L = '20000000-0000-0000-0000-000000000001'
const V = '30000000-0000-0000-0000-000000000001'
const P = '50000000-0000-0000-0000-000000000001'
const catalog = {
  suppliers: [{ id: V, name: 'Demo Food Supply' }],
  supplier_items: [{ id: P, supplier_id: V, supplier_sku: 'RICE-1KG' }],
}
test('parser extracts labeled amounts, dates and rows without inventing mappings', () => {
  const r = parseInvoiceText(invoiceText, catalog)
  assert.equal(r.fields.invoice_number, 'OCR-DEMO-001')
  assert.equal(r.fields.invoice_date, '2026-11-18')
  assert.equal(r.fields.supplier_id, V)
  assert.equal(r.fields.total_amount, 17)
  assert.equal(r.fields.lines.length, 2)
  assert.equal(r.fields.lines[0].supplier_item_id, P)
  assert.equal(r.fields.lines[1].supplier_item_id, null)
  assert.equal(
    parseInvoiceText(invoiceText.replace('Total: 17.00', 'Amount Due: 17.00'))
      .fields.total_amount,
    null
  )
  assert.equal(
    parseInvoiceText(invoiceText.replace('2026-11-18', '2026-02-30')).fields
      .invoice_date,
    null
  )
  assert.equal(
    parseInvoiceText(invoiceText.replace('USD', 'EUR')).fields.total_amount,
    null
  )
  assert.equal(
    parseInvoiceText(
      invoiceText.replace('3.50        7.00', '3.50        9.00')
    ).fields.lines.length,
    1
  )
  assert.equal(
    parseInvoiceText(invoiceText + '\nTotal: 200.00').fields.total_amount,
    null
  )
  assert.equal(
    parseInvoiceText(
      'Vendor: New Supplier\nDate: 11/18/2026\nInvoice #: A-32',
      catalog
    ).fields.supplier_id,
    null
  )
})

test(
  'real OCR handles images, searchable PDF and scan PDF; failures preserve manual fallback',
  { timeout: 180000 },
  async (t) => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pantry-ocr-test-'))
    try {
      for (const [name, bytes, method] of [
        ['invoice.png', invoiceImage(), 'ocr'],
        ['invoice.pdf', invoicePdf(), 'pdf-text'],
        ['scan.pdf', invoicePdf({ scan: true }), 'ocr'],
      ])
        await t.test(name, async () => {
          const filename = path.join(dir, name)
          await writeFile(filename, bytes)
          const result = await extractInvoice(filename, catalog)
          assert.equal(result.status, 'complete', JSON.stringify(result))
          assert.equal(result.method, method)
          assert.equal(
            result.fields.invoice_number,
            'OCR-DEMO-001',
            result.text
          )
          assert.equal(result.fields.invoice_date, '2026-11-18', result.text)
          assert.equal(result.fields.total_amount, 17, result.text)
          assert.equal(result.fields.lines.length, 2, result.text)
        })
      await t.test(
        'page limit, malformed input and bounded worker timeout',
        async () => {
          const filename = path.join(dir, 'long.pdf')
          await writeFile(filename, invoicePdf({ pages: 6 }))
          assert.match(
            (await extractInvoice(filename, catalog)).warnings[0],
            /5 PDF pages/
          )
          await writeFile(filename, Buffer.from('%PDF-invalid'))
          assert.equal(
            (await extractInvoice(filename, catalog)).status,
            'failed'
          )
          assert.match(
            (await extractInvoice(filename, catalog, { timeoutMs: 1 }))
              .warnings[0],
            /timed out/
          )
        }
      )
    } finally {
      assert.ok(
        path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep) &&
          path.basename(dir).startsWith('pantry-ocr-test-')
      )
      await rm(dir, { recursive: true, force: true })
    }
  }
)

test(
  'HTTP upload -> real extraction -> human correction -> approval -> single receipt',
  { timeout: 120000 },
  async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'pantry-ocr-test-')),
      db = await openDatabase()
    let server
    try {
      server = createServer(createHandler(db, { uploadDirectory: dir }))
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const base = `http://127.0.0.1:${server.address().port}/api`
      const call = async (url, method = 'GET', payload) => {
        const multipart = payload instanceof FormData
        const r = await fetch(base + url, {
          method,
          headers: {
            'x-pantry-request': '1',
            ...(!multipart && payload
              ? { 'content-type': 'application/json' }
              : {}),
          },
          body: payload
            ? multipart
              ? payload
              : JSON.stringify(payload)
            : undefined,
        })
        return { status: r.status, body: await r.json() }
      }
      const form = new FormData()
      form.set('location_id', L)
      form.set(
        'file',
        new Blob([invoiceImage()], { type: 'image/png' }),
        'ocr-test.png'
      )
      const uploaded = await call('/invoices', 'POST', form)
      assert.equal(uploaded.status, 201)
      const url = `/invoices/${uploaded.body.id}`
      let d = (await call(url + '/extract', 'POST', { revision: 1 })).body
      assert.equal(d.extraction.status, 'complete')
      assert.equal(d.extraction.fields.total_amount, 17)
      assert.equal(d.total_amount, null) // No automatic save/approval/stock posting.
      assert.equal(d.status, 'needs_review')
      assert.equal(d.revision, 1)
      assert.equal((await call(url)).body.extraction.text, d.extraction.text)
      const corrected = {
        ...d.extraction.fields,
        revision: 1,
        location_id: L,
        review_note: 'Human verified',
        invoice_number: 'HUMAN-CORRECTED',
      }
      d = (await call(url, 'PUT', corrected)).body
      assert.equal(d.invoice_number, 'HUMAN-CORRECTED')
      assert.equal(d.extraction.fields.invoice_number, 'OCR-DEMO-001') // Original suggestions remain separate.
      assert.equal(
        (await call(url + '/extract', 'POST', { revision: 1 })).status,
        409
      )
      d = (
        await call(url + '/review', 'POST', {
          revision: d.revision,
          action: 'approved',
          note: 'Checked original',
        })
      ).body
      assert.equal(d.status, 'approved')
      assert.equal(d.receipt_id, null)
      assert.equal(
        (await call(url + '/extract', 'POST', { revision: d.revision })).status,
        409
      )
      const receive = { confirmed: true, received_on: '2026-11-18' }
      const once = await call(url + '/receive', 'POST', receive),
        twice = await call(url + '/receive', 'POST', receive)
      assert.equal(once.status, 200)
      assert.equal(once.body.receipt_id, twice.body.receipt_id)
      assert.equal(
        Number(
          (
            await db.query(
              "SELECT quantity_on_hand FROM restaurant.inventory_on_hand WHERE location_id=$1 AND ingredient_name='Rice'",
              [L]
            )
          ).rows[0].quantity_on_hand
        ),
        9000
      )
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve))
      await db.close()
      assert.ok(
        path.resolve(dir).startsWith(path.resolve(tmpdir()) + path.sep) &&
          path.basename(dir).startsWith('pantry-ocr-test-')
      )
      await rm(dir, { recursive: true, force: true })
    }
  }
)
