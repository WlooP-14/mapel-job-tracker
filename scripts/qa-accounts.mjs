// Local integration fixtures only. Credentials stay in a gitignored file; never logged.
import {createClient} from '@supabase/supabase-js';
import {randomInt} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const path=new URL('../.env.qa.local',import.meta.url);
if(process.argv.includes('--archive')||process.argv.includes('--enable-viewer')){
 const raw=await readFile(path,'utf8');
 const enable=process.argv.includes('--enable-viewer');
 for(const role of enable?['VIEWER']:['OPERATOR','VIEWER']){const id=raw.match(new RegExp(`QA_${role}_ID=(.+)`))?.[1]?.trim();if(!id)throw Error('Missing fixture identifier');const r=await client.from('users').update({active:enable,archived_at:enable?null:new Date().toISOString()}).eq('id',id).like('name','QA mobile %');if(r.error)throw Error('QA profile operation failed');}
 console.log(enable?'Isolated QA viewer enabled for read-only screen checks.':'QA profiles deactivated and archived; Auth records and audit history retained.');
}else{
 try{await readFile(path);throw Error('QA fixture file already exists; refusing to reset credentials.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const lines=[];for(const [role,phone] of [['operator','+12025550171'],['viewer','+12025550172']]){const pin=String(randomInt(10000000,99999999));const auth=await client.auth.admin.createUser({phone,password:pin,phone_confirm:true});if(auth.error)throw Error('QA Auth creation failed');const id=auth.data.user.id;const profile=await client.from('users').insert({id,phone,name:'QA mobile '+role,role});if(profile.error)throw Error('QA profile creation failed');lines.push(`QA_${role.toUpperCase()}_ID=${id}`,`QA_${role.toUpperCase()}_PHONE=${phone}`,`QA_${role.toUpperCase()}_PIN=${pin}`);}
 await writeFile(path,lines.join('\n')+'\n',{flag:'wx'});console.log('Two isolated QA role fixtures created. Private credentials saved locally.');
}
