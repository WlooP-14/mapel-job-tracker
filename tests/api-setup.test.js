import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setupViaApi} from '../scripts/setup-supabase-api.mjs';
const ref='emrjfelkxbegkvyxszba';
test('API setup requires a local token without attempting requests',async()=>{
 let called=false;await assert.rejects(setupViaApi({projectRef:ref,fetchImpl:async()=>{called=true;}}),/personal access token/);assert.equal(called,false);
});
test('API setup applies and tracks a migration, writes only public credentials, and resumes safely',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'mould-api-test-'));const calls=[];const history=[];
 try{
 await mkdir(path.join(root,'supabase','migrations'),{recursive:true});
 await writeFile(path.join(root,'supabase','migrations','202611030001_foundation.sql'),'select 1;');
 const fetchImpl=async(url,options)=>{
  const route=url.replace(`https://api.supabase.com/v1/projects/${ref}`,'');calls.push([route,options.method]);
  let result;
  if(!route)result={id:ref,name:'Test'};
  else if(route==='/database/migrations'&&options.method==='GET')result=history;
  else if(route==='/database/migrations'){const {name,query}=JSON.parse(options.body);assert.equal(query,'select 1;');history.push({name,version:'20261103120000'});result={};}
  else if(route==='/database/query')result=[];
  else if(route==='/api-keys?reveal=false')result=[{type:'secret',api_key:'private-secret'},{type:'publishable',api_key:'sb_publishable_test'}];
  else throw Error('Unexpected endpoint');
  return Response.json(result);
 };
 const options={token:'sbp_test',projectRef:ref,root,fetchImpl,log:()=>{}};
 await setupViaApi(options);assert.equal(calls.some(([p,m])=>p==='/database/migrations'&&m==='POST'),false);
 await setupViaApi({...options,apply:true});
 const env=await readFile(path.join(root,'.env.local'),'utf8');assert.ok(env.includes('sb_publishable_test'));assert.ok(!env.includes('sbp_test'));assert.ok(!env.includes('private-secret'));
 assert.deepEqual(await readdir(path.join(root,'supabase','migrations')),['20261103120000_foundation.sql']);
 await setupViaApi({...options,apply:true});assert.equal(calls.filter(([p,m])=>p==='/database/migrations'&&m==='POST').length,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
