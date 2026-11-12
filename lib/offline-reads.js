import {loadDraft,saveDraft,updateDraft} from './drafts.js';

const maxEntries=300;
const readRpcs=new Set(['team_actor_names','mould_trial_state']);

// The JWT subject partitions local data. Supabase still authorizes all network requests.
function subject(headers){
 try{
  const token=headers.get('authorization')?.split(' ')[1];
  const payload=token?.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const value=JSON.parse(atob(payload));
  return typeof value.sub==='string'?value.sub:null;
 }catch{return null;}
}

export function offlineFetch(projectUrl,networkFetch=fetch){
 const origin=new URL(projectUrl).origin;
 return async (input,options={})=>{
  const url=new URL(typeof input==='string'?input:input.url);
  const method=options.method||input.method||'GET';
  const headers=new Headers(options.headers||input.headers);
  const userId=subject(headers);
  const readRpc=method==='POST'&&url.pathname.startsWith('/rest/v1/rpc/')&&readRpcs.has(url.pathname.split('/').at(-1));
  const cacheable=userId&&url.origin===origin&&url.pathname.startsWith('/rest/v1/')&&((method==='GET'&&!url.pathname.includes('/rpc/'))||readRpc);
  if(!cacheable)return networkFetch(input,options);
  const cacheKey=`reads:${userId}:${origin}`;
  const queryKey=JSON.stringify([url.href,headers.get('accept'),headers.get('accept-profile'),headers.get('range'),headers.get('prefer'),readRpc?options.body:null]);

  async function cached(){
   const saved=(await loadDraft(cacheKey))?.find(row=>row.key===queryKey);
   if(!saved)throw new TypeError('No offline copy of this page');
   return new Response(saved.body,{status:saved.status,headers:saved.headers});
  }
  if(typeof navigator!=='undefined'&&!navigator.onLine)return cached();
  let response;
  try{response=await networkFetch(input,options);}
  catch(error){
   if(options.signal?.aborted||error?.name==='AbortError')throw error;
   return cached();
  }
  if(response.ok){
   const body=await response.clone().text();
   const saved={key:queryKey,body,status:response.status,headers:[...response.headers]};
   try{await updateDraft(cacheKey,rows=>[...(rows||[]).filter(row=>row.key!==queryKey),saved].slice(-maxEntries));}catch{/* Online reads still work if storage is full. */}
  }else if(response.status===401||response.status===403){
   await saveDraft(cacheKey,[]).catch(()=>{});
  }
  return response;
 };
}
