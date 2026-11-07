import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeOverview } from '../lib/overview.js';

test('manager overview excludes unsent work from vendor delays and counts distinct late parts', () => {
 const jobs = [
  { id: 'a', status: 'active', trial_date_t0: '2026-11-07' },
  { id: 'b', status: 'active', trial_date_t0: '2026-11-14' },
  { id: 'c', status: 'on_hold', trial_date_t0: '2026-11-08' },
 ];
 const late = {
  bom_items: { job_id: 'a' }, bom_item_id: 'first', target_date: '2026-11-05',
  status: 'IN PROCESS', mode: 'outsourced', started_on: '2026-11-02', vendor_id: 'v'
 };
 const stages = [
  late,
  { ...late, target_date: '2026-11-06' },
  { ...late, bom_item_id: 'unsent', started_on: null },
  { ...late, bom_item_id: 'done', status: 'DONE' },
  { ...late, bom_item_id: 'held', bom_items: { job_id: 'c' } },
 ];
 const report = summarizeOverview(jobs, stages, [{ id: 'v', name: 'Vendor A' }], ['2026-11-06'], '2026-11-07');
 assert.equal(report.active, 2);
 assert.equal(report.late, 2);
 assert.deepEqual(report.upcoming.map(job => job.id), ['a']);
 assert.deepEqual(report.attention.map(job => job.id), ['a']);
 assert.deepEqual(report.vendorDelays, [{ id: 'v', name: 'Vendor A', count: 1, average: 1 }]);
});
