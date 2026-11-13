import {createClient} from '@supabase/supabase-js';
export const dynamic='force-dynamic';
export async function GET(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)return Response.json({frozen:false,wipedAt:null,wiping:false},{headers:{'Cache-Control':'no-store'}});
 const c=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),r=await c.rpc('system_security_status');
 if(r.error&&r.error.code!=='PGRST202')return Response.json({unavailable:true},{status:503,headers:{'Cache-Control':'no-store'}});
 return Response.json(r.data||{frozen:false,wipedAt:null,wiping:false},{headers:{'Cache-Control':'no-store'}});
}
