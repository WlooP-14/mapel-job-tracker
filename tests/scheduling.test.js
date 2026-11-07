import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addWorkingDays, workingDaysBetween, vendorDelayDays, stageIsLate, STAGE_DAYS,businessDate } from '../lib/scheduling.js';

test('business dates follow India midnight rather than the browser or server timezone',()=>{
 assert.equal(businessDate(new Date('2026-11-04T18:29:59Z')),'2026-11-04');
 assert.equal(businessDate(new Date('2026-11-04T18:30:00Z')),'2026-11-05');
});

test('working days exclude Sunday and configured holidays across months', () => {
  assert.equal(addWorkingDays('2026-01-31', 2, ['2026-02-02']), '2026-02-04');
  assert.equal(workingDaysBetween('2026-01-31', '2026-02-04', ['2026-02-02']), 2);
});
test('default stage durations are turning 4, hardening 2, grinding 3', () => {
  assert.deepEqual(STAGE_DAYS, { turning: 4, hardening: 2, grinding: 3 });
});
test('vendor delay uses actual sent date, not an earlier planned target', () => {
  assert.equal(vendorDelayDays({ sentOn: '2026-11-09', duration: 4, asOf: '2026-11-13', targetDate: '2026-11-10' }), 0);
  assert.equal(vendorDelayDays({ sentOn: '2026-11-09', duration: 4, asOf: '2026-11-16', targetDate: '2026-11-10' }), 2);
});
test('done and not applicable stages are never late', () => {
  for (const status of ['DONE', 'NOT APPLICABLE']) assert.equal(vendorDelayDays({ sentOn: '2026-11-09', duration: 4, asOf: '2026-11-20', status }), 0);
});

test('stage is late only after target passes and while unfinished', () => {
  assert.equal(stageIsLate({ targetDate: '2026-11-13', asOf: '2026-11-13', status: 'IN PROCESS' }), false);
  assert.equal(stageIsLate({ targetDate: '2026-11-13', asOf: '2026-11-14', status: 'IN PROCESS' }), true);
  assert.equal(stageIsLate({ targetDate: '2026-11-13', asOf: '2026-11-14', status: 'DONE' }), false);
});

