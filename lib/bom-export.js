import {CATEGORIES} from './bom.js';
export function bomWorkbook(job,parts,sheets,t){
 return CATEGORIES.map((category,i)=>{const b=t.bom,hardware=category==='hardware',signoff=sheets.find(s=>s.section===category&&s.revision_no!==0)||{};return {sheet:t.tabs[i].slice(0,31),data:[[`${job.mould_code} ${job.name} ${t.tabs[i]}`],hardware?[b.serial,b.name,b.size,b.qty,b.remark]:[b.serial,b.name,b.finish,b.rough,b.material,b.qty],...parts.filter(p=>p.category===category).map((p,index)=>hardware?[index+1,p.name,p.size_text||'',Number(p.qty_required),p.remark||'']:[index+1,p.name,p.finish_size_text||'',p.rough_size_text||'',p.material||'',Number(p.qty_required)]),[],...['prepared_by','review_by','checked_by','order_by','sheet_date','received_by'].map(key=>[b[key],signoff[key]||''])]};});
}
