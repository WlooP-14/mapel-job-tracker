import { CATEGORIES } from './bom.js';
import { businessDate, stageIsLate } from './scheduling.js';

function stageStatus(stage, today, statuses) {
 if (stage.status === 'NOT APPLICABLE') return statuses[4];
 if (stage.status === 'DONE') return statuses[0];
 if (stage.status === 'DELAY' || stageIsLate({ targetDate: stage.target_date, asOf: today, status: stage.status })) return statuses[3];
 return statuses[stage.started_on || stage.status === 'IN PROCESS' ? 1 : 2];
}

export function planWorkbook(job, { batches, parts, vendors }, t, today = businessDate()) {
 const { planning: p, workflow: w } = t;
 const x = p.planExport;
 const partsById = new Map(parts.map(part => [part.id, part]));
 const vendorNames = new Map(vendors.map(vendor => [vendor.id, vendor.name]));
 const rows = [];
 for (const batch of batches) {
  if (batch.archived_at) continue;
  for (const item of batch.batch_items || []) {
   const part = partsById.get(item.bom_item_id);
   if (item.archived_at || !part || part.archived_at) continue;
   const stages = part.part_steps.filter(stage => !stage.archived_at);
   const work = stages.filter(stage => stage.batch_id === batch.id && stage.step_name !== 'Received');
   rows.push({ batch, item, part, stages, work });
  }
 }
 rows.sort((a, b) => CATEGORIES.indexOf(a.part.category) - CATEGORIES.indexOf(b.part.category) || a.part.serial_no - b.part.serial_no);

 const orderedStages = [...new Set(rows.flatMap(row => row.work)
  .sort((a,b)=>(a.route_order??999)-(b.route_order??999))
  .map(stage=>stage.step_name))];
 const headers = [t.bom.serial, w.section, w.partName, x.sentQty, w.material, w.twoD, p.mode, p.sent, x.finishBy, x.returnedQty,
  ...orderedStages.flatMap(name => [x.vendor, t.stageNames[name] || name]), x.readyToAssemble];
 const widths = [7, 15, 30, 10, 13, 10, 13, 14, 14, 12, ...orderedStages.flatMap(() => [16, 12]), 14];
 const title = [x.title, job.mould_code, job.name].filter(Boolean).join(' · ');
 const meta = [{ value: title, columnSpan: headers.length, backgroundColor: '#FFE092', fontWeight: 'bold', height: 24 }, ...Array(headers.length - 1).fill(null)];
 const headings = headers.map(value => ({ value, fontWeight: 'bold', backgroundColor: '#BCEAF0', wrap: true, alignVertical: 'center', height: 34 }));
 const data = rows.map(({ batch, item, part, stages, work }, index) => {
  const applicable = stages.filter(stage => stage.status !== 'NOT APPLICABLE');
  const ready = applicable.length > 0 && applicable.every(stage => stage.status === 'DONE');
  const due = work.filter(stage => stage.status !== 'NOT APPLICABLE').map(stage => stage.target_date).filter(Boolean).sort().at(-1);
  const byName = new Map(work.map(stage => [stage.step_name, stage]));
  const values = [part.serial_no ?? '', t.tabs[CATEGORIES.indexOf(part.category)] || '', part.name, Number(item.qty_sent), part.material || '',
   part.two_d_submitted ? w.yes : w.no, p.modes[batch.mode] || '', batch.sent_on || '', due || '', Number(item.qty_back),
   ...orderedStages.flatMap(name => {
    const stage = byName.get(name);
    return stage ? [vendorNames.get(stage.vendor_id) || '', stageStatus(stage, today, t.statuses)] : ['', ''];
   }), ready ? w.yes : w.no];
  return values.map(value => ({ value, wrap: true, alignVertical: 'center', backgroundColor: index % 2 ? '#FFFFFF' : '#FFF8E7' }));
 });

 return [{ sheet: x.title, data: [meta, headings, ...data], columns: widths.map(width => ({ width })), stickyRowsCount: 2 }];
}
