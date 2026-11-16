import { ZodError } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { ApiError, createService } from './service.mjs'

const MAX_FILE = 10 * 1024 * 1024
const origins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:3001',
  'http://localhost:3001',
])
const extensions = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}
export function validDocument(bytes, type) {
  return type === 'application/pdf'
    ? bytes.subarray(0, 5).toString() === '%PDF-'
    : type === 'image/png'
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : type === 'image/jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : type === 'image/webp'
          ? bytes.subarray(0, 4).toString() === 'RIFF' &&
            bytes.subarray(8, 12).toString() === 'WEBP'
          : false
}
async function body(req, limit) {
  if (Number(req.headers['content-length'] || 0) > limit)
    throw new ApiError(413, 'Document must be at most 10 MB')
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new ApiError(413, 'Request is too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
async function json(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw new ApiError(415, 'Expected JSON')
  try {
    return JSON.parse((await body(req, 256 * 1024)).toString())
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(400, 'Invalid JSON')
  }
}
export function createHandler(db, { uploadDirectory, ...options }) {
  const service = createService(db, options)
  return async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
      })
      res.end(JSON.stringify(value))
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    try {
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || ''))
        throw new ApiError(403, 'Local access only')
      if (req.headers.origin && !origins.has(req.headers.origin))
        throw new ApiError(403, 'Origin not allowed')
      if (req.headers['sec-fetch-site'] === 'cross-site')
        throw new ApiError(403, 'Cross-site access is not allowed')
      const pathname = new URL(req.url, 'http://localhost').pathname
      if (req.method === 'GET' && pathname === '/api/health')
        return send(200, {
          ok: true,
          mode: db.mode,
          workflow: 'manual-invoice-v1',
        })
      if (req.method === 'GET' && pathname === '/api/workspace')
        return send(200, await service.workspace())
      const match = pathname.match(
        /^\/api\/invoices\/([a-f0-9-]{36})(?:\/(review|receive|document))?$/i
      )
      if (req.method === 'GET' && match) {
        if (!match[2]) return send(200, await service.detail(match[1]))
        if (match[2] === 'document') {
          const doc = await service.document(match[1])
          if (!/^[a-f0-9-]{36}\.(pdf|png|jpg|webp)$/.test(doc.key))
            throw new ApiError(404, 'Document unavailable')
          let bytes
          try {
            bytes = await readFile(path.join(uploadDirectory, doc.key))
          } catch {
            throw new ApiError(
              404,
              'Document is missing from this server. Restore the matching uploads backup.'
            )
          }
          res.writeHead(200, {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="invoice.${doc.key.split('.').pop()}"; filename*=UTF-8''${encodeURIComponent(doc.name).replace(/'/g, '%27')}`,
          })
          return res.end(bytes)
        }
      }
      if (!['POST', 'PUT'].includes(req.method))
        throw new ApiError(404, 'Endpoint not found')
      if (req.headers['x-pantry-request'] !== '1')
        throw new ApiError(403, 'Missing application request header')
      if (req.method === 'POST' && pathname === '/api/invoices') {
        if (!req.headers['content-type']?.startsWith('multipart/form-data'))
          return send(201, await service.create(await json(req)))
        const buffer = await body(req, MAX_FILE + 65536)
        let form
        try {
          form = await new Request('http://localhost', {
            method: 'POST',
            headers: { 'content-type': req.headers['content-type'] },
            body: buffer,
          }).formData()
        } catch {
          throw new ApiError(400, 'Invalid upload form')
        }
        const file = form.get('file')
        if (
          !file ||
          typeof file === 'string' ||
          !file.size ||
          file.size > MAX_FILE
        )
          throw new ApiError(
            400,
            'Choose a PDF, PNG, JPEG or WebP file up to 10 MB'
          )
        const bytes = Buffer.from(await file.arrayBuffer())
        if (!validDocument(bytes, file.type))
          throw new ApiError(
            415,
            'File content does not match a supported PDF or image'
          )
        const key = `${randomUUID()}.${extensions[file.type]}`
        const hash = createHash('sha256').update(bytes).digest('hex')
        await mkdir(uploadDirectory, { recursive: true })
        const destination = path.join(uploadDirectory, key)
        await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
        try {
          return send(
            201,
            await service.create(
              { location_id: form.get('location_id') },
              { key, hash, name: file.name.slice(0, 200) }
            )
          )
        } catch (e) {
          // Never remove a file referenced by a committed invoice after a response/read failure.
          const refs = await db.query(
            'SELECT 1 FROM restaurant.invoices WHERE document_storage_path=$1',
            [key]
          )
          if (!refs.rows.length) await unlink(destination)
          throw e
        }
      }
      if (match && req.method === 'PUT' && !match[2])
        return send(200, await service.save(match[1], await json(req)))
      if (match && req.method === 'POST' && match[2] === 'review')
        return send(200, await service.review(match[1], await json(req)))
      if (match && req.method === 'POST' && match[2] === 'receive')
        return send(200, await service.receive(match[1], await json(req)))
      throw new ApiError(404, 'Endpoint not found')
    } catch (e) {
      if (e instanceof ZodError)
        return send(400, {
          error: e.issues
            .map((i) => `${i.path.join('.') || 'Request'}: ${i.message}`)
            .join('; '),
        })
      if (e instanceof ApiError) return send(e.status, { error: e.message })
      if (e.code === '23505')
        return send(409, {
          error:
            'A matching approved invoice or receipt already exists. Reload and check duplicates.',
        })
      if (['23503', '23514', '22P02', '22003'].includes(e.code))
        return send(400, {
          error:
            'Invalid reference, amount or quantity. Check the selected location, supplier and line items.',
        })
      // Do not include SQL, credentials, filesystem paths or invoice payloads in responses/logs.
      console.error('Invoice API request failed', e.code || e.name || 'Error')
      return send(500, {
        error:
          'The request could not be completed. Reload to check its current status before retrying.',
      })
    }
  }
}
