import {readFile,writeFile} from 'node:fs/promises';
try{
 const ref=process.env.SUPABASE_PROJECT_REF,token=process.env.SUPABASE_ACCESS_TOKEN;if(!ref||!token)throw Error('Local Management API configuration is required.');
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Cannot obtain the server-only credential.');
 const keys=await r.json(),key=keys.find(k=>k.name==='service_role'&&k.disabled!==true)||keys.find(k=>k.type==='secret'&&k.disabled!==true);if(!key?.api_key)throw Error('No server credential is available.');
 let env=await readFile('.env.local','utf8');const line='SUPABASE_SERVICE_ROLE_KEY='+key.api_key;env=/^SUPABASE_SERVICE_ROLE_KEY=.*$/m.test(env)?env.replace(/^SUPABASE_SERVICE_ROLE_KEY=.*$/m,()=>line):env.trimEnd()+'\n'+line+'\n';await writeFile('.env.local',env,{mode:0o600});console.log('Server-only provisioning credential configured in the gitignored local environment. No credential value was logged.');
}catch(error){console.error(error.message);process.exitCode=1;}
