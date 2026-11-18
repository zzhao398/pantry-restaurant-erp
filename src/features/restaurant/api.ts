export type Ref = { id: string; name: string }
export type SupplierItem = {
  id: string
  supplier_id: string
  ingredient_id: string
  supplier_sku: string
  pack_label: string
  quantity_per_pack_base: string
}
export type InvoiceRecord = {
  id: string
  location_id: string
  supplier_id: string | null
  receipt_id: string | null
  invoice_number: string | null
  invoice_date: string | null
  total_amount: string | null
  tax_amount: string
  shipping_amount: string
  discount_amount: string
  status: 'needs_review' | 'approved' | 'rejected' | 'duplicate'
  revision: number
  original_file_name: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
}
export type InvoiceDetail = InvoiceRecord & {
  extraction?: InvoiceExtraction
  lines: {
    id: string
    description: string
    supplier_item_id: string | null
    quantity: string
    unit_price: string
    line_total: string
    unit_label: string | null
  }[]
  events: {
    id: string
    action: string
    reviewer_label: string
    note: string
    created_at: string
  }[]
  possible_duplicates: Pick<
    InvoiceRecord,
    'id' | 'invoice_number' | 'status' | 'original_file_name'
  >[]
}
export type InvoiceExtraction = {
  status: 'complete' | 'failed'
  method: string | null
  text: string
  vendor: string
  warnings: string[]
  fields: {
    supplier_id: string | null
    invoice_number: string
    invoice_date: string | null
    total_amount: number | null
    tax_amount: number | null
    shipping_amount: number | null
    discount_amount: number | null
    lines: InvoiceForm['lines']
  } | null
}
export type Workspace = {
  mode: string
  reviewer: string
  locations: Ref[]
  suppliers: (Ref & { contact_email: string | null })[]
  ingredients: (Ref & { base_unit: string })[]
  supplier_items: SupplierItem[]
  invoices: InvoiceRecord[]
  purchase_receipts: {
    id: string
    location_id: string
    supplier_id: string
    source_reference: string
    received_on: string
    status: string
  }[]
  inventory_on_hand: {
    location_id: string
    location_name: string
    ingredient_id: string
    ingredient_name: string
    base_unit: string
    quantity_on_hand: string
    needs_reconciliation: boolean
  }[]
  inventory_movements: {
    id: string
    location_id: string
    ingredient_id: string
    business_date: string
    movement_type: string
    quantity_base: string
  }[]
  menu_items: Ref[]
  recipe_items: {
    menu_item_id: string
    ingredient_id: string
    quantity_base_per_serving: string
  }[]
  sales_batches: {
    id: string
    location_id: string
    business_date: string
    source_reference: string
    status: string
  }[]
}
export type InvoiceForm = {
  revision: number
  location_id: string
  supplier_id: string | null
  invoice_number: string
  invoice_date: string | null
  total_amount: number | null
  tax_amount: number
  shipping_amount: number
  discount_amount: number
  review_note: string
  lines: {
    description: string
    supplier_item_id: string | null
    quantity: number
    unit_price: number
  }[]
}
export function toForm(d: InvoiceDetail): InvoiceForm {
  return {
    revision: d.revision,
    location_id: d.location_id,
    supplier_id: d.supplier_id,
    invoice_number: d.invoice_number || '',
    invoice_date: d.invoice_date?.slice(0, 10) || null,
    total_amount: d.total_amount == null ? null : Number(d.total_amount),
    tax_amount: Number(d.tax_amount),
    shipping_amount: Number(d.shipping_amount),
    discount_amount: Number(d.discount_amount),
    review_note: d.review_note || '',
    lines: d.lines.map((l) => ({
      description: l.description,
      supplier_item_id: l.supplier_item_id,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
    })),
  }
}
export async function request<T>(
  url: string,
  method = 'GET',
  payload?: unknown
): Promise<T> {
  const multipart = payload instanceof FormData
  const response = await fetch(`/api${url}`, {
    method,
    headers: {
      'X-Pantry-Request': '1',
      ...(!multipart && payload !== undefined
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    body:
      payload === undefined
        ? undefined
        : multipart
          ? payload
          : JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok || !body)
    throw new Error(
      body?.error ||
        'Backend unavailable. Start the app with start-dev.cmd (or pnpm dev).'
    )
  return body as T
}
