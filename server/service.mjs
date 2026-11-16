import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { DEMO_BRAND } from './database.mjs'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}
// PostgreSQL accepts UUIDs without an RFC version nibble; the existing SQL seeds use those IDs.
const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'Invalid record ID'
  )
const amount = z
  .number()
  .finite()
  .min(0)
  .max(999999999)
  .refine(
    (n) => Math.abs(n * 10000 - Math.round(n * 10000)) < 0.001,
    'Use at most four decimal places'
  )
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T12:00:00Z`)
    return !isNaN(+d) && d.toISOString().slice(0, 10) === s
  }, 'Use a valid date')
const text = z.string().trim().max(200)
const note = z.string().trim().max(2000).default('')
const qty = z
  .number()
  .finite()
  .positive()
  .max(1000000)
  .refine(
    (n) => Math.abs(n * 1000000 - Math.round(n * 1000000)) < 0.001,
    'Use at most six decimal places'
  )
const draftSchema = z
  .object({
    revision: z.number().int().positive(),
    location_id: uuid,
    supplier_id: uuid.nullable(),
    invoice_number: text,
    invoice_date: date.nullable(),
    total_amount: amount.nullable(),
    tax_amount: amount,
    shipping_amount: amount,
    discount_amount: amount,
    review_note: note,
    lines: z
      .array(
        z.object({
          description: text.min(1),
          supplier_item_id: uuid.nullable(),
          quantity: qty,
          unit_price: amount,
        })
      )
      .max(100),
  })
  .strict()
const reviewSchema = z
  .object({
    revision: z.number().int().positive(),
    action: z.enum(['approved', 'rejected', 'duplicate']),
    note,
  })
  .strict()
const rows = async (db, s, p = []) => (await db.query(s, p)).rows
const one = async (db, s, p = []) => (await rows(db, s, p))[0]

export function createService(
  db,
  { brandId = DEMO_BRAND, reviewer = 'Local operator (unverified)' } = {}
) {
  uuid.parse(brandId)
  const actor = z.string().trim().min(1).max(120).parse(reviewer)
  const find = async (tx, id, lock = false) => {
    uuid.parse(id)
    const i = await one(
      tx,
      `SELECT * FROM restaurant.invoices WHERE brand_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`,
      [brandId, id]
    )
    if (!i) throw new ApiError(404, 'Invoice not found')
    return i
  }
  const event = (tx, id, action, message) =>
    tx.query(
      'INSERT INTO restaurant.invoice_review_events(brand_id,invoice_id,action,reviewer_label,note) VALUES ($1,$2,$3,$4,$5)',
      [brandId, id, action, actor, message]
    )
  const revision = (i, n) => {
    if (i.revision !== n)
      throw new ApiError(
        409,
        'This invoice changed. Reload it before saving or reviewing.'
      )
  }
  async function detail(id) {
    return db.transaction(async (tx) => {
      const invoice = await find(tx, id, true)
      return {
        ...invoice,
        lines: await rows(
          tx,
          'SELECT * FROM restaurant.invoice_lines WHERE brand_id=$1 AND invoice_id=$2 ORDER BY line_number',
          [brandId, id]
        ),
        events: await rows(
          tx,
          'SELECT * FROM restaurant.invoice_review_events WHERE brand_id=$1 AND invoice_id=$2 ORDER BY created_at,id',
          [brandId, id]
        ),
        possible_duplicates: await rows(
          tx,
          `SELECT id,invoice_number,status,original_file_name FROM restaurant.invoices WHERE brand_id=$1 AND id<>$2 AND
          ((supplier_id=$3 AND lower(btrim(invoice_number))=lower(btrim($4)) AND $4 IS NOT NULL)
           OR (document_sha256=$5 AND $5 IS NOT NULL)) ORDER BY created_at`,
          [
            brandId,
            id,
            invoice.supplier_id,
            invoice.invoice_number,
            invoice.document_sha256,
          ]
        ),
      }
    })
  }
  return {
    detail,
    async workspace() {
      return db.transaction(async (tx) => {
        const out = { mode: db.mode, reviewer: actor }
        for (const table of [
          'locations',
          'suppliers',
          'ingredients',
          'supplier_items',
          'invoices',
          'purchase_receipts',
          'inventory_on_hand',
          'inventory_movements',
          'menu_items',
          'recipe_items',
          'sales_batches',
        ]) {
          out[table] = await rows(
            tx,
            `SELECT * FROM restaurant.${table} WHERE brand_id=$1`,
            [brandId]
          )
        }
        out.invoices.sort(
          (a, b) => +new Date(b.created_at) - +new Date(a.created_at)
        )
        return out
      })
    },
    async create(input, document = {}) {
      const { location_id } = z
        .object({ location_id: uuid })
        .strict()
        .parse(input)
      const id = randomUUID()
      await db.transaction(async (tx) => {
        if (
          !(await one(
            tx,
            'SELECT id FROM restaurant.locations WHERE brand_id=$1 AND id=$2',
            [brandId, location_id]
          ))
        )
          throw new ApiError(400, 'Choose a location in this workspace')
        await tx.query(
          'INSERT INTO restaurant.invoices(id,brand_id,location_id,original_file_name,document_storage_path,document_sha256) VALUES ($1,$2,$3,$4,$5,$6)',
          [
            id,
            brandId,
            location_id,
            document.name || null,
            document.key || null,
            document.hash || null,
          ]
        )
        await event(
          tx,
          id,
          'saved',
          document.key
            ? 'Document uploaded; manual extraction required.'
            : 'Manual invoice created.'
        )
      })
      return detail(id)
    },
    async save(id, input) {
      const d = draftSchema.parse(input)
      await db.transaction(async (tx) => {
        const i = await find(tx, id, true)
        revision(i, d.revision)
        if (i.status !== 'needs_review')
          throw new ApiError(409, 'Reviewed invoices cannot be edited')
        await tx.query(
          `UPDATE restaurant.invoices SET location_id=$3,supplier_id=$4,invoice_number=$5,invoice_date=$6,total_amount=$7,
          tax_amount=$8,shipping_amount=$9,discount_amount=$10,review_note=$11,revision=revision+1 WHERE brand_id=$1 AND id=$2`,
          [
            brandId,
            id,
            d.location_id,
            d.supplier_id,
            d.invoice_number || null,
            d.invoice_date,
            d.total_amount,
            d.tax_amount,
            d.shipping_amount,
            d.discount_amount,
            d.review_note,
          ]
        )
        await tx.query(
          'DELETE FROM restaurant.invoice_lines WHERE brand_id=$1 AND invoice_id=$2',
          [brandId, id]
        )
        for (const [index, line] of d.lines.entries()) {
          let item
          if (line.supplier_item_id) {
            item = await one(
              tx,
              'SELECT * FROM restaurant.supplier_items WHERE brand_id=$1 AND id=$2 AND supplier_id=$3',
              [brandId, line.supplier_item_id, d.supplier_id]
            )
            if (!item)
              throw new ApiError(
                400,
                'A line uses a product from another supplier'
              )
          }
          await tx.query(
            `INSERT INTO restaurant.invoice_lines(brand_id,invoice_id,line_number,description,ingredient_id,quantity,unit_label,unit_price,line_total,supplier_item_id,quantity_per_pack_base)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,round($6::numeric*$8::numeric,4),$9,$10)`,
            [
              brandId,
              id,
              index + 1,
              line.description,
              item?.ingredient_id || null,
              line.quantity,
              item?.pack_label || 'unit',
              line.unit_price,
              line.supplier_item_id,
              item?.quantity_per_pack_base || null,
            ]
          )
        }
        await event(tx, id, 'saved', 'Invoice details and lines saved.')
      })
      return detail(id)
    },
    async review(id, input) {
      const d = reviewSchema.parse(input)
      await db.transaction(async (tx) => {
        const i = await find(tx, id, true)
        if (i.status === d.action) return // A repeated identical request does not duplicate audit events.
        revision(i, d.revision)
        if (i.status !== 'needs_review')
          throw new ApiError(409, 'This invoice has already been reviewed')
        if (d.action === 'approved') {
          if (i.currency !== 'USD')
            throw new ApiError(
              400,
              'This basic workflow supports USD invoices only'
            )
          if (
            !i.supplier_id ||
            !i.invoice_number ||
            !i.invoice_date ||
            Number(i.total_amount) <= 0 ||
            i.total_amount == null
          )
            throw new ApiError(
              400,
              'Supplier, invoice number, date and a positive total are required'
            )
          const checks = await one(
            tx,
            `SELECT count(*)::int AS n,
            bool_and(quantity IS NOT NULL AND unit_price IS NOT NULL AND line_total IS NOT NULL AND line_total=round(quantity*unit_price,4)) AS valid,
            coalesce(sum(line_total),0) + $3::numeric + $4::numeric - $5::numeric = $6::numeric AS balanced
            FROM restaurant.invoice_lines WHERE brand_id=$1 AND invoice_id=$2`,
            [
              brandId,
              id,
              i.tax_amount,
              i.shipping_amount,
              i.discount_amount,
              i.total_amount,
            ]
          )
          if (!checks.n || !checks.valid || !checks.balanced)
            throw new ApiError(
              400,
              'Line totals + tax + shipping - discount must equal the invoice total'
            )
          // Serialize different invoices for the same vendor before checking number/hash duplicates.
          await tx.query(
            'SELECT id FROM restaurant.suppliers WHERE brand_id=$1 AND id=$2 FOR UPDATE',
            [brandId, i.supplier_id]
          )
          const duplicate = await one(
            tx,
            `SELECT id FROM restaurant.invoices WHERE brand_id=$1 AND id<>$2 AND status='approved' AND
            ((supplier_id=$3 AND lower(btrim(invoice_number))=lower(btrim($4))) OR (document_sha256=$5 AND $5 IS NOT NULL))`,
            [brandId, id, i.supplier_id, i.invoice_number, i.document_sha256]
          )
          if (duplicate)
            throw new ApiError(
              409,
              'An approved invoice already has this supplier/number or document hash. Check the duplicate warning.'
            )
        } else if (!d.note)
          throw new ApiError(
            400,
            'Enter a reason for rejection or duplicate marking'
          )
        await tx.query(
          'UPDATE restaurant.invoices SET status=$3,reviewed_by=$4,reviewed_at=now(),review_note=$5,revision=revision+1 WHERE brand_id=$1 AND id=$2',
          [brandId, id, d.action, actor, d.note || i.review_note]
        )
        await event(
          tx,
          id,
          d.action === 'duplicate' ? 'duplicate_flagged' : d.action,
          d.note || 'Reviewed manually. Approval does not receive goods.'
        )
      })
      return detail(id)
    },
    async receive(id, input) {
      const d = z
        .object({ received_on: date, confirmed: z.literal(true) })
        .strict()
        .parse(input)
      await db.transaction(async (tx) => {
        const i = await find(tx, id, true)
        if (i.status !== 'approved')
          throw new ApiError(409, 'Approve the invoice before receiving goods')
        if (i.receipt_id) return
        const lines = await rows(
          tx,
          'SELECT * FROM restaurant.invoice_lines WHERE brand_id=$1 AND invoice_id=$2 ORDER BY line_number',
          [brandId, id]
        )
        if (
          !lines.length ||
          lines.some((l) => !l.supplier_item_id || !l.quantity_per_pack_base)
        )
          throw new ApiError(
            400,
            'Every line must map to a supplier pack before full receipt. Partial receipts are outside this version.'
          )
        const rid = randomUUID()
        await tx.query(
          'INSERT INTO restaurant.purchase_receipts(id,brand_id,location_id,supplier_id,source_reference,invoice_reference,received_on) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [
            rid,
            brandId,
            i.location_id,
            i.supplier_id,
            `INV:${id}`,
            i.invoice_number,
            d.received_on,
          ]
        )
        for (const l of lines)
          await tx.query(
            `INSERT INTO restaurant.purchase_receipt_lines(brand_id,receipt_id,supplier_id,supplier_item_id,ingredient_id,line_number,packs_received,quantity_per_pack_base,unit_pack_cost)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              brandId,
              rid,
              i.supplier_id,
              l.supplier_item_id,
              l.ingredient_id,
              l.line_number,
              l.quantity,
              l.quantity_per_pack_base,
              l.unit_price,
            ]
          )
        await tx.query('SELECT restaurant.post_receipt($1)', [rid])
        await tx.query(
          'UPDATE restaurant.invoices SET receipt_id=$3,revision=revision+1 WHERE brand_id=$1 AND id=$2',
          [brandId, id, rid]
        )
        await event(
          tx,
          id,
          'saved',
          `Full delivery confirmed; posted receipt ${rid}.`
        )
      })
      return detail(id)
    },
    async document(id) {
      const i = await find(db, id)
      if (!i.document_storage_path)
        throw new ApiError(404, 'This invoice has no uploaded document')
      return { key: i.document_storage_path, name: i.original_file_name }
    },
  }
}
