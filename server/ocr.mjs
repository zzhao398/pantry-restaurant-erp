import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseInvoiceText } from './invoice-extraction.mjs'

let running = false
export const failedExtraction = (message) => ({
  status: 'failed',
  method: null,
  text: '',
  fields: null,
  vendor: '',
  warnings: [message],
})

// A bounded child process keeps CPU-heavy OCR and malformed documents away from the API.
export async function extractInvoice(
  filePath,
  catalog,
  { timeoutMs = 90000 } = {}
) {
  if (running)
    return failedExtraction(
      'Another invoice is being scanned. Retry extraction shortly, or enter details manually.'
    )
  running = true
  try {
    const result = await new Promise((resolve) => {
      const child = fork(
        fileURLToPath(new URL('./ocr-worker.mjs', import.meta.url)),
        [],
        {
          execArgv: ['--max-old-space-size=512'],
          windowsHide: true,
          stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
          env: Object.fromEntries(
            Object.entries(process.env).filter(([k]) =>
              /^(path|systemroot|windir|temp|tmp)$/i.test(k)
            )
          ),
        }
      )
      let settled = false
      const finish = (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        child.kill()
        resolve(value)
      }
      const timer = setTimeout(
        () =>
          finish({
            error:
              'Recognition timed out. Try a clearer or shorter document, or enter the details manually.',
          }),
        timeoutMs
      )
      child.once('message', finish)
      child.once('error', () =>
        finish({
          error: 'The OCR engine could not start. Enter the details manually.',
        })
      )
      child.once('exit', () =>
        finish({
          error:
            'Recognition failed. The uploaded original is still available for manual entry.',
        })
      )
      child.send({ filePath })
    })
    if (result.error) return failedExtraction(result.error)
    const parsed = parseInvoiceText(result.text, catalog)
    return {
      status: 'complete',
      method: result.method,
      text: result.text,
      pages: result.pages,
      confidence: result.confidence,
      ...parsed,
      warnings: [...result.warnings, ...parsed.warnings],
    }
  } finally {
    running = false
  }
}
