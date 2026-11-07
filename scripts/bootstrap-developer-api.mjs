// Obtain an administrative project key in memory only; never print or save it.
const token=process.env.SUPABASE_ACCESS_TOKEN,ref=process.env.SUPABASE_PROJECT_REF;
if(!token||!ref)throw Error('Management credentials are missing.');
try{
 const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Cannot obtain the administrative key (HTTP ${response.status}).`);
 const keys=await response.json();
 const key=keys.find(k=>k.name==='service_role'&&k.disabled!==true)||keys.find(k=>k.type==='secret'&&k.disabled!==true);
 if(!key?.api_key)throw Error('No usable administrative key is available.');
 process.env.SUPABASE_URL=`https://${ref}.supabase.co`;process.env.SUPABASE_SECRET_KEY=key.api_key;
 await import('./bootstrap-developer.mjs');
 delete process.env.SUPABASE_SECRET_KEY;
}catch(error){console.error(error.message);process.exitCode=1;}
