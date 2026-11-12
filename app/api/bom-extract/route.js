import {createClient} from '@supabase/supabase-js';
import {readStoredBom} from '../../../lib/bom-extraction-request';
export const runtime='nodejs';
export const maxDuration=60;
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const bearer=request.headers.get('authorization');
 if(!bearer?.startsWith('Bearer '))return reply({code:'NOT_ALLOWED'},401);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return reply({code:'NOT_ALLOWED'},403);
 if(!url||!key)return reply({code:'NOT_CONFIGURED'},503);
 try{
  if(Number(request.headers.get('content-length'))>1500)return reply({code:'INVALID_FILE'},400);
  const text=await request.text();
  if(text.length>1500)return reply({code:'INVALID_FILE'},400);
  const body=JSON.parse(text);
  const client=createClient(url,key,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const draft=await readStoredBom(client,body,{key:process.env.GEMINI_API_KEY,model:process.env.BOM_GEMINI_MODEL,provider:process.env.BOM_EXTRACTION_PROVIDER});
  return reply({draft});
 }catch(error){
  const allowed=['NOT_ALLOWED','INVALID_FILE','NOT_CONFIGURED','QUOTA_EXCEEDED','PROVIDER_AUTH','PROVIDER_UNAVAILABLE','INVALID_DRAFT'];
  const code=allowed.includes(error.message)?error.message:'PROVIDER_UNAVAILABLE';
  return reply({code},error.status||(code==='QUOTA_EXCEEDED'?429:code==='INVALID_FILE'?400:502));
 }
}
