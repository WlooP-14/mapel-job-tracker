import {createClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {businessDate} from '../lib/scheduling.js';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;if(url!=='https://emrjfelkxbegkvyxszba.supabase.co')throw Error('Unexpected project');
const c=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=await c.auth.signInWithPassword({phone:process.env.QA_OPERATOR_PHONE,password:process.env.QA_OPERATOR_PIN});if(auth.error)throw Error('QA operator unavailable');
const job=await c.from('jobs').select('id,name').eq('mould_code','QA-MOBILE-1104').single();if(job.error||!job.data.name.startsWith('QA '))throw Error('QA mould unavailable');
const parts=await c.from('bom_items').select('id,name,qty_required').eq('job_id',job.data.id).is('archived_at',null);if(parts.error||parts.data.some(p=>!p.name.startsWith('QA ')))throw Error('Unexpected fixture parts');
const checks=await c.from('receiving_checks').select('bom_item_id,qty_found,result,archived_at').in('bom_item_id',parts.data.map(p=>p.id));if(checks.error)throw Error('Receipts unavailable');
let count=0;for(const part of parts.data){const total=checks.data.filter(r=>r.bom_item_id===part.id&&!r.archived_at&&r.result!=='wrong').reduce((n,r)=>n+Number(r.qty_found),0),remaining=Number(part.qty_required)-total;if(remaining<=0)continue;const h=createHash('sha256').update('qa-planning-receipt-v1:'+part.id).digest('hex'),id=`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;const result=await c.rpc('record_receipt',{p_item:part.id,p_receipt:id,p_qty:remaining,p_wrong:false,p_received_on:businessDate(),p_note:'QA planning preparation'});if(result.error)throw Error('Fixture receipt failed');count++;}
console.log(`Recorded ${count} missing receipts on the isolated QA mould. Existing events retained.`);
