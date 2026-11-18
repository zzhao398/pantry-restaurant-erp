import { createCanvas } from '@napi-rs/canvas'

export const invoiceText = `Demo Food Supply
INVOICE
Invoice Number: OCR-DEMO-001
Invoice Date: 2026-11-18
Bill To: Example Kitchen
Description                 Qty    Unit Price    Amount
RICE-1KG Rice bag             2         3.50        7.00
CHICKEN-1KG Chicken pack      1         8.00        8.00
Subtotal: 15.00
Tax: 1.00
Shipping: 2.00
Discount: 1.00
Total: 17.00
Currency: USD
Fictional invoice for software testing only. No payment is due.`

export function invoiceImage(format = 'image/png') {
  const canvas = createCanvas(1700, 1800),
    ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, 1700, 1800)
  ctx.fillStyle = 'black'
  ctx.font = '28px monospace'
  invoiceText
    .split('\n')
    .forEach((line, i) => ctx.fillText(line, 80, 110 + i * 82))
  return canvas.toBuffer(format)
}

// Minimal deterministic PDF fixtures: searchable text and image-only scans.
export function invoicePdf({ scan = false, pages = 1 } = {}) {
  const image = scan ? invoiceImage('image/jpeg') : null
  const stream = scan
    ? Buffer.from('q 550 0 0 582 25 190 cm /Im0 Do Q')
    : Buffer.from(
        'BT /F1 10 Tf 35 750 Td 18 TL ' +
          invoiceText
            .split('\n')
            .map(
              (l, i) => `${i ? 'T* ' : ''}(${l.replace(/[()\\]/g, '\\$&')}) Tj`
            )
            .join('\n') +
          ' ET'
      )
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from(
      `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${6 + i} 0 R`).join(' ')}] /Count ${pages} >>`
    ),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>'),
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
      stream,
      Buffer.from('\nendstream'),
    ]),
    image
      ? Buffer.concat([
          Buffer.from(
            `<< /Type /XObject /Subtype /Image /Width 1700 /Height 1800 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`
          ),
          image,
          Buffer.from('\nendstream'),
        ])
      : Buffer.from('<< >>'),
    ...Array.from({ length: pages }, () =>
      Buffer.from(
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'
      )
    ),
  ]
  const chunks = [Buffer.from('%PDF-1.4\n')],
    offsets = [0]
  let length = chunks[0].length
  objects.forEach((obj, i) => {
    offsets.push(length)
    const chunk = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      obj,
      Buffer.from('\nendobj\n'),
    ])
    chunks.push(chunk)
    length += chunk.length
  })
  chunks.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
        offsets
          .slice(1)
          .map((x) => `${String(x).padStart(10, '0')} 00000 n \n`)
          .join('') +
        `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`
    )
  )
  return Buffer.concat(chunks)
}
