// Never starts on deployment. Default is inspection only; execution requires both
// --execute and KILL_WORKER_ENABLED=true in a separate operator environment.
import {createClient} from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import {executeWipe} from '../lib/kill-worker.js';
import {createPublicKey} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const env=process.env,ref=env.KILL_EXPECTED_PROJECT_REF;
if(!/^[a-z]{20}$/.test(ref||'')||env.SUPABASE_URL!==`https://${ref}.supabase.co`||!env.SUPABASE_SERVICE_ROLE_KEY||!env.KILL_WORKER_SECRET)throw Error('Configure the independent worker environment. No requests were made.');
const publicKey=createPublicKey(await readFile(env.BACKUP_PUBLIC_KEY_FILE,'utf8')).export({type:'spki',format:'pem'}).toString();
const client=createClient(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options={})=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})}});
async function call(action,data={}){const r=await client.rpc('developer_worker_op',{p_key:env.KILL_WORKER_SECRET,p_action:action,p_data:data});if(r.error)throw Error('WORKER_OPERATION_FAILED');return r.data;}
const execute=process.argv.includes('--execute')&&env.KILL_WORKER_ENABLED==='true';
if(!execute){console.log('Inspection only. Wiping is disabled.');const state=await call('inspect',{mailReady:false});console.log(JSON.stringify({enabled:state.enabled,backupPresent:Boolean(state.backup)}));process.exit(0);}
if(!env.SMTP_HOST||!env.SMTP_USER||!env.SMTP_PASSWORD||!env.DEVELOPER_NOTICE_TO||!env.DEVELOPER_NOTICE_FROM)throw Error('Configure developer email notifications before enabling the worker.');
const mail=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_PORT==='465',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},tls:{rejectUnauthorized:true}});
await mail.verify();
async function notices(){for(const item of await call('notifications')){
 await mail.sendMail({from:env.DEVELOPER_NOTICE_FROM,to:env.DEVELOPER_NOTICE_TO,subject:'Mould Job Tracker: '+item.kind,text:`Developer security event: ${item.kind}\nUTC time: ${item.created_at}\nDeveloper: ${item.user_id||'none'}\nRequest: ${item.request_id||'none'}\nIndependent backups were not accessed or deleted.`});
 await call('notification_sent',{id:item.id});
}}
async function once(){
 await notices();
 const state=await call('inspect',{mailReady:true});if(!state.enabled)return;
 await executeWipe({client,call,projectRef:ref,publicKey,enabled:true,mailReady:true,log:message=>console.log(message)});
 await notices();
}
do{try{await once();}catch{console.error('Worker stopped this attempt. The system remains frozen if execution already started; review before resuming. No credentials were logged.');if(!process.argv.includes('--watch'))process.exitCode=1;}
 if(!process.argv.includes('--watch'))break;
 await new Promise(resolve=>setTimeout(resolve,5000));
}while(true);
