import {test} from 'node:test';
import assert from 'node:assert/strict';
import {StitchClient} from '../lib/stitch-client.js';
test('Stitch parses split SSE responses and rejects write tools before sending',async()=>{
 let calls=0;
 const fetchImpl=async(url,options)=>{
  calls++;assert.equal(url,'https://stitch.googleapis.com/mcp');const request=JSON.parse(options.body);
  if(request.method==='initialize')return Response.json({id:request.id,result:{protocolVersion:'2025-03-26'}},{headers:{'Mcp-Session-Id':'test-session'}});
  assert.equal(options.headers['Mcp-Session-Id'],'test-session');
  if(request.method==='notifications/initialized')return new Response(null,{status:202});
  if(request.method==='tools/list')return Response.json({id:request.id,result:{tools:[{name:'list_projects',inputSchema:{type:'object'}},{name:'generate_screen'}]}});
  if(request.method==='tools/call'){
   const text=`data: ${JSON.stringify({id:request.id,result:{content:[{type:'text',text:'{"projects":[]}'}]}})}\r\n\r\n`;
   const stream=new ReadableStream({start(c){for(const ch of text)c.enqueue(new TextEncoder().encode(ch));c.close();}});
   return new Response(stream,{headers:{'Content-Type':'text/event-stream'}});
  }
  assert.fail('Unexpected method');
 };
 const client=new StitchClient('local-test-key',{fetchImpl});await client.connect();
 const result=await client.readTool('list_projects');assert.equal(result.content[0].text,'{"projects":[]}');
 const before=calls;await assert.rejects(client.readTool('generate_screen'),/Only existing-project/);assert.equal(calls,before);
});
test('Stitch connection fails closed on authentication errors without echoing credentials',async()=>{
 const client=new StitchClient('do-not-print',{fetchImpl:async()=>new Response('do-not-print',{status:403})});
 await assert.rejects(client.connect(),e=>e.message.includes('HTTP 403')&&!e.message.includes('do-not-print'));
});
