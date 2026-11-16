import { createServer } from 'vite'
import { startApi } from '../server/index.mjs'

let closeApi, vite
try {
  closeApi = await startApi()
  vite = await createServer({
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  })
  await vite.listen()
  vite.printUrls()
  let stopping = false
  const stop = async () => {
    if (stopping) return
    stopping = true
    await vite.close()
    await closeApi()
    process.exit(0)
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, stop)
} catch (e) {
  console.error(
    e.code === 'EADDRINUSE'
      ? 'A Pantry port is already in use. Stop the previous server first.'
      : 'Could not start Pantry. Check docs/BACKEND.md and the local database configuration.'
  )
  if (vite) await vite.close()
  if (closeApi) await closeApi()
  process.exitCode = 1
}
