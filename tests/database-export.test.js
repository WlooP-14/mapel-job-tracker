import { test } from 'node:test';
import assert from 'node:assert/strict';
import readExcel from 'read-excel-file/node';
import writeExcel from 'write-excel-file/node';
import { databaseWorkbook } from '../lib/export.js';

test('the full Excel workbook includes trial and work history alongside all 24 tables', async () => {
 const records = {
  mould_events: [{ id: 'trial-1', kind: 'trial', details: { evidence: ['private.png'] } }],
  stage_returns: [{ id: 'return-1', qty: 2 }],
  jobs: [{ id: 'mould-1', mould_code: 'QA-EXPORT' }],
 };
 const client = {
  from: table => ({
   select: () => ({ range: async (from, to) => ({ data: (records[table] || []).slice(from, to + 1) }) })
  })
 };
 const workbook = await databaseWorkbook(client);
 const bytes = await writeExcel(workbook).toBuffer();
 const exported = await readExcel(bytes);
 assert.equal(exported.length, 24);
 assert.deepEqual(exported.find(sheet => sheet.sheet === 'mould_events').data, [
  ['id', 'kind', 'details'],
  ['trial-1', 'trial', '{"evidence":["private.png"]}'],
 ]);
 assert.deepEqual(exported.find(sheet => sheet.sheet === 'stage_returns').data, [
  ['id', 'qty'],
  ['return-1', 2],
 ]);
});
