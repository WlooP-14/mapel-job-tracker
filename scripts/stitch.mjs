import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {StitchClient} from '../lib/stitch-client.js';
try{
 const client=new StitchClient(process.env.STITCH_API_KEY);const tools=await client.connect();
 await mkdir('design/stitch',{recursive:true});
 await writeFile('design/stitch/tools.json',JSON.stringify(tools,null,2));
 console.log('Connected to Google Stitch. Available read tools: '+tools.filter(t=>['list_projects','get_project','list_screens','get_screen'].includes(t.name)).map(t=>t.name).join(', '));
 const tool=process.argv[2]||'list_projects';
 const args=process.argv[3]?JSON.parse(await readFile(process.argv[3],'utf8')):{};
 const result=await client.readTool(tool,args);
 await writeFile(`design/stitch/${tool}.json`,JSON.stringify(result,null,2));
 console.log(`Saved ${tool} result to design/stitch/${tool}.json`);
 if(result.isError){console.error('Stitch reported a read error. Inspect the saved result locally.');process.exitCode=1;}
}catch(error){console.error(error.message);process.exitCode=1;}
