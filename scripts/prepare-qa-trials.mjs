// Finish only the two remaining synthetic QA parts, without changing real moulds or settings.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createClient} from '@supabase/supabase-js';import {businessDate} from '../lib/scheduling.js';
assert.ok(process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('emrjfelkxbegkvyxszba'));
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}}),day=businessDate();
function uid(text){const h=createHash('sha256').update(text).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`}
async function call(name,args){const r=await client.rpc(name,args);assert.ok(!r.error,`${name} failed: ${r.error?.message}`);return r.data}
const login=await client.auth.signInWithPassword({phone:process.env.QA_OPERATOR_PHONE,password:process.env.QA_OPERATOR_PIN});assert.ok(!login.error,'QA operator login failed');
const job=await client.from('jobs').select('id,name,status').eq('mould_code','QA-MOBILE-1104').single();assert.equal(job.data?.name,'QA mobile workflow');assert.ok(['active','on_hold'].includes(job.data.status));
const items=await client.from('bom_items').select('id,name,category,material,qty_required').eq('job_id',job.data.id).is('archived_at',null).in('category',['base','child']);assert.equal(items.data?.length,2);
for(const item of items.data){assert.ok(['QA Top plate revised','QA Insert'].includes(item.name));const existing=await client.from('part_steps').select('batch_id').eq('bom_item_id',item.id).is('archived_at',null).not('batch_id','is',null).limit(1);let batch=existing.data?.[0]?.batch_id;
 if(!batch){batch=uid('qa-trials-batch:'+item.id);await call('allot_work',{p_job:job.data.id,p_batch:batch,p_items:[item.id],p_steps:['Squaring','Machining'],p_mode:'inhouse',p_vendor:null,p_stage_vendors:{},p_sent_on:day,p_label:'QA in-house '+item.material,p_reallot:false})}
 const steps=await client.from('part_steps').select('*').eq('bom_item_id',item.id).eq('batch_id',batch).is('archived_at',null).order('route_order');assert.ok(!steps.error);
 for(const step of steps.data.filter(s=>!['DONE','NOT APPLICABLE'].includes(s.status))){if(!step.started_on)await call('start_work_steps',{p_job:job.data.id,p_steps:[step.id],p_started:day});const qty=Number(item.qty_required)-Number(step.qty_completed);if(qty>0)await call('record_work_returns',{p_job:job.data.id,p_updates:[{step_id:step.id,qty}],p_day:day,p_note:'Synthetic QA completion for trial screen verification',p_request:uid('qa-trials-return:'+step.id+':'+step.qty_completed)})}
}
const ready=await client.from('readiness').select('parts_ready,parts_total').eq('job_id',job.data.id).single();assert.equal(ready.data?.parts_ready,5);assert.equal(ready.data?.parts_total,5);console.log('Synthetic QA mould: 5 of 5 parts ready for assembly/trials. No settings or real moulds changed.');
