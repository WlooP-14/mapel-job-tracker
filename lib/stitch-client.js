export class StitchClient {
 constructor(apiKey,{fetchImpl=fetch}={}){if(!apiKey)throw Error('Save STITCH_API_KEY in .env.stitch.local.');this.key=apiKey;this.fetch=fetchImpl;this.id=0;this.tools=[];}
 async request(method,params,notification=false){
  const id=notification?undefined:++this.id;
  const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream','X-Goog-Api-Key':this.key};
  if(this.session)headers['Mcp-Session-Id']=this.session;
  if(this.protocol)headers['MCP-Protocol-Version']=this.protocol;
  let response;
  try{response=await this.fetch('https://stitch.googleapis.com/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',...(id===undefined?{}:{id}),method,params}),signal:AbortSignal.timeout(60000),redirect:'error'});}catch{throw Error('Could not reach the official Stitch MCP endpoint.');}
  if(!response.ok)throw Error(`Stitch returned HTTP ${response.status}. Check the key and account access.`);
  const session=response.headers.get('mcp-session-id');if(session)this.session=session;
  if(notification){await response.body?.cancel();return;}
  const processMessage=message=>{if(message.id!==id)return;if(message.error)throw Error(`Stitch MCP error ${message.error.code}; response text suppressed to protect credentials.`);return message.result;};
  if(response.headers.get('content-type')?.includes('application/json'))return processMessage(await response.json());
  if(!response.headers.get('content-type')?.includes('text/event-stream'))throw Error('Unsupported Stitch response type.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8_000_000)throw Error('Stitch response exceeded the size limit.');buffer=(buffer+decoder.decode(value,{stream:true})).replace(/\r\n/g,'\n');let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=event.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data){const result=processMessage(JSON.parse(data));if(result!==undefined)return result;}}}}finally{await reader.cancel();}
  throw Error('Stitch did not return a matching MCP response.');
 }
 async connect(){const init=await this.request('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mould-job-tracker-reference-fetcher',version:'0.1.0'}});this.protocol=init.protocolVersion;await this.request('notifications/initialized',{},true);let cursor;do{const result=await this.request('tools/list',cursor?{cursor}:{});this.tools.push(...result.tools);cursor=result.nextCursor;}while(cursor);return this.tools;}
 async readTool(name,args={}){if(!['list_projects','get_project','list_screens','get_screen'].includes(name))throw Error('Only existing-project and screen reads are allowed.');const tool=this.tools.find(t=>t.name===name);if(!tool)throw Error('Requested read tool is not advertised by Stitch.');for(const key of tool.inputSchema?.required||[])if(!(key in args))throw Error(`The read tool requires argument: ${key}`);return this.request('tools/call',{name,arguments:args});}
}
