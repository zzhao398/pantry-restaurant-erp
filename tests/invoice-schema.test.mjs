import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : '@electric-sql/pglite');
const db = new PGlite();
const B = '10000000-0000-0000-0000-000000000001';
const L = '20000000-0000-0000-0000-000000000001';
const Q = '20000000-0000-0000-0000-000000000002';
const V = '30000000-0000-0000-0000-000000000001';
const R = '70000000-0000-0000-0000-000000000001';
let passed = 0;
async function check(name, fn) { await fn(); console.log(`PASS ${name}`); passed++; }
async function reject(sql) { await assert.rejects(() => db.query(sql)); }
const invoice = async (extra = '', values = '') => (await db.query(`INSERT INTO restaurant.invoices(brand_id,location_id${extra}) VALUES ('${B}','${L}'${values}) RETURNING id`)).rows[0].id;
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for (const name of ['001_schema.sql','002_demo.sql','005_invoice_schema.sql']) {
    await db.exec(await readFile(new URL(`../database/${name}`,import.meta.url),'utf8'));
  }
  await check('Hosted verification query passes against an empty invoice supplement', async () => {
    const result = await db.query(await readFile(new URL('../database/006_verify_invoice_schema.sql', import.meta.url),'utf8'));
    assert.ok(result.rows.every(r => r.passed));
  });
  const draft = await invoice();
  await check('Incomplete upload is allowed for review but cannot be approved', async () => {
    await reject(`UPDATE restaurant.invoices SET status='approved' WHERE id='${draft}'`);
  });
  await check('Only a matching supplier and location can link a receipt', async () => {
    await reject(`UPDATE restaurant.invoices SET receipt_id='${R}' WHERE id='${draft}'`);
    await reject(`UPDATE restaurant.invoices SET supplier_id='${V}', receipt_id='${R}',location_id='${Q}' WHERE id='${draft}'`);
    await db.query(`UPDATE restaurant.invoices SET supplier_id='${V}',receipt_id='${R}' WHERE id='${draft}'`);
  });
  await check('Cross-brand invoice, ingredient and review references are rejected', async () => {
    const other = '10000000-0000-0000-0000-000000000002';
    await db.query(`INSERT INTO restaurant.brands(id,name) VALUES ('${other}','Other demo')`);
    await reject(`INSERT INTO restaurant.invoices(brand_id,location_id) VALUES ('${other}','${L}')`);
    await reject(`INSERT INTO restaurant.invoice_lines(brand_id,invoice_id,line_number,description) VALUES ('${other}','${draft}',1,'Rice')`);
    await reject(`INSERT INTO restaurant.invoice_review_events(brand_id,invoice_id,action,reviewer_label) VALUES ('${other}','${draft}','saved','Test reviewer')`);
  });
  await check('Line numbers and quantities are validated', async () => {
    await db.query(`INSERT INTO restaurant.invoice_lines(brand_id,invoice_id,line_number,description,quantity,unit_price,line_total) VALUES ('${B}','${draft}',1,'Rice',2,5,10)`);
    await reject(`INSERT INTO restaurant.invoice_lines(brand_id,invoice_id,line_number,description) VALUES ('${B}','${draft}',1,'Duplicate line')`);
    await reject(`UPDATE restaurant.invoice_lines SET quantity=-1 WHERE invoice_id='${draft}'`);
    await reject(`UPDATE restaurant.invoice_lines SET unit_price='NaN' WHERE invoice_id='${draft}'`);
  });
  await check('A second approved invoice number is rejected while a duplicate review record is retained', async () => {
    await db.query(`UPDATE restaurant.invoices SET invoice_number='INV-TEST',invoice_date='2026-11-09',total_amount=10,reviewed_by='Test reviewer',reviewed_at=now(),status='approved' WHERE id='${draft}'`);
    const duplicate = await invoice(',supplier_id,invoice_number,invoice_date,total_amount,reviewed_by,reviewed_at',`, '${V}',' inv-test ','2026-11-09',10,'Test reviewer',now()`);
    await reject(`UPDATE restaurant.invoices SET status='approved' WHERE id='${duplicate}'`);
    await db.query(`UPDATE restaurant.invoices SET status='duplicate' WHERE id='${duplicate}'`);
  });
  await check('Review events can reference the correct invoice', async () => {
    await db.query(`INSERT INTO restaurant.invoice_review_events(brand_id,invoice_id,action,reviewer_label,note) VALUES ('${B}','${draft}','approved','Test reviewer','Checked sample invoice')`);
  });
  await check('Invoice approval does not create inventory movements', async () => {
    assert.equal(Number((await db.query('SELECT count(*) n FROM restaurant.inventory_movements')).rows[0].n),5);
    assert.equal(Number((await db.query(`SELECT quantity_on_hand n FROM restaurant.inventory_on_hand WHERE location_id='${L}' AND ingredient_name='Rice'`)).rows[0].n),7000);
  });
  await check('API roles still cannot access invoice tables', async () => {
    for (const role of ['anon','authenticated']) {
      await db.exec(`SET ROLE ${role}`);
      try { await reject('SELECT * FROM restaurant.invoices'); }
      finally { await db.exec('RESET ROLE'); }
    }
  });
  console.log(`ALL ${passed} INVOICE SCHEMA CHECKS PASSED`);
} finally { await db.close(); }
