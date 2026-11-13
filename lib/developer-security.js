import {createHash,createPublicKey,verify,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';

export const hash=value=>createHash('sha256').update(value).digest('hex');
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function verifyBackupReceipt(receipt,publicKey,projectRef,{now=Date.now(),allowOld=false}={}){
 try{
  const p=receipt?.payload;
  if(!p||p.projectRef!==projectRef||p.independent!==true||p.appCanDelete!==false||p.workerCanDelete!==false||!Array.isArray(p.includes)||!['database','auth','storage'].every(k=>p.includes.includes(k))||!/^\w[\w-]{0,100}$/.test(p.id||'')||!/^[a-f0-9]{64}$/.test(p.snapshotSha256||'')||typeof receipt.signature!=='string')throw Error();
  const completed=Date.parse(p.completedAt),restored=Date.parse(p.restoreTestedAt);
  if(!Number.isFinite(completed)||!Number.isFinite(restored)||completed>now+60000||restored>now+60000||(!allowOld&&(completed<now-86400000||restored<now-30*86400000)))throw Error();
  const key=createPublicKey(publicKey);
  if(key.asymmetricKeyType!=='ed25519'||!verify(null,Buffer.from(canonical(p)),key,Buffer.from(receipt.signature,'base64url')))throw Error();
  const digest=hash(canonical(p)+'.'+receipt.signature);
  if(receipt.digest&&receipt.digest!==digest)throw Error();
  return {payload:p,signature:receipt.signature,digest};
 }catch{throw Error('BACKUP_NOT_VERIFIED');}
}
export function trustedRp(requestUrl,env=process.env){
 const requested=new URL(requestUrl),configured=new URL(env.DEVELOPER_APP_ORIGIN||'https://mapel-job-tracker.vercel.app');
 const local=env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(requested.hostname);
 if(!local&&(requested.origin!==configured.origin||configured.protocol!=='https:'))throw Error('ORIGIN_REJECTED');
 return {origin:local?requested.origin:configured.origin,rpID:local?requested.hostname:configured.hostname};
}
export function sessionClaims(token){
 try{const p=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());if(typeof p.session_id!=='string')throw Error();return p;}catch{throw Error('SESSION_REQUIRED');}
}
export function freshAal2(token,now=Date.now()){
 const p=sessionClaims(token);
 if(p.aal!=='aal2'||!p.amr?.some(v=>['totp','mfa/totp'].includes(v.method)&&v.timestamp*1000>=now-300000&&v.timestamp*1000<=now+30000))throw Error('FRESH_MFA_REQUIRED');
 return p.session_id;
}
export function securityClients(env=process.env){
 const url=env.NEXT_PUBLIC_SUPABASE_URL,key=env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||env.NEXT_PUBLIC_SUPABASE_ANON_KEY,secret=env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key||!secret)throw Error('SECURITY_NOT_CONFIGURED');
 return {url,key,service:createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}})};
}
export async function developerIdentity(request,clients){
 const auth=request.headers.get('authorization');if(!auth?.startsWith('Bearer '))throw Error('DEVELOPER_ONLY');
 const token=auth.slice(7),identity=await clients.service.auth.getUser(token);
 if(identity.error||!identity.data.user)throw Error('DEVELOPER_ONLY');
 const p=await clients.service.from('users').select('id,name,role,active,archived_at').eq('id',identity.data.user.id).maybeSingle();
 if(p.error||!p.data?.active||p.data.archived_at||p.data.role!=='developer')throw Error('DEVELOPER_ONLY');
 return {token,user:identity.data.user,profile:p.data,sessionId:sessionClaims(token).session_id};
}
export async function securityOp(service,user,action,data={}){
 const r=await service.rpc('developer_security_op',{p_user:user,p_action:action,p_data:data});
 if(r.error)throw Error(r.error.code==='PGRST202'?'SECURITY_NOT_CONFIGURED':r.error.message);
 return r.data;
}
export function readiness(state,env=process.env,now=Date.now()){
 const missing=[];let backup;
 try{backup=verifyBackupReceipt(state.backup,state.backupPublicKey,new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0],{now});}catch{missing.push('backup');}
 if(state.devices.length<2)missing.push('devices');
 if(!state.workerConfigured||!state.workerSeenAt||Date.parse(state.workerSeenAt)<now-900000)missing.push('worker');
 if(!state.notificationReady)missing.push('notifications');
 if(env.KILL_SWITCH_ENABLED!=='true'||!state.wipeEnabled)missing.push('activation');
 if(state.lockedUntil&&Date.parse(state.lockedUntil)>now)missing.push('locked');
 return {ready:!missing.length,missing,backup};
}
export async function registrationOptions(identity,state,rp){
 return generateRegistrationOptions({rpName:'Mould Job Tracker',rpID:rp.rpID,userName:identity.profile.name,userID:new TextEncoder().encode(identity.user.id),attestationType:'none',excludeCredentials:state.devices.map(d=>({id:d.credential_id})),authenticatorSelection:{residentKey:'required',userVerification:'required'}});
}
export async function authenticationOptions(state,rp){
 if(!state.devices.length)throw Error('PASSKEY_REQUIRED');
 return generateAuthenticationOptions({rpID:rp.rpID,userVerification:'required',allowCredentials:state.devices.filter(d=>d.rp_id===rp.rpID).map(d=>({id:d.credential_id,transports:d.transports}))});
}
export async function verifyDeviceRegistration(response,challenge,rp){
 const result=await verifyRegistrationResponse({response,expectedChallenge:challenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:true});
 if(!result.verified||!result.registrationInfo)throw Error('PASSKEY_REJECTED');
 return result.registrationInfo.credential;
}
export async function verifyDeviceAuthentication(response,challenge,rp,device){
 if(!device||device.rp_id!==rp.rpID)throw Error('PASSKEY_REJECTED');
 const result=await verifyAuthenticationResponse({response,expectedChallenge:challenge,expectedOrigin:rp.origin,expectedRPID:rp.rpID,requireUserVerification:true,credential:{id:device.credential_id,publicKey:new Uint8Array(Buffer.from(device.public_key,'base64url')),counter:Number(device.counter),transports:device.transports}});
 if(!result.verified)throw Error('PASSKEY_REJECTED');
 return result.authenticationInfo.newCounter;
}
export const newTicketSecret=()=>randomBytes(32).toString('base64url');
