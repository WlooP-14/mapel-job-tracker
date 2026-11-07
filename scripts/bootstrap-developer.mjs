// Run only on a trusted computer. Credentials stay in .env.admin.local (gitignored).
import {createClient} from '@supabase/supabase-js';
const {SUPABASE_URL:url,SUPABASE_SECRET_KEY:key,DEVELOPER_PHONE:phone,DEVELOPER_NAME:name}=process.env;
if(!url||!key||!/^\+[1-9]\d{7,14}$/.test(phone||'')||!name?.trim()) {
 console.error('Set SUPABASE_URL, SUPABASE_SECRET_KEY, DEVELOPER_PHONE (+country code), and DEVELOPER_NAME in .env.admin.local.');process.exit(1);
}
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
try {
 const {count,error}=await client.from('users').select('id',{count:'exact',head:true}).eq('role','developer');
 if(error)throw Error('Cannot read users. Apply the migrations first.');
 if(count!==0)throw Error('A developer already exists. Use the existing developer account to manage access.');
 let user;
 for(let page=1;!user;page++){
  const {data,error}=await client.auth.admin.listUsers({page,perPage:100});
  if(error)throw Error('Cannot inspect Auth accounts. Check the server-only key.');
  user=data.users.find(u=>u.phone===phone.replace(/^\+/,''));
  if(data.users.length<100)break;
 }
 if(!user){
  const {data,error}=await client.auth.admin.createUser({phone,phone_confirm:true});
  if(error)throw Error('Cannot create the Auth account. Check the phone and Auth configuration.');
  user=data.user;
 }
 const {error:profileError}=await client.from('users').insert({id:user.id,name:name.trim(),phone,role:'developer',active:true});
 if(profileError)throw Error('Auth account exists but its developer profile could not be created. Inspect public.users in the dashboard before retrying.');
 console.log('First developer created. Sign in through the app using phone OTP.');
} catch(error){console.error(error.message);process.exitCode=1;}
