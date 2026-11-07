import {readFile,writeFile} from 'node:fs/promises';
import {randomInt} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const ref=process.env.SUPABASE_PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN,phone=process.env.DEVELOPER_PHONE;
if(!ref||!token||!phone)throw Error('Local setup/account configuration is missing.');
if(process.env.PIN_CONFIGURED==='true'){console.log('PIN already configured; no password reset was performed.');process.exit(0);}
try{
 const base=`https://api.supabase.com/v1/projects/${ref}`;
 async function api(endpoint,body){const r=await fetch(base+endpoint,{method:body?'PATCH':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Management request failed (HTTP ${r.status}) for ${endpoint}.`);return r.json();}
 const project=await api('');if(project.id!==ref)throw Error('Project mismatch.');
 await api('/config/auth',{external_phone_enabled:true,disable_signup:true,password_min_length:8});
 const keys=await api('/api-keys?reveal=true');
 const adminKey=keys.find(k=>k.name==='service_role'&&k.disabled!==true)||keys.find(k=>k.type==='secret'&&k.disabled!==true);
 const publicKey=keys.find(k=>k.type==='publishable'&&k.disabled!==true);
 if(!adminKey?.api_key||!publicKey?.api_key)throw Error('Required project keys are unavailable.');
 const options={auth:{persistSession:false,autoRefreshToken:false}};
 const admin=createClient(`https://${ref}.supabase.co`,adminKey.api_key,options);
 const {data:profile,error}=await admin.from('users').select('id,role').eq('phone',phone).eq('role','developer').single();if(error||!profile)throw Error('Developer profile is missing.');
 const pin=process.env.DEVELOPER_PIN||String(randomInt(0,10_000_000_000)).padStart(10,'0');
 let local=await readFile('.env.account.local','utf8');
 if(!process.env.DEVELOPER_PIN){local=local.trimEnd()+`\nDEVELOPER_PIN=${pin}\n`;await writeFile('.env.account.local',local,{mode:0o600});}
 const update=await admin.auth.admin.updateUserById(profile.id,{password:pin});if(update.error)throw Error('Developer PIN could not be initialized.');
 const client=createClient(`https://${ref}.supabase.co`,publicKey.api_key,options);
 const login=await client.auth.signInWithPassword({phone,password:pin});if(login.error)throw Error(`PIN login verification failed (${login.error.code||'unknown'}).`);
 const own=await client.from('users').select('role').eq('id',profile.id).single();if(own.error||own.data?.role!=='developer')throw Error('Authenticated developer role verification failed.');
 await client.auth.signOut({scope:'local'});
 await writeFile('.env.account.local',local.trimEnd()+'\nPIN_CONFIGURED=true\n',{mode:0o600});
 console.log('Phone + PIN login verified against hosted Supabase. Developer role confirmed. No SMS was sent. Initial PIN is in the gitignored .env.account.local file.');
}catch(error){console.error(error.message);process.exitCode=1;}
