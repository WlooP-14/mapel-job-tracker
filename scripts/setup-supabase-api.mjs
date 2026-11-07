import {readFile,writeFile,readdir,rename,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export async function setupViaApi({token,projectRef,apply=false,fetchImpl=fetch,root=process.cwd(),log=console.log}) {
 if(!/^sbp_/.test(token||''))throw Error('Save your Supabase personal access token in .env.setup.local as SUPABASE_ACCESS_TOKEN.');
 if(!/^[a-z]{20}$/.test(projectRef||''))throw Error('Set a valid SUPABASE_PROJECT_REF.');
 const base=`https://api.supabase.com/v1/projects/${projectRef}`;
 async function api(suffix='',body){
  let response;
  try{response=await fetchImpl(base+suffix,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});}catch{throw Error('Supabase API could not be reached. Check network access before retrying.');}
  if(!response.ok)throw Error(`Supabase API returned HTTP ${response.status} for ${suffix||'/project'}. Check the token scope and project access. No response body or credential has been logged.`);
  return response.json();
 }
 const project=await api();
 if(project.id!==projectRef)throw Error('Project identity mismatch. Stopped.');
 log(`Project verified: ${project.name} (${projectRef})`);
 const envPath=path.join(root,'.env.local');let env='';
 try{env=await readFile(envPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 const configured=env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g,'');
 if(configured&&configured!==`https://${projectRef}.supabase.co`)throw Error('.env.local points to another project. Resolve this before applying migrations.');
 const dir=path.join(root,'supabase','migrations');
 const files=(await readdir(dir)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort();
 let history=await api('/database/migrations');
 if(!Array.isArray(history))throw Error('Unexpected migration history response.');
 const names=files.map(f=>f.replace(/^\d+_/,'').replace(/\.sql$/,''));
 if(history.some(m=>!names.includes(m.name)))throw Error('This project has migrations outside this app. Review before continuing.');
 const tables=await api('/database/query',{query:"select tablename from pg_tables where schemaname='public'",read_only:true});
 if(!Array.isArray(tables))throw Error('Unexpected table inspection response.');
 if(history.length===0&&tables.length>0)throw Error('This project already has public tables without matching migration history. Stopped without changes.');
 const pending=files.filter((_,i)=>!history.some(m=>m.name===names[i]));
 log(`${pending.length} migration(s) pending. ${apply?'Applying foundation.':'Preview only; use --apply to execute.'}`);
 if(!apply)return {projectRef,pending};
 for(let i=0;i<files.length;i++){
  const name=names[i];let remote=history.find(m=>m.name===name);
  if(!remote){
   await api('/database/migrations',{name,query:(await readFile(path.join(dir,files[i]),'utf8')).replace(/^\uFEFF/,'')});
   history=await api('/database/migrations');remote=history.find(m=>m.name===name);
   if(!remote)throw Error('Migration applied but history could not be verified. Inspect dashboard before retrying.');
  }
  // API assigns versions. Align local filenames so later CLI pushes do not replay migrations.
  if(!/^\d+$/.test(remote.version))throw Error('Invalid remote migration version.');
  const aligned=`${remote.version}_${name}.sql`;
  if(aligned!==files[i]){
   let exists=false;try{await access(path.join(dir,aligned));exists=true;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(exists)throw Error('Local migration version conflicts; inspect migrations before proceeding.');
   await rename(path.join(dir,files[i]),path.join(dir,aligned));
  }
  log(`Verified migration: ${name}`);
 }
 const security=await api('/database/query',{query:"select tablename from pg_tables where schemaname='public' and not rowsecurity",read_only:true});
 if(!Array.isArray(security)||security.length)throw Error('Post-migration check failed: public tables without RLS.');
 const keys=await api('/api-keys?reveal=false');
 const publicKey=keys.find(k=>k.type==='publishable'&&k.disabled!==true&&k.api_key?.startsWith('sb_publishable_'));
 if(!publicKey)throw Error('Schema applied. Copy your publishable key into .env.local; no suitable public key was returned by the API.');
 const previousEnv=env;
 const values={NEXT_PUBLIC_SUPABASE_URL:`https://${projectRef}.supabase.co`,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:publicKey.api_key};
 for(const [key,value]of Object.entries(values)){const re=new RegExp(`^${key}=.*$`,'m');env=re.test(env)?env.replace(re,`${key}=${value}`):env.trimEnd()+`\n${key}=${value}\n`;}
 if(env.trimStart()!==previousEnv)await writeFile(envPath,env.trimStart(),{mode:0o600});
 log('Public app settings verified in .env.local. RLS check passed. Auth and independent backups are managed separately.');
 return {projectRef,pending:[]};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 setupViaApi({token:process.env.SUPABASE_ACCESS_TOKEN,projectRef:process.env.SUPABASE_PROJECT_REF,apply:process.argv.includes('--apply')}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
