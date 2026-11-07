import { test } from 'node:test';
import assert from 'node:assert/strict';
import readExcel from 'read-excel-file/node';
import writeExcel from 'write-excel-file/node';
import { planWorkbook } from '../lib/plan-export.js';
import { messages } from '../locales/messages.js';

test('the work plan workbook includes both work locations and current batch progress', async () => {
 const job = { mould_code: 'QA-PLAN', name: 'Test mould', trial_date_t0: '2026-11-21', priority: 'normal' };
 const makeBatch = (id, mode) => ({
  id, mode, category: 'turn', sent_on: '2026-11-04',
  batch_items: [{ bom_item_id: id, qty_sent: 4, qty_back: 2 }, { bom_item_id: 'removed', archived_at: '2026-11-06' }]
 });
 const makePart = (id, mode, vendor_id) => ({
  id, category: 'turn', serial_no: 1, name: id, qty_required: 4,
  part_steps: [
   { batch_id: id, step_name: 'Turning', mode, vendor_id, started_on: '2026-11-04', target_date: '2026-11-09', status: 'IN PROCESS' },
   { batch_id: id, step_name: 'Hardening', status: 'NOT APPLICABLE' }
  ]
 });
 const data = {
  batches: [makeBatch('Shop part', 'inhouse'), makeBatch('Vendor part', 'outsourced')],
  parts: [makePart('Shop part', 'inhouse'), makePart('Vendor part', 'outsourced', 'vendor')],
  vendors: [{ id: 'vendor', name: 'Stage Vendor' }]
 };
 const workbook = planWorkbook(job, data, messages.en, '2026-11-07');
 const sheets = await readExcel(await writeExcel(workbook).toBuffer());
 assert.equal(sheets.length, 1);
 const [title, headers, shop, vendor] = sheets[0].data;
 assert.match(title[0], /QA-PLAN/);
 assert.deepEqual(headers.slice(10), ['Stage vendor', 'Turning', 'Stage vendor', 'Hardening', 'Ready to assemble']);
 assert.deepEqual(shop.slice(6), ['In-house', '2026-11-04', '2026-11-09', 2, null, 'Working', null, 'Not needed', 'No']);
 assert.deepEqual(vendor.slice(6), ['Outsourced', '2026-11-04', '2026-11-09', 2, 'Stage Vendor', 'Working', null, 'Not needed', 'No']);
 assert.equal(sheets[0].data.length, 4);
});
