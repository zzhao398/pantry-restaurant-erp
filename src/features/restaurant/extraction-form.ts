import { toForm, type InvoiceDetail, type InvoiceForm } from './api'

// Reopening a saved/reviewed invoice must never overwrite human corrections.
export function extractionForm(detail: InvoiceDetail): InvoiceForm {
  const form = toForm(detail)
  const fields = detail.extraction?.fields
  if (detail.status !== 'needs_review' || detail.revision !== 1 || !fields)
    return form
  return {
    ...form,
    supplier_id: fields.supplier_id,
    invoice_number: fields.invoice_number,
    invoice_date: fields.invoice_date,
    total_amount: fields.total_amount,
    tax_amount: fields.tax_amount ?? form.tax_amount,
    shipping_amount: fields.shipping_amount ?? form.shipping_amount,
    discount_amount: fields.discount_amount ?? form.discount_amount,
    lines: fields.lines,
  }
}
