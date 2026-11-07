import {createClient} from '@supabase/supabase-js';
import {isTeamPin,teamPinPassword} from '../../../lib/pin-auth';

export const runtime='nodejs';
const reply=(status)=>Response.json({}, {status,headers:{'Cache-Control':'no-store'}});

export async function POST(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)return reply(503);
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)return reply(403);

 try{
  if(Number(request.headers.get('content-length'))>2048)return reply(400);
  const text=await request.text();
  if(text.length>2048)return reply(400);
  const body=JSON.parse(text);
  if(typeof body?.name!=='string'||typeof body.phone!=='string'||typeof body.pin!=='string')return reply(400);
  const name=body.name.trim().replace(/\s+/g,' ');
  if(name.length>160||!/^\S+\s+\S/u.test(name)||!/^\+91\d{10}$/.test(body.phone)||!isTeamPin(body.pin))return reply(400);

  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {error}=await client.auth.admin.createUser({
   phone:body.phone,phone_confirm:true,password:teamPinPassword(body.pin),
   app_metadata:{mjt_self_registration:true},user_metadata:{full_name:name}
  });
  if(error)return reply(error.status===429?429:['phone_exists','user_already_exists'].includes(error.code)?409:503);
  return reply(201);
 }catch(error){return reply(error instanceof SyntaxError?400:503);}
}
