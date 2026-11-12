import {loadDraft,updateDraft} from './drafts.js';

export const syncEvent='mjt-sync-change';
export const syncCompleteEvent='mjt-sync-complete';
const key=userId=>`sync:${userId}`;
const kinds={record_receipt:'p_receipt',record_work_returns:'p_request',allot_work:'p_batch'};
export const readQueue=async userId=>(await loadDraft(key(userId)))||[];
async function edit(userId,update){
 await updateDraft(key(userId),rows=>update(rows||[]));
 window.dispatchEvent(new Event(syncEvent));
}

export async function saveOrQueue(client,userId,operation,args,mould){
 const id=args[kinds[operation]];
 if(!id)throw Error('Missing retry identifier');
 const pending=await readQueue(userId);
 const earlier=pending.find(row=>row.id===id);
 if(earlier){
  if(earlier.operation!==operation||JSON.stringify(earlier.args)!==JSON.stringify(args))throw Error('Retry identifier already used');
  return true;
 }
 // Persist the intent before contacting the server, including when already online.
 await updateDraft(key(userId),rows=>{
  const records=rows||[];
  const existing=records.find(row=>row.id===id);
  if(existing){
   if(existing.operation!==operation||JSON.stringify(existing.args)!==JSON.stringify(args))throw Error('Retry identifier already used');
   return records;
  }
  return [...records,{id,operation,args,mould,failed:false}];
 });
 if(navigator.onLine&&!pending.length){
  const result=await client.rpc(operation,args);
  if(!result.error){await discardQueued(userId,id);return false;}
  if(result.status!==0){await discardQueued(userId,id);throw result.error;}
 }
 window.dispatchEvent(new Event(syncEvent));
 return true;
}

export const discardQueued=(userId,id)=>edit(userId,rows=>rows.filter(row=>row.id!==id));
export const retryQueued=(userId,id)=>edit(userId,rows=>rows.map(row=>row.id===id?{...row,failed:false}:row));

export async function syncQueue(client,userId,signal){
 async function drain(){
  for(const row of await readQueue(userId)){
   if(signal.aborted||!navigator.onLine||row.failed)break;
   const {data:{session}}=await client.auth.getSession();
   if(signal.aborted||session?.user.id!==userId)return;
   if(!kinds[row.operation]||row.args?.[kinds[row.operation]]!==row.id){
    await edit(userId,rows=>rows.map(item=>item.id===row.id?{...item,failed:true}:item));
    return;
   }
   const result=await client.rpc(row.operation,row.args).setHeader('Authorization',`Bearer ${session.access_token}`);
   if(!result.error){await discardQueued(userId,row.id);window.dispatchEvent(new Event(syncCompleteEvent));continue;}
   if(result.status===0||result.status===401||result.status===429||result.status>=500)return;
   await edit(userId,rows=>rows.map(item=>item.id===row.id?{...item,failed:true}:item));
   return;
  }
 }
 if(navigator.locks)return navigator.locks.request(key(userId),{ifAvailable:true},lock=>lock?drain():undefined);
 return drain();
}
