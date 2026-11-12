// Called only with the server's Auth Admin client and its returned Auth user.
// Ignore existing IDs so a retry never resets an approved person's role or access.
export async function ensureRegistrationProfile(client,user){
 const name=user?.user_metadata?.full_name?.trim().replace(/\s+/g,' ');
 const phone='+'+String(user?.phone||'').replace(/^\+/, '');
 if(user?.app_metadata?.mjt_self_registration!==true||!user.id||!name||name.length>160||!/^\S+\s+\S/u.test(name)||!/^\+91\d{10}$/.test(phone)){
  throw Error('Invalid self-registration profile');
 }
 const result=await client.from('users').upsert({id:user.id,name,phone,role:'viewer',active:false},{onConflict:'id',ignoreDuplicates:true});
 if(result.error)throw Error('Registration profile could not be saved');
}
