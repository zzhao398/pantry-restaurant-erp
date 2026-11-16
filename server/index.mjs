import { createServer } from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { openDatabase } from './database.mjs'
import { createHandler } from './http.mjs'

export async function startApi() {
  let handler = (_req, res) => {
    res.writeHead(503)
    res.end('Database starting')
  }
  const server = createServer((req, res) => handler(req, res))
  server.requestTimeout = 30000
  // Reserve the single local port before opening PGlite; never run two owners on one data directory.
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(3001, '127.0.0.1', resolve)
  })
  let db
  try {
    db = await openDatabase({
      directory: path.resolve('.pantry/database'),
      connectionString: process.env.DATABASE_URL,
    })
    handler = createHandler(db, {
      uploadDirectory: path.resolve('.pantry/uploads'),
      brandId: process.env.PANTRY_BRAND_ID,
      reviewer: process.env.PANTRY_REVIEWER_LABEL,
    })
    console.log(
      `Pantry API: http://127.0.0.1:3001 (${db.mode}; local access only)`
    )
    return async () => {
      await new Promise((resolve) => server.close(resolve))
      await db.close()
    }
  } catch (e) {
    server.close()
    if (db) await db.close()
    throw e
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const close = await startApi()
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, async () => {
        await close()
        process.exit(0)
      })
  } catch (e) {
    console.error(
      e.code === 'EADDRINUSE'
        ? 'Port 3001 is in use. Stop the existing Pantry server first.'
        : 'Backend startup failed. Check database configuration and docs/BACKEND.md.'
    )
    process.exitCode = 1
  }
}
