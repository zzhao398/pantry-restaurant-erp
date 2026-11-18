import { createCanvas, loadImage } from '@napi-rs/canvas'
import english from '@tesseract.js-data/eng'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createWorker, PSM } from 'tesseract.js'

const MAX_PIXELS = 12000000,
  MAX_PAGES = 5,
  MAX_TEXT = 30000
const require = createRequire(import.meta.url)
export async function recognize(filePath) {
  let worker, pdf, loading
  const warnings = [],
    chunks = [],
    confidences = [],
    methods = new Set()
  const ocr = async (bytes) => {
    worker ||= await createWorker('eng', 1, {
      langPath: english.langPath,
      gzip: true,
      cacheMethod: 'none',
    })
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    })
    const { data } = await worker.recognize(bytes)
    confidences.push(data.confidence)
    methods.add('ocr')
    return data.text
  }
  try {
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
      const root =
        path
          .dirname(require.resolve('pdfjs-dist/package.json'))
          .replaceAll('\\', '/') + '/'
      loading = getDocument({
        data: new Uint8Array(await readFile(filePath)),
        isEvalSupported: false,
        useSystemFonts: false,
        verbosity: 0,
        standardFontDataUrl: root + 'standard_fonts/',
        cMapUrl: root + 'cmaps/',
        cMapPacked: true,
        wasmUrl: root + 'wasm/',
      })
      pdf = await loading.promise
      if (pdf.numPages > MAX_PAGES) throw new Error('PAGE_LIMIT')
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        // Sort by visual row, not internal PDF drawing order, then preserve columns with spaces.
        const rows = []
        for (const item of content.items
          .filter((item) => item.str?.trim())
          .sort(
            (a, b) =>
              b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]
          )) {
          let row = rows.find((r) => Math.abs(r.y - item.transform[5]) < 3)
          if (!row) {
            row = { y: item.transform[5], items: [] }
            rows.push(row)
          }
          row.items.push(item)
        }
        let text = rows
          .map((r) =>
            r.items
              .sort((a, b) => a.transform[4] - b.transform[4])
              .map((x) => x.str)
              .join('  ')
          )
          .join('\n')
        if (
          text.replace(/\s/g, '').length >= 60 &&
          /\b(?:invoice|total|quantity|qty)\b/i.test(text)
        )
          methods.add('pdf-text')
        else {
          const viewport = page.getViewport({ scale: 2.5 })
          if (viewport.width * viewport.height > MAX_PIXELS)
            throw new Error('PIXEL_LIMIT')
          const canvas = createCanvas(
            Math.ceil(viewport.width),
            Math.ceil(viewport.height)
          )
          await page.render({
            canvasContext: canvas.getContext('2d'),
            viewport,
          }).promise
          text = await ocr(canvas.toBuffer('image/png'))
        }
        chunks.push(text)
        page.cleanup()
      }
    } else {
      const image = await loadImage(await readFile(filePath))
      if (image.width * image.height > MAX_PIXELS)
        throw new Error('PIXEL_LIMIT')
      // Decode all supported image formats to a white-backed PNG (including WebP).
      const canvas = createCanvas(image.width, image.height),
        ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, image.width, image.height)
      ctx.drawImage(image, 0, 0)
      chunks.push(await ocr(canvas.toBuffer('image/png')))
    }
    const text = chunks.join('\n\n')
    if (!text.trim()) throw new Error('EMPTY')
    if (text.length > MAX_TEXT) throw new Error('TEXT_LIMIT')
    const confidence = confidences.length
      ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length)
      : null
    if (confidence !== null && confidence < 80)
      warnings.push(
        'Low OCR confidence. Compare every value with the original; some text may be missing or incorrect.'
      )
    return {
      text,
      pages: chunks.length,
      confidence,
      method: [...methods].sort().join('+'),
      warnings,
    }
  } finally {
    if (worker) await worker.terminate()
    if (loading) await loading.destroy()
  }
}
process.once('message', async ({ filePath }) => {
  try {
    process.send(await recognize(filePath))
  } catch (e) {
    const messages = {
      PAGE_LIMIT:
        'Basic extraction supports up to 5 PDF pages. Enter this invoice manually or upload a shorter document.',
      PIXEL_LIMIT:
        'The page/image is too large to scan. Use an image below 12 megapixels or a standard-size PDF.',
      EMPTY:
        'No readable text found. Try a clearer scan or enter the details manually.',
      TEXT_LIMIT:
        'Too much text for basic extraction. Enter the invoice manually.',
    }
    process.send({
      error:
        messages[e.message] ||
        'Could not read this document. It may be damaged or password-protected. The original is saved; enter the details manually.',
    })
  }
})
