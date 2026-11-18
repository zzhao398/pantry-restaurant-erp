import { expect, test } from 'vitest'
import type { InvoiceDetail } from './api'
import { extractionForm } from './extraction-form'

const invoice: InvoiceDetail = {
  id: 'invoice',
  location_id: 'location',
  supplier_id: null,
  receipt_id: null,
  invoice_number: null,
  invoice_date: null,
  total_amount: null,
  tax_amount: '0',
  shipping_amount: '0',
  discount_amount: '0',
  status: 'needs_review',
  revision: 1,
  original_file_name: 'invoice.pdf',
  review_note: null,
  reviewed_by: null,
  reviewed_at: null,
  lines: [],
  events: [],
  possible_duplicates: [],
  extraction: {
    status: 'complete',
    method: 'ocr',
    text: 'Invoice Number: SCAN-1',
    vendor: '',
    warnings: [],
    fields: {
      supplier_id: 'supplier',
      invoice_number: 'SCAN-1',
      invoice_date: '2026-11-18',
      total_amount: 7,
      tax_amount: null,
      shipping_amount: 0,
      discount_amount: 0,
      lines: [
        {
          description: 'Rice',
          supplier_item_id: null,
          quantity: 2,
          unit_price: 3.5,
        },
      ],
    },
  },
}
test('new upload fills the editable form without modifying the database record', () => {
  expect(extractionForm(invoice).invoice_number).toBe('SCAN-1')
  expect(extractionForm(invoice).tax_amount).toBe(0)
  expect(extractionForm(invoice).lines[0].quantity).toBe(2)
  expect(invoice.invoice_number).toBeNull()
})
test('reopening saved corrections never reapplies extraction suggestions', () => {
  expect(
    extractionForm({
      ...invoice,
      revision: 2,
      invoice_number: 'HUMAN-2',
      total_amount: '10',
    })
  ).toMatchObject({ invoice_number: 'HUMAN-2', total_amount: 10, lines: [] })
  expect(
    extractionForm({
      ...invoice,
      status: 'approved',
      invoice_number: 'APPROVED',
    }).invoice_number
  ).toBe('APPROVED')
})
test('OCR failure retains a usable manual-entry form', () => {
  expect(
    extractionForm({
      ...invoice,
      extraction: { ...invoice.extraction!, status: 'failed', fields: null },
    })
  ).toMatchObject({ invoice_number: '', lines: [], total_amount: null })
})
