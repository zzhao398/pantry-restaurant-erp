import assert from 'node:assert/strict'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { openDatabase, DEMO_BRAND } from '../server/database.mjs'
import { createHandler } from '../server/http.mjs'
import { createService } from '../server/service.mjs'

const L = '20000000-0000-0000-0000-000000000001'
const V = '30000000-0000-0000-0000-000000000001'
const PACK = '50000000-0000-0000-0000-000000000001'
const draft = (revision, number = 'INV-TEST', extra = {}) => ({
  revision,
  location_id: L,
  supplier_id: V,
  invoice_number: number,
  invoice_date: '2026-11-16',
  total_amount: 8,
  tax_amount: 1,
  shipping_amount: 1,
  discount_amount: 1,
  review_note: 'Checked against original.',
  lines: [
    {
      description: 'Rice 1kg',
      supplier_item_id: PACK,
      quantity: 2,
      unit_price: 3.5,
    },
  ],
  ...extra,
})
async function cleanup(dir) {
  const resolved = path.resolve(dir),
    parent = path.resolve(tmpdir()) + path.sep
  assert.ok(
    resolved.startsWith(parent) &&
      path.basename(resolved).startsWith('pantry-backend-test-')
  )
  await rm(resolved, { recursive: true, force: true })
}
test('HTTP invoice workflow, validation and inventory transactions', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pantry-backend-test-'))
  const db = await openDatabase()
  const uploads = path.join(dir, 'uploads')
  const server = createServer(createHandler(db, { uploadDirectory: uploads }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api`
  const call = async (url, method = 'GET', payload, headers = {}) => {
    const multi = payload instanceof FormData
    const r = await fetch(base + url, {
      method,
      headers: {
        'x-pantry-request': '1',
        ...(payload !== undefined && !multi
          ? { 'content-type': 'application/json' }
          : {}),
        ...headers,
      },
      body:
        payload === undefined
          ? undefined
          : multi
            ? payload
            : JSON.stringify(payload),
    })
    return { status: r.status, body: await r.json() }
  }
  const upload = async (
    bytes = '%PDF-1.4\n% fictional test invoice',
    location = L,
    type = 'application/pdf'
  ) => {
    const form = new FormData()
    form.set('location_id', location)
    form.set('file', new Blob([bytes], { type }), 'invoice.pdf')
    return call('/invoices', 'POST', form)
  }
  const total = async () =>
    Number(
      (
        await db.query(
          "SELECT quantity_on_hand FROM restaurant.inventory_on_hand WHERE location_id=$1 AND ingredient_name='Rice'",
          [L]
        )
      ).rows[0].quantity_on_hand
    )
  let invoice
  try {
    await t.test(
      'stores original document, draft and hash; downloads exact bytes',
      async () => {
        const response = await upload()
        assert.equal(response.status, 201)
        invoice = response.body
        assert.equal(invoice.status, 'needs_review')
        assert.equal(invoice.document_sha256.length, 64)
        const download = await fetch(`${base}/invoices/${invoice.id}/document`)
        assert.equal(download.status, 200)
        assert.match(download.headers.get('content-disposition'), /attachment/)
        assert.equal(
          await download.text(),
          '%PDF-1.4\n% fictional test invoice'
        )
        assert.equal(invoice.events.length, 1)
      }
    )
    await t.test(
      'incomplete approval and receiving are rejected without stock changes',
      async () => {
        const a = await call(`/invoices/${invoice.id}/review`, 'POST', {
          revision: 1,
          action: 'approved',
          note: '',
        })
        assert.equal(a.status, 400)
        const r = await call(`/invoices/${invoice.id}/receive`, 'POST', {
          confirmed: true,
          received_on: '2026-11-16',
        })
        assert.equal(r.status, 409)
        assert.equal(await total(), 7000)
      }
    )
    await t.test(
      'saves mapped lines with pack snapshots and exact decimal totals',
      async () => {
        const r = await call(`/invoices/${invoice.id}`, 'PUT', draft(1))
        assert.equal(r.status, 200)
        invoice = r.body
        assert.equal(invoice.revision, 2)
        assert.equal(Number(invoice.lines[0].line_total), 7)
        assert.equal(Number(invoice.lines[0].quantity_per_pack_base), 1000)
      }
    )
    await t.test(
      'invalid second line rolls back header, deletion and first line insertion',
      async () => {
        const before = invoice
        const bad = draft(2, 'CHANGED')
        bad.lines.push({
          ...bad.lines[0],
          supplier_item_id: '50000000-0000-0000-0000-000000000099',
        })
        const r = await call(`/invoices/${invoice.id}`, 'PUT', bad)
        assert.equal(r.status, 400)
        invoice = (await call(`/invoices/${invoice.id}`)).body
        assert.equal(invoice.invoice_number, before.invoice_number)
        assert.equal(invoice.revision, 2)
        assert.deepEqual(invoice.lines, before.lines)
      }
    )
    await t.test(
      'concurrent edits reject stale revision instead of losing an update',
      async () => {
        const responses = await Promise.all([
          call(`/invoices/${invoice.id}`, 'PUT', draft(2)),
          call(`/invoices/${invoice.id}`, 'PUT', draft(2)),
        ])
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409])
        invoice = (await call(`/invoices/${invoice.id}`)).body
      }
    )
    await t.test(
      'amount mismatch blocks approval and can be corrected',
      async () => {
        invoice = (
          await call(
            `/invoices/${invoice.id}`,
            'PUT',
            draft(invoice.revision, 'INV-TEST', { total_amount: 99 })
          )
        ).body
        assert.equal(
          (
            await call(`/invoices/${invoice.id}/review`, 'POST', {
              revision: invoice.revision,
              action: 'approved',
              note: '',
            })
          ).status,
          400
        )
        invoice = (
          await call(`/invoices/${invoice.id}`, 'PUT', draft(invoice.revision))
        ).body
      }
    )
    await t.test(
      'approval records reviewer and audit event without changing inventory; retry is idempotent',
      async () => {
        const payload = {
          revision: invoice.revision,
          action: 'approved',
          note: 'Verified',
        }
        const r = await call(`/invoices/${invoice.id}/review`, 'POST', payload)
        assert.equal(r.status, 200)
        invoice = r.body
        assert.equal(invoice.status, 'approved')
        assert.match(invoice.reviewed_by, /unverified/)
        assert.ok(invoice.reviewed_at)
        await call(`/invoices/${invoice.id}/review`, 'POST', payload)
        const reread = (await call(`/invoices/${invoice.id}`)).body
        assert.equal(
          reread.events.filter((e) => e.action === 'approved').length,
          1
        )
        assert.equal(await total(), 7000)
        assert.equal(
          (
            await call(
              `/invoices/${invoice.id}`,
              'PUT',
              draft(invoice.revision)
            )
          ).status,
          409
        )
        await assert.rejects(() =>
          db.query(
            'UPDATE restaurant.invoice_lines SET quantity=4 WHERE invoice_id=$1',
            [invoice.id]
          )
        )
        await assert.rejects(() =>
          db.query(
            'DELETE FROM restaurant.invoice_review_events WHERE invoice_id=$1',
            [invoice.id]
          )
        )
      }
    )
    await t.test(
      'same vendor/normalized number or same file cannot be approved again',
      async () => {
        let dup = (await upload()).body
        assert.ok(dup.possible_duplicates.some((d) => d.id === invoice.id))
        dup = (
          await call(`/invoices/${dup.id}`, 'PUT', draft(1, 'DIFFERENT-NUMBER'))
        ).body
        assert.equal(
          (
            await call(`/invoices/${dup.id}/review`, 'POST', {
              revision: dup.revision,
              action: 'approved',
              note: '',
            })
          ).status,
          409
        )
        let num = (await call('/invoices', 'POST', { location_id: L })).body
        num = (await call(`/invoices/${num.id}`, 'PUT', draft(1, ' inv-test ')))
          .body
        assert.equal(
          (
            await call(`/invoices/${num.id}/review`, 'POST', {
              revision: num.revision,
              action: 'approved',
              note: '',
            })
          ).status,
          409
        )
        assert.equal(
          (
            await call(`/invoices/${num.id}/review`, 'POST', {
              revision: num.revision,
              action: 'duplicate',
              note: '',
            })
          ).status,
          400
        )
        assert.equal(
          (
            await call(`/invoices/${num.id}/review`, 'POST', {
              revision: num.revision,
              action: 'duplicate',
              note: 'Confirmed duplicate',
            })
          ).body.status,
          'duplicate'
        )
      }
    )
    await t.test(
      'concurrent receipt confirmation posts exactly once and snapshots pack size',
      async () => {
        // Later catalog edits do not change the quantity reviewed on the invoice.
        await db.query(
          'UPDATE restaurant.supplier_items SET quantity_per_pack_base=2000 WHERE id=$1',
          [PACK]
        )
        const payload = { confirmed: true, received_on: '2026-11-16' }
        const rs = await Promise.all([
          call(`/invoices/${invoice.id}/receive`, 'POST', payload),
          call(`/invoices/${invoice.id}/receive`, 'POST', payload),
        ])
        assert.ok(rs.every((r) => r.status === 200))
        assert.equal(rs[0].body.receipt_id, rs[1].body.receipt_id)
        assert.equal(await total(), 9000)
        const n = await db.query(
          'SELECT count(*)::int n FROM restaurant.purchase_receipts WHERE source_reference=$1',
          [`INV:${invoice.id}`]
        )
        assert.equal(n.rows[0].n, 1)
        const movements = await db.query(
          'SELECT count(*)::int n FROM restaurant.inventory_movements'
        )
        assert.equal(movements.rows[0].n, 6)
      }
    )
    await t.test(
      'unmapped invoice stays editable until packs are matched for approval',
      async () => {
        let i = (await call('/invoices', 'POST', { location_id: L })).body
        const d = draft(1, 'UNMAPPED')
        d.lines[0].supplier_item_id = null
        i = (await call(`/invoices/${i.id}`, 'PUT', d)).body
        const review = await call(`/invoices/${i.id}/review`, 'POST', {
          revision: i.revision,
          action: 'approved',
          note: '',
        })
        assert.equal(review.status, 400)
        assert.match(review.body.error, /supplier pack/)
        assert.equal(
          (await call(`/invoices/${i.id}`)).body.status,
          'needs_review'
        )
        assert.equal(
          (
            await call(`/invoices/${i.id}/receive`, 'POST', {
              confirmed: true,
              received_on: '2026-11-16',
            })
          ).status,
          409
        )
        assert.equal(await total(), 9000)
      }
    )
    await t.test(
      'reject requires reason; reviewed invoice cannot transition back',
      async () => {
        let i = (await call('/invoices', 'POST', { location_id: L })).body
        i = (
          await call(`/invoices/${i.id}/review`, 'POST', {
            revision: 1,
            action: 'rejected',
            note: 'Unreadable original',
          })
        ).body
        assert.equal(i.status, 'rejected')
        assert.equal(
          (
            await call(`/invoices/${i.id}/review`, 'POST', {
              revision: i.revision,
              action: 'approved',
              note: '',
            })
          ).status,
          409
        )
      }
    )
    await t.test(
      'invalid files, dates, actor overrides, references and cross-site requests are blocked',
      async () => {
        assert.equal((await upload('<html>bad</html>')).status, 415)
        assert.equal((await upload('x'.repeat(10485761))).status, 400)
        const before = await readdir(uploads)
        assert.equal(
          (
            await upload(
              '%PDF-1.4\nwrong location',
              '20000000-0000-0000-0000-000000000099'
            )
          ).status,
          400
        )
        assert.deepEqual(await readdir(uploads), before)
        const i = (await call('/invoices', 'POST', { location_id: L })).body
        assert.equal(
          (
            await call(
              `/invoices/${i.id}`,
              'PUT',
              draft(1, 'INVALID-DATE', { invoice_date: '2026-02-30' })
            )
          ).status,
          400
        )
        assert.equal(
          (
            await call(
              `/invoices/${i.id}`,
              'PUT',
              draft(1, 'BAD-ACTOR', { reviewed_by: 'admin' })
            )
          ).status,
          400
        )
        assert.equal(
          (
            await call(
              '/invoices',
              'POST',
              { location_id: L },
              { origin: 'https://evil.example' }
            )
          ).status,
          403
        )
        assert.equal(
          (
            await call(
              '/invoices',
              'POST',
              { location_id: L },
              { 'x-pantry-request': '' }
            )
          ).status,
          403
        )
        const hostStatus = await new Promise((resolve, reject) => {
          const req = httpRequest(
            base + '/workspace',
            { headers: { host: 'evil.example' } },
            (res) => {
              res.resume()
              resolve(res.statusCode)
            }
          )
          req.on('error', reject)
          req.end()
        })
        assert.equal(hostStatus, 403)
        assert.equal(
          (
            await call('/workspace', 'GET', undefined, {
              'sec-fetch-site': 'cross-site',
            })
          ).status,
          403
        )
      }
    )
    await t.test(
      'database retains RLS and no browser-role access',
      async () => {
        await db.exec('CREATE ROLE anon; SET ROLE anon;')
        try {
          await assert.rejects(() =>
            db.query('SELECT * FROM restaurant.invoices')
          )
        } finally {
          await db.exec('RESET ROLE;')
        }
        assert.equal(
          (
            await db.query(
              "SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='restaurant' AND c.relkind='r' AND c.relrowsecurity"
            )
          ).rows[0].n,
          15
        )
      }
    )
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await db.close()
    await cleanup(dir)
  }
})

test('database and invoice records survive closing and reopening the backend', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pantry-backend-test-'))
  let db
  try {
    db = await openDatabase({ directory: path.join(dir, 'database') })
    const service = createService(db)
    let i = await service.create({ location_id: L })
    i = await service.save(i.id, draft(1, 'RESTART-CHECK'))
    await db.close()
    db = null
    db = await openDatabase({ directory: path.join(dir, 'database') })
    const loaded = await createService(db).detail(i.id)
    assert.equal(loaded.invoice_number, 'RESTART-CHECK')
    assert.equal(loaded.lines.length, 1)
    assert.equal(loaded.events.length, 2)
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int n FROM restaurant.brands WHERE id=$1',
          [DEMO_BRAND]
        )
      ).rows[0].n,
      1
    )
  } finally {
    if (db) await db.close()
    await cleanup(dir)
  }
})
