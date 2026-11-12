import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geminiBom,validateBomDraft} from '../supabase/functions/_shared/gemini-bom.js';
import {readStoredBom} from '../lib/bom-extraction-request.js';

const row={category:'turn',name:'GUIDE PIN',material:'P-20',finish_size_text:'ϕ44x233',rough_size_text:'ϕ46x235',size_text:'',remark:'',qty_required:4};
const draft={code:'1423TNRV0926',rows:[row,{...row,qty_required:null}],signoff:{prepared_by:'QA'},uncertainCells:['Turn Parts, row 2, quantity']};

test('Gemini BOM preserves repeated names and exact sizes, leaves unknown quantities for review and strips untrusted fields',()=>{
 const parsed=validateBomDraft({...draft,rows:draft.rows.map(r=>({...r,id:'external',update_id:'saved-part',two_d_submitted:true}))});
 assert.equal(parsed.rows.length,2);
 assert.equal(parsed.rows[0].finish_size_text,'ϕ44x233');
 assert.equal(parsed.rows[1].qty_required,'');
 assert.equal(parsed.rows[0].update_id,undefined);
 assert.equal(parsed.rows[0].id,undefined);
 assert.equal(parsed.rows[0].two_d_submitted,false);
 assert.throws(()=>validateBomDraft({...draft,rows:[{...row,category:'purchase'}]}),/INVALID_DRAFT/);
 assert.throws(()=>validateBomDraft({...draft,rows:[{...row,qty_required:-1}]}),/INVALID_DRAFT/);
});

test('Gemini requests structured output with the exact configured regular Flash model and no tools',async()=>{
 let request;
 const parsed=await geminiBom({image:'YWJj',mimeType:'image/png'},{key:'private-test-key',model:'gemini-3-flash-preview',fetchImpl:async(url,options)=>{
  request={url,options};return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(draft)}]}}]});
 }});
 assert.ok(request.url.endsWith('/gemini-3-flash-preview:generateContent'));
 assert.ok(!request.url.includes('private-test-key'));
 const body=JSON.parse(request.options.body);
 assert.equal(body.tools,undefined);
 assert.equal(body.generationConfig.responseMimeType,'application/json');
 assert.equal(parsed.rows[0].name,'GUIDE PIN');
});

test('Gemini fails safely on quota, refused or truncated output without falling back to a different model',async()=>{
 const input={image:'YWJj',mimeType:'image/png'};
 for(const [reply,reason]of [[new Response('private provider diagnostic',{status:429}),'QUOTA_EXCEEDED'],[Response.json({candidates:[{finishReason:'MAX_TOKENS'}]}),'INVALID_DRAFT']]){
  let calls=0;
  await assert.rejects(geminiBom(input,{key:'private-test-key',model:'gemini-3-flash-preview',fetchImpl:async()=>{calls++;return reply;}}),new RegExp(reason));
  assert.equal(calls,1);
 }
});

const jobId='00000000-0000-0000-0000-000000000801';
function client({role='operator',active=true,status='active',provider='gemini'}={}){
 const reads=[];
 return {reads,auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:table=>{
  const query={select:()=>query,eq:()=>query,is:()=>query,maybeSingle:async()=>({data:table==='users'?{role,active,archived_at:null}:table==='jobs'?{status}:table==='settings'?{value:provider}:null})};return query;
 },storage:{from:()=>({download:async path=>{
  reads.push(path);
  return {data:new Blob(['test'],{type:'image/png'})};
 }})}};
}

test('BOM extraction enforces roles, active accounts, live mould and same-mould private sources before calling Google',async()=>{
 for(const options of [{role:'viewer'},{active:false},{status:'finished'}]){
  const c=client(options);await assert.rejects(readStoredBom(c,{jobId,path:jobId+'/image.png'},{key:'key',model:'gemini-3-flash-preview'}),/NOT_ALLOWED/);assert.equal(c.reads.length,0);
 }
 const c=client();
 await assert.rejects(readStoredBom(c,{jobId,path:'another-mould/image.png'}),/INVALID_FILE/);
 const manual=client({provider:'manual'});
 await assert.rejects(readStoredBom(manual,{jobId,path:jobId+'/image.png'},{key:'key',model:'gemini-3-flash-preview'}),/NOT_CONFIGURED/);
 assert.equal(manual.reads.length,0);
 const output=await readStoredBom(c,{jobId,path:jobId+'/image.png'},{key:'key',model:'gemini-3-flash-preview',adapter:async()=>draft});
 assert.deepEqual(output,draft);
 assert.equal(c.reads.length,1);
});
