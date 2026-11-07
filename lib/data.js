import {paged} from './planning.js';

// Keep Supabase calls behind this boundary so another PostgreSQL API can replace it later.
export async function loadMoulds(client){
 const [jobs,customers,readiness]=await Promise.all([
  client.from('jobs').select('id,mould_code,name,customer_id,trial_date_t0,status,priority').is('archived_at',null).neq('status','archived').order('trial_date_t0',{ascending:true,nullsFirst:false}),
  client.from('customers').select('id,name').is('archived_at',null).order('name'),
  client.from('readiness').select('job_id,parts_total,parts_ready')
 ]);
 for(const result of [jobs,customers,readiness])if(result.error)throw result.error;
 return {jobs:jobs.data||[],customers:customers.data||[],readiness:readiness.data||[]};
}
export async function loadParts(client,jobId){
 const [parts,templates]=await Promise.all([
  paged(()=>client.from('bom_items').select('id,job_id,category,serial_no,name,material,finish_size_text,rough_size_text,size_text,remark,qty_required,two_d_submitted,part_steps(*)').eq('job_id',jobId).is('archived_at',null).order('serial_no').order('id')),
  client.from('step_templates').select('category,step_name,order_no').is('archived_at',null)
 ]);
 if(templates.error)throw templates.error;
 return parts.map(part=>({...part,part_steps:(part.part_steps||[]).filter(step=>!step.archived_at).sort((a,b)=>{
  const order=s=>s.step_name==='Received'?-1:s.route_order??templates.data.find(t=>t.category===part.category&&t.step_name===s.step_name)?.order_no??999;
  return order(a)-order(b);
 })}));
}
export async function createMould(client,form){
 const result=await client.rpc('create_mould',{p_code:form.code,p_name:form.name,p_trial:form.trial,p_priority:form.priority,p_customer:form.customer&&form.customer!=='new'?form.customer:null,p_new_customer:form.customer==='new'?form.customerName:null});
 if(result.error)throw result.error;
 const job=await client.from('jobs').select('id,mould_code,name,customer_id,trial_date_t0,status,priority').eq('id',result.data).single();if(job.error)throw job.error;return job.data;
}
export async function addPart(client,jobId,part){const result=await client.rpc('add_bom_item',{p_job:jobId,p_item:part});if(result.error)throw result.error;return result.data;}
