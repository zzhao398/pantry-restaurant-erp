// Conservative English/USD invoice parsing. OCR output is untrusted draft data.
const clean = (s) => s.trim().replace(/\s+/g, ' ')
const normal = (s) =>
  clean(s)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
const moneyToken = String.raw`\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,4})?`
function money(s) {
  if (!new RegExp(`^${moneyToken}$`).test(s.trim())) return null
  const n = Number(s.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) && n < 1000000000 ? n : null
}
function calendar(s, warnings) {
  let year, month, day, m
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/))) {
    ;[, year, month, day] = m
  } else if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/))) {
    ;[, month, day, year] = m
    warnings.push(
      'Numeric dates use the US month/day/year format. Check the invoice date.'
    )
  } else {
    const months = [
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ]
    m = s.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i)
    if (!m) return null
    month = months.indexOf(m[1].slice(0, 3).toLowerCase()) + 1
    day = m[2]
    year = m[3]
  }
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const d = new Date(`${iso}T12:00:00Z`)
  return !isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : null
}

export function parseInvoiceText(text, catalog = {}) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
  const warnings = []
  const fields = {
    supplier_id: null,
    invoice_number: '',
    invoice_date: null,
    total_amount: null,
    tax_amount: null,
    shipping_amount: null,
    discount_amount: null,
    lines: [],
  }
  const suppliers = catalog.suppliers || [],
    items = catalog.supplier_items || []
  const vendorLine = lines.find((l) => /^(?:vendor|supplier|from)\s*:/i.test(l))
  let vendor =
    vendorLine?.replace(/^(?:vendor|supplier|from)\s*:\s*/i, '') || ''
  const matches = suppliers.filter((s) =>
    vendor
      ? normal(s.name) === normal(vendor)
      : lines.slice(0, 8).some((l) => normal(l) === normal(s.name))
  )
  if (matches.length === 1) {
    fields.supplier_id = matches[0].id
    vendor = matches[0].name
  } else
    warnings.push(
      'Select the supplier manually; no unique existing supplier name was matched.'
    )

  const number = lines
    .map((l) =>
      l.match(
        /^invoice\s*(?:(?:number|no\.?)\s*[:#]?|#\s*:?|:)\s*([a-z0-9][a-z0-9./_-]*)\s*$/i
      )
    )
    .find(Boolean)
  if (number) fields.invoice_number = number[1].slice(0, 200)
  const dateLine =
    lines.find((l) => /^invoice\s+date\s*:/i.test(l)) ||
    lines.find((l) => /^date\s*:/i.test(l))
  if (dateLine)
    fields.invoice_date = calendar(
      dateLine.replace(/^(?:invoice\s+)?date\s*:\s*/i, ''),
      warnings
    )

  const labels = {
    total_amount:
      /^(?:(?:grand|invoice)\s+total|total(?:\s+amount)?)\b\s*:?\s*(.+)$/i,
    tax_amount: /^(?:sales\s+)?tax\b(?:\s*\([\d.]+%\))?\s*:?\s*(.+)$/i,
    shipping_amount:
      /^(?:shipping|freight|delivery)\b(?:\s+(?:charge|fee))?\s*:?\s*(.+)$/i,
    discount_amount: /^discount\b\s*:?\s*(.+)$/i,
  }
  for (const [key, pattern] of Object.entries(labels)) {
    const values = [
      ...new Set(
        lines
          .map((l) => l.match(pattern))
          .filter(Boolean)
          .map((m) => money(m[1].replace(/\s*USD\s*/gi, '')))
          .filter((n) => n !== null)
      ),
    ]
    if (values.length === 1) fields[key] = values[0]
    else if (values.length > 1)
      warnings.push(
        `Conflicting ${key.replaceAll('_', ' ')} values; fill this field manually.`
      )
  }
  const trailing = new RegExp(
    `^(.+?)\\s+(\\d+(?:\\.\\d{1,6})?)\\s+(${moneyToken})\\s+(${moneyToken})$`
  )
  const leading = new RegExp(
    `^(\\d+(?:\\.\\d{1,6})?)\\s+(.+?)\\s+(${moneyToken})\\s+(${moneyToken})$`
  )
  const quantityFirst = lines.some((l) =>
    /^(?:qty|quantity)\b.*(?:description|item).*price.*(?:amount|total)/i.test(
      l
    )
  )
  for (const line of lines) {
    if (
      /^(?:sub\s*total|total|tax|shipping|discount|freight|balance|amount due|invoice|date|page)\b/i.test(
        line
      )
    )
      continue
    const m = line.match(quantityFirst ? leading : trailing)
    if (!m) continue
    const description = quantityFirst ? m[2] : m[1]
    const quantity = Number(quantityFirst ? m[1] : m[2]),
      unit_price = money(m[3]),
      total = money(m[4])
    if (
      !/[a-z]/i.test(description) ||
      !quantity ||
      quantity > 1000000 ||
      unit_price === null ||
      total === null
    )
      continue
    if (
      Math.abs(Math.round(quantity * unit_price * 10000) / 10000 - total) >
      0.00005
    ) {
      warnings.push(
        `Check line "${description.slice(0, 80)}": quantity × price does not match its printed total. It was not auto-filled.`
      )
      continue
    }
    // Exact SKU matching only: do not guess a stock pack from a similar product name.
    const tokens = description.toLowerCase().split(/[^a-z0-9_-]+/)
    const packs = items.filter(
      (p) =>
        p.supplier_id === fields.supplier_id &&
        p.supplier_sku &&
        tokens.includes(p.supplier_sku.toLowerCase())
    )
    fields.lines.push({
      description: description.slice(0, 200),
      quantity,
      unit_price,
      supplier_item_id: packs.length === 1 ? packs[0].id : null,
    })
  }
  if (fields.lines.length > 100) {
    fields.lines = []
    warnings.push('More than 100 lines detected; enter this invoice manually.')
  }
  if (!fields.invoice_number)
    warnings.push('Invoice number was not recognized.')
  if (!fields.invoice_date) warnings.push('Invoice date was not recognized.')
  if (fields.total_amount === null)
    warnings.push(
      'Invoice total was not recognized; amount due is not assumed to be the invoice total.'
    )
  if (!fields.lines.length)
    warnings.push(
      'No reliable item rows recognized. Add the missing lines manually.'
    )
  if (fields.lines.some((l) => !l.supplier_item_id))
    warnings.push(
      'Match each item to the correct supplier pack before approval. Check pack quantities against the original.'
    )
  if (
    ['tax_amount', 'shipping_amount', 'discount_amount'].some(
      (k) => fields[k] === null
    )
  )
    warnings.push(
      'Check tax, shipping and discount. Unrecognized values remain at the form defaults (0).'
    )
  if (/\b(?:EUR|GBP|CAD|AUD|CNY|RMB)\b|[€£¥]/.test(text)) {
    fields.total_amount = null
    fields.lines = []
    fields.tax_amount = null
    fields.shipping_amount = null
    fields.discount_amount = null
    warnings.push(
      'A non-USD currency was detected. This workflow supports USD only; currency amounts were not filled.'
    )
  }
  return { fields, vendor, warnings }
}
