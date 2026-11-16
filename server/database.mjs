import { PGlite } from '@electric-sql/pglite'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'

export const DEMO_BRAND = '10000000-0000-0000-0000-000000000001'
const sql = (name) =>
  readFile(new URL(`../database/${name}`, import.meta.url), 'utf8')

// Identical SQL and parameterized queries in embedded and remote PostgreSQL modes.
// Remote databases are never seeded or migrated automatically.
export async function openDatabase({ directory, connectionString } = {}) {
  if (connectionString) {
    const pool = new pg.Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10000,
    })
    pg.types.setTypeParser(1082, (value) => value) // date stays a calendar date
    const db = {
      mode: 'postgres',
      query: (s, p) => pool.query(s, p),
      close: () => pool.end(),
      async transaction(fn) {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const result = await fn(client)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        } finally {
          client.release()
        }
      },
    }
    try {
      await db.query(
        'SELECT revision, tax_amount FROM restaurant.invoices LIMIT 0'
      )
    } catch {
      await pool.end()
      throw new Error(
        'Database unavailable or migration 007 missing. See docs/BACKEND.md.'
      )
    }
    return db
  }
  if (directory) await mkdir(path.resolve(directory), { recursive: true })
  const db = new PGlite(directory ? path.resolve(directory) : undefined)
  try {
    const baseline = (
      await db.query("SELECT to_regclass('restaurant.brands') AS name")
    ).rows[0].name
    if (!baseline) await db.exec(await sql('001_schema.sql'))
    const seeded = (await db.query('SELECT 1 FROM restaurant.brands LIMIT 1'))
      .rows.length
    if (!seeded) await db.exec(await sql('002_demo.sql'))
    const exists = (
      await db.query("SELECT to_regclass('restaurant.invoices') AS name")
    ).rows[0].name
    if (!exists) await db.exec(await sql('005_invoice_schema.sql'))
    const current = (
      await db.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='restaurant' AND table_name='invoices' AND column_name='revision'"
      )
    ).rows.length
    if (!current) await db.exec(await sql('007_invoice_workflow.sql'))
    db.mode = 'local-postgres'
    return db
  } catch (error) {
    await db.close()
    throw error
  }
}
