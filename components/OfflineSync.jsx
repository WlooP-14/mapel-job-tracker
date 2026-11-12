'use client';

import {useEffect,useState} from 'react';
import {discardQueued,readQueue,retryQueued,syncEvent,syncQueue} from '../lib/offline-sync';
import {Button} from './ui';

export default function OfflineSync({client,userId,t}){
 const [rows,setRows]=useState([]),[error,setError]=useState(false);
 const copy=t.offlineSync;
 useEffect(()=>{
  const controller=new AbortController();
  let running=false;
  const refresh=()=>readQueue(userId).then(data=>{if(!controller.signal.aborted)setRows(data);}).catch(()=>{});
  async function sync(){
   if(running||!navigator.onLine)return;
   running=true;
   try{await syncQueue(client,userId,controller.signal);}catch{/* Retry on the next check. */}
   finally{running=false;await refresh();}
  }
  function changed(){refresh();sync();}
  changed();
  const timer=setInterval(changed,10000);
  window.addEventListener('online',changed);
  window.addEventListener(syncEvent,changed);
  return ()=>{controller.abort();clearInterval(timer);window.removeEventListener('online',changed);window.removeEventListener(syncEvent,changed);};
 },[client,userId]);

 async function resolve(row,discard){
  if(discard&&!window.confirm(copy.confirmDiscard))return;
  try{
   setError(false);
   await (discard?discardQueued:retryQueued)(userId,row.id);
  }catch{setError(true);}
 }

 if(!rows.length&&!error)return null;
 return <aside className="notice space-y-2">
  <p role="status">{copy.pending.replace('{count}',rows.length)}</p>
  {error&&<p role="alert">{t.invalid}</p>}
  {rows.map(row=><div key={row.id} className="space-y-2">
   <p role={row.failed?'alert':undefined}>{row.mould} · {row.operation==='record_receipt'?copy.receipt:row.operation==='allot_work'?t.planning.title:copy.returned}{row.failed&&' · '+copy.review}</p>
   <div className="flex flex-wrap gap-2">{row.failed&&<Button onClick={()=>resolve(row,false)}>{t.workflow.retry}</Button>}<Button onClick={()=>resolve(row,true)}>{copy.discard}</Button></div>
  </div>)}
 </aside>;
}
