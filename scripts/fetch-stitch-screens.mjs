import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {StitchClient} from '../lib/stitch-client.js';
const unwrap=result=>result.structuredContent||JSON.parse(result.content.find(x=>x.text)?.text||'{}');
async function download(url,target){
 const u=new URL(url);if(u.protocol!=='https:'||!(u.hostname.endsWith('.googleusercontent.com')||u.hostname==='storage.googleapis.com'||u.hostname==='stitch.googleapis.com'))throw Error('Unrecognized design-asset host.');
 const response=await fetch(u,{headers:u.hostname==='stitch.googleapis.com'?{'X-Goog-Api-Key':process.env.STITCH_API_KEY}:{},redirect:'error',signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`Asset download HTTP ${response.status}`);
 let bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>15_000_000)throw Error('Design asset exceeds limit.');
 if(response.headers.get('content-type')?.includes('application/json')){const payload=JSON.parse(bytes);if(typeof payload.dataString!=='string')throw Error('Unexpected Stitch asset envelope.');bytes=payload.imageMetadata?Buffer.from(payload.dataString,'base64'):Buffer.from(payload.dataString,'utf8');if(payload.imageMetadata?.mimeType==='image/jpeg')target=target.replace(/\.png$/,'.jpg');}
 await writeFile(target,bytes);return target;
}
try{
 const cached=unwrap(JSON.parse(await readFile('design/stitch/list_projects.json','utf8')));
 const project=cached.projects.find(p=>p.title==='Mould Job Tracker');if(!project)throw Error('Mould Job Tracker project was not found.');
 const client=new StitchClient(process.env.STITCH_API_KEY);await client.connect();
 const inventory=unwrap(await client.readTool('list_screens',{projectId:project.name.split('/')[1]}));
 await mkdir('design/stitch/screens',{recursive:true});
 const screens=inventory.screens||[];let next=0;const results=[];
 await Promise.all(Array.from({length:4},async()=>{
  while(next<screens.length){const listed=screens[next++];const id=listed.name.split('/').at(-1);const result={id,title:listed.title};
   try{
    let raw;try{raw=JSON.parse(await readFile(`design/stitch/screens/${id}.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;raw=await client.readTool('get_screen',{name:listed.name});}const detail=unwrap(raw);const screen=detail.screen||detail;
    await writeFile(`design/stitch/screens/${id}.json`,JSON.stringify(raw,null,2));
    if(screen.screenshot?.downloadUrl)result.screenshot=await download(screen.screenshot.downloadUrl,`design/stitch/screens/${id}.png`);
    if(screen.htmlCode?.downloadUrl)result.html=await download(screen.htmlCode.downloadUrl,`design/stitch/screens/${id}.html`);
    result.width=screen.width;result.height=screen.height;
   }catch(error){result.error=error.message;}
   results.push(result);
  }
 }));
 const report={project:project.name,title:project.title,fetchedAt:new Date().toISOString(),screens:results.sort((a,b)=>a.title.localeCompare(b.title))};
 await writeFile('design/stitch/manifest.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({project:project.title,screens:results.length,screenshots:results.filter(x=>x.screenshot).length,html:results.filter(x=>x.html).length,failures:results.filter(x=>x.error)},null,2));if(results.some(x=>x.error))process.exitCode=1;
}catch(error){console.error(error.message);process.exitCode=1;}
