import {extractBom} from './extract-bom.js';
import {geminiBom} from '../supabase/functions/_shared/gemini-bom.js';

export async function readStoredBom(client,{jobId,path},{key,model,provider='manual',adapter=geminiBom}={}){
 const fail=(code,status)=>{throw Object.assign(Error(code),{status});};
 if(!/^[0-9a-f-]{36}$/i.test(jobId||'')||typeof path!=='string'||path.length>400||!path.startsWith(jobId+'/')||path.includes('..'))fail('INVALID_FILE',400);
 const {data:identity,error:authError}=await client.auth.getUser();
 if(authError||!identity?.user)fail('NOT_ALLOWED',401);
 const {data:profile,error:profileError}=await client.from('users').select('role,active,archived_at').eq('id',identity.user.id).maybeSingle();
 if(profileError||!profile?.active||profile.archived_at||!['admin','developer','operator'].includes(profile.role))fail('NOT_ALLOWED',403);
 const job=await client.from('jobs').select('status,archived_at').eq('id',jobId).maybeSingle();
 if(job.error||!job.data||job.data.archived_at||!['active','on_hold'].includes(job.data.status))fail('NOT_ALLOWED',403);
 const setting=await client.from('settings').select('value').eq('key','bom_extraction_provider').is('archived_at',null).maybeSingle();
 if(setting.error)fail('NOT_CONFIGURED',503);
 const selected=setting.data?.value??provider;
 if(selected!=='gemini'||!key||!model)fail('NOT_CONFIGURED',503);
 const source=await client.storage.from('bom-sources').download(path);
 if(source.error||!source.data)fail('INVALID_FILE',400);
 const file=source.data;
 if(file.size>10485760||!file.size)fail('INVALID_FILE',400);
 const mimeType=file.type.split(';')[0];
 if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(mimeType))fail('INVALID_FILE',400);
 const image=Buffer.from(await file.arrayBuffer()).toString('base64');
 return extractBom({image,mimeType},{provider:selected,adapters:{gemini:data=>adapter(data,{key,model})}});
}
