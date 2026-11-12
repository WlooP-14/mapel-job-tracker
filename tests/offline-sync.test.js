import {test} from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {loadDraft,saveDraft} from '../lib/drafts.js';
import {discardQueued,readQueue,retryQueued,saveOrQueue,syncQueue} from '../lib/offline-sync.js';
import {offlineFetch} from '../lib/offline-reads.js';

const browser=new EventTarget();
globalThis.window=browser;
let online=false;
Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>online});
const signal=new AbortController().signal;
const receipt=id=>({p_item:'part',p_receipt:id,p_qty:1,p_wrong:false,p_received_on:'2026-11-12',p_note:''});

function clientFor(user,execute){
 return {
  auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:user+'-token'}}})},
  rpc(operation,args){
   return {setHeader(name,value){assert.equal(name,'Authorization');assert.equal(value,`Bearer ${user}-token`);return execute(operation,args);}};
  }
 };
}

test('ten offline receipts survive storage reload and sync with the original IDs',async()=>{
 online=false;
 const client=clientFor('offline-ten',async()=>assert.fail('Offline save reached server'));
 await Promise.all(Array.from({length:10},(_,i)=>saveOrQueue(client,'offline-ten','record_receipt',receipt('receipt-'+i),'Mould A')));
 assert.equal((await loadDraft('sync:offline-ten')).length,10);
 await saveOrQueue(client,'offline-ten','record_receipt',receipt('receipt-0'),'Mould A');
 assert.equal((await readQueue('offline-ten')).length,10);
 online=true;
 const sent=[];
 await syncQueue(clientFor('offline-ten',async(operation,args)=>{sent.push([operation,args.p_receipt]);return {error:null};}),'offline-ten',signal);
 assert.equal(new Set(sent.map(([,id])=>id)).size,10);
 assert.equal((await readQueue('offline-ten')).length,0);
});

test('network failures retain queued data and conflicts wait for explicit review',async()=>{
 online=false;
 await saveOrQueue({},'conflict-user','record_receipt',receipt('conflict'),'Mould B');
 online=true;
 await syncQueue(clientFor('conflict-user',async()=>({error:{message:'network'},status:0})),'conflict-user',signal);
 assert.equal((await readQueue('conflict-user'))[0].failed,false);
 await syncQueue(clientFor('conflict-user',async()=>({error:{message:'MOULD_CLOSED'},status:400})),'conflict-user',signal);
 assert.equal((await readQueue('conflict-user'))[0].failed,true);
 await syncQueue(clientFor('conflict-user',async()=>assert.fail('Conflict retried without review')),'conflict-user',signal);
 await retryQueued('conflict-user','conflict');
 await syncQueue(clientFor('different-user',async()=>assert.fail('Another user sent the queue')),'conflict-user',signal);
 assert.equal((await readQueue('conflict-user')).length,1);
 await discardQueued('conflict-user','conflict');
 assert.equal((await readQueue('conflict-user')).length,0);
});

const token=user=>`header.${Buffer.from(JSON.stringify({sub:user})).toString('base64url')}.signature`;
const options=user=>({headers:{authorization:'Bearer '+token(user)}});

test('read cache separates users, preserves paging, and never masks permission errors',async()=>{
 online=true;
 const url='https://test.supabase.co/rest/v1/bom_items?offset=0';
 let result=()=>new Response(JSON.stringify([{id:'part'}]),{status:200,headers:{'Content-Type':'application/json'}});
 const fetcher=offlineFetch('https://test.supabase.co',async()=>result());
 await fetcher(url,options('cache-a'));
 online=false;
 assert.deepEqual(await (await fetcher(url,options('cache-a'))).json(),[{id:'part'}]);
 await assert.rejects(fetcher(url,options('cache-b')),/No offline copy/);
 await assert.rejects(fetcher(url.replace('offset=0','offset=500'),options('cache-a')),/No offline copy/);
 online=true;
 result=()=>new Response('{}',{status:403});
 assert.equal((await fetcher(url,options('cache-a'))).status,403);
 online=false;
 await assert.rejects(fetcher(url,options('cache-a')),/No offline copy/);
});

test('a lost server response retries the same receipt identifier',async()=>{
 online=true;
 let sent;
 await saveOrQueue({rpc:async()=>({error:{},status:0})},'lost-response','record_receipt',receipt('same-id'),'Mould C');
 await syncQueue(clientFor('lost-response',async(operation,args)=>{sent=args.p_receipt;return {error:{},status:0};}),'lost-response',signal);
 await syncQueue(clientFor('lost-response',async(operation,args)=>{assert.equal(args.p_receipt,sent);return {error:null};}),'lost-response',signal);
 assert.equal((await readQueue('lost-response')).length,0);
 await saveDraft('sync:lost-response',[]);
});
