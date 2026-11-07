import { stageIsLate, workingDaysBetween } from './scheduling.js';

export function summarizeOverview(jobs, stages, vendors, holidays, today) {
 const weekEnd = new Date(today + 'T00:00:00Z');
 weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
 const lastDay = weekEnd.toISOString().slice(0, 10);
 const active = jobs.filter(job => job.status === 'active');
 const activeIds = new Set(active.map(job => job.id));
 const upcoming = active.filter(job => job.trial_date_t0 >= today && job.trial_date_t0 <= lastDay);
 const lateParts = new Set();
 const lateMoulds = new Set();
 const byVendor = new Map();

 for (const stage of stages) {
  if (!activeIds.has(stage.bom_items.job_id)) continue;
  if (!stageIsLate({ targetDate: stage.target_date, asOf: today, status: stage.status })) continue;
  lateParts.add(stage.bom_item_id);
  lateMoulds.add(stage.bom_items.job_id);
  if (stage.mode !== 'outsourced' || !stage.started_on || !stage.vendor_id) continue;
  if (!byVendor.has(stage.vendor_id)) byVendor.set(stage.vendor_id, new Map());
  const parts = byVendor.get(stage.vendor_id);
  const delay = workingDaysBetween(stage.target_date, today, holidays);
  parts.set(stage.bom_item_id, Math.max(parts.get(stage.bom_item_id) || 0, delay));
 }

 const vendorDelays = [...byVendor].map(([id, parts]) => ({
  id,
  name: vendors.find(vendor => vendor.id === id)?.name,
  count: parts.size,
  average: [...parts.values()].reduce((sum, delay) => sum + delay, 0) / parts.size
 })).sort((a, b) => b.count - a.count || b.average - a.average);

 const attention = active.filter(job => lateMoulds.has(job.id) || (job.trial_date_t0 && job.trial_date_t0 <= lastDay));
 return { active: active.length, late: lateParts.size, upcoming, attention, vendorDelays, lastDay };
}

export async function loadOverviewData(client, activeIds, today) {
 const [vendorResult, holidayResult] = await Promise.all([
  client.from('vendors').select('id,name'),
  client.from('holidays').select('date').is('archived_at', null).lte('date', today)
 ]);
 if (vendorResult.error) throw vendorResult.error;
 if (holidayResult.error) throw holidayResult.error;
 const stages = [];
 for (let index = 0; index < activeIds.length; index += 50) {
  for (let offset = 0; ; offset += 500) {
   const result = await client.from('part_steps')
    .select('id,bom_item_id,target_date,status,mode,started_on,vendor_id,bom_items!inner(job_id,archived_at)')
    .in('bom_items.job_id', activeIds.slice(index, index + 50))
    .is('bom_items.archived_at', null).is('archived_at', null)
    .lt('target_date', today).neq('status', 'DONE').neq('status', 'NOT APPLICABLE')
    .order('id').range(offset, offset + 499);
   if (result.error) throw result.error;
   stages.push(...result.data);
   if (result.data.length < 500) break;
  }
 }
 return { stages, vendors: vendorResult.data, holidays: holidayResult.data.map(row => row.date) };
}
