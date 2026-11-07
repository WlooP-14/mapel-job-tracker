import {createClient} from '@supabase/supabase-js';
import {canAssignRole} from '../../../lib/permissions';
import {isValidPhone,isValidPin} from '../../../lib/pin-auth';
export const runtime='nodejs';
const reply=(code,status)=>Response.json({code},{status,headers:{'Cache-Control':'no-store'}});
export async function POST(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,adminKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!adminKey)return reply('serverUnavailable',503);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply('notAllowed',403);
 const bearer=request.headers.get('authorization');if(!bearer?.startsWith('Bearer '))return reply('notAllowed',401);
 if(Number(request.headers.get('content-length'))>5000)return reply('invalid',400);
 try{
  const client=createClient(url,key,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await client.auth.getUser(bearer.slice(7));if(authError||!identity.user)return reply('notAllowed',401);
  const {data:actor,error:profileError}=await client.from('users').select('role,active,archived_at').eq('id',identity.user.id).single();if(profileError||!actor?.active||actor.archived_at||!['developer','admin'].includes(actor.role))return reply('notAllowed',403);
  const body=await request.json();if(!canAssignRole(actor.role,body.role))return reply('notAllowed',403);
  if(!isValidPhone(body.phone||'')||!isValidPin(body.pin||'')||typeof body.name!=='string'||!body.name.trim()||body.name.length>160)return reply('invalid',400);
  const admin=createClient(url,adminKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const exists=await admin.from('users').select('id').eq('phone',body.phone.trim()).limit(1);if(exists.error)return reply('invalid',500);if(exists.data.length)return reply('userExists',409);
  let account;
  for(let page=1;page<=100;page++){const r=await admin.auth.admin.listUsers({page,perPage:100});if(r.error)return reply('invalid',500);account=r.data.users.find(u=>u.phone===body.phone.trim().replace(/^\+/,''));if(account||r.data.users.length<100)break;if(page===100)return reply('invalid',503);}
  // Existing Auth accounts are never silently claimed or given a new password.
  if(account)return reply('userExists',409);
  const created=await admin.auth.admin.createUser({phone:body.phone.trim(),phone_confirm:true,password:body.pin});if(created.error)return reply('invalid',400);
  // Keep the acting administrator's JWT for RLS and the audit trigger.
  const inserted=await client.from('users').insert({id:created.data.user.id,name:body.name.trim(),phone:body.phone.trim(),role:body.role,active:true});
  if(inserted.error)return reply('invalid',500);
  return reply('userAdded',201);
 }catch{return reply('invalid',400);}
}
