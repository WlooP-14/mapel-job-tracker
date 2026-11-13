import {developerIdentity,securityClients,securityOp,readiness,trustedRp,freshAal2,sessionClaims,registrationOptions,authenticationOptions,verifyDeviceRegistration,verifyDeviceAuthentication,verifyBackupReceipt,newTicketSecret,hash} from '../../../lib/developer-security';
export const runtime='nodejs';
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function limitedJson(request){
 const reader=request.body?.getReader();if(!reader)throw Error('INVALID_SECURITY_REQUEST');
 let size=0;const chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>40000){await reader.cancel();throw Error('INVALID_SECURITY_REQUEST');}chunks.push(value);}
 return JSON.parse(Buffer.concat(chunks).toString());
}
export async function GET(request){
 try{
  const rp=trustedRp(request.url);
  const clients=securityClients(),id=await developerIdentity(request,clients);
  if(new URL(request.url).searchParams.get('view')==='audit'){
   const r=await clients.service.from('audit_log').select('*').order('at',{ascending:false}).limit(20);
   if(r.error)throw Error('SECURITY_FAILED');return reply({rows:r.data});
  }
  const state=await securityOp(clients.service,id.user.id,'state');state.devices=state.devices.filter(device=>device.rp_id===rp.rpID);const ready=readiness(state);
  return reply({frozen:state.frozen,lockedUntil:state.lockedUntil,ready:ready.ready,missing:ready.missing,backupAt:ready.backup?.payload.completedAt,devices:state.devices.map(d=>({id:d.id,name:d.device_name,registeredAt:d.registered_on})),requests:state.requests});
 }catch(error){return reply({code:error.message==='SECURITY_NOT_CONFIGURED'?error.message:'DEVELOPER_ONLY'},error.message==='SECURITY_NOT_CONFIGURED'?503:403);}
}
export async function POST(request){
 let clients,identity,passkeyAttempt=false;
 try{
  const rp=trustedRp(request.url);
  if(request.headers.get('origin')!==rp.origin)throw Error('ORIGIN_REJECTED');
  clients=securityClients();identity=await developerIdentity(request,clients);
  const body=await limitedJson(request),user=identity.user.id,op=(action,data={})=>securityOp(clients.service,user,action,{...data,sessionId:identity.sessionId});
  const state=await op('state');
  state.devices=state.devices.filter(device=>device.rp_id===rp.rpID);
  if(body.action==='freeze'){await op('freeze',{value:body.value});return reply({ok:true});}
  if(state.lockedUntil&&Date.parse(state.lockedUntil)>Date.now())throw Error('SECURITY_LOCKED');
  if(body.action==='totp'){
   if(!/^\d{6}$/.test(body.code||'')||!/^[0-9a-f-]{36}$/i.test(body.factorId||''))throw Error('INVALID_SECURITY_REQUEST');
   const headers={apikey:clients.key,Authorization:'Bearer '+identity.token,'content-type':'application/json'};
   const challenge=await fetch(clients.url+'/auth/v1/factors/'+body.factorId+'/challenge',{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(15000)});
   const c=await challenge.json();
   if(!challenge.ok)throw Error('MFA_REJECTED');
   const verification=await fetch(clients.url+'/auth/v1/factors/'+body.factorId+'/verify',{method:'POST',headers,body:JSON.stringify({challenge_id:c.id,code:body.code}),signal:AbortSignal.timeout(15000)});
   const result=await verification.json();
   if(!verification.ok)throw Error('MFA_REJECTED');
   const verified=await clients.service.auth.getUser(result.access_token);
   if(verified.error||verified.data.user.id!==user)throw Error('MFA_REJECTED');
   const sessionId=freshAal2(result.access_token);
   await securityOp(clients.service,user,'mfa_verified',{sessionId});
   return reply({access_token:result.access_token,refresh_token:result.refresh_token});
  }
  freshAal2(identity.token);
  if(body.action==='removeDevice'){await op('remove_device',{id:body.id});return reply({ok:true});}
  if(body.action==='backup'){
   const receipt=verifyBackupReceipt(body.receipt,state.backupPublicKey,new URL(clients.url).hostname.split('.')[0]);
   await op('backup',{receipt});return reply({ok:true});
  }
  if(body.action==='options'){
   if(!['register','wipe','cancel'].includes(body.purpose))throw Error('INVALID_SECURITY_REQUEST');
   if(body.purpose==='register'&&(!String(body.name||'').trim()||String(body.name).length>80))throw Error('INVALID_SECURITY_REQUEST');
   if(body.purpose==='wipe'&&!readiness(state).ready)throw Error('WIPE_NOT_READY');
   const options=body.purpose==='register'?await registrationOptions(identity,state,rp):await authenticationOptions(state,rp);
   const context=body.purpose==='register'?{name:String(body.name||'').trim()}:body.purpose==='cancel'?{requestId:body.requestId}:{delay:body.delay===true};
   const challenge=await op('challenge',{purpose:body.purpose,challenge:options.challenge,context});
   return reply({options,challengeId:challenge.id});
  }
  if(body.action==='verify'){
   const challenge=await op('take_challenge',{id:body.challengeId});
   passkeyAttempt=true;
   if(challenge.purpose==='register'){
    const credential=await verifyDeviceRegistration(body.response,challenge.challenge,rp);
    await op('register',{name:challenge.context.name,credentialId:credential.id,publicKey:Buffer.from(credential.publicKey).toString('base64url'),counter:credential.counter,rpId:rp.rpID,transports:credential.transports||[]});
    return reply({ok:true});
   }
   const device=state.devices.find(d=>d.credential_id===body.response?.id);
   const counter=await verifyDeviceAuthentication(body.response,challenge.challenge,rp,device);
   const secret=newTicketSecret();
   const ticket=await op('authorize',{purpose:challenge.purpose,credential:device.id,previousCounter:Number(device.counter),counter,secretHash:hash(secret),context:challenge.context});
   return reply({ticketId:ticket.id,secret,purpose:challenge.purpose});
  }
  if(['hold','commit','cancel'].includes(body.action)){
   let backupDigest;
   if(body.action!=='cancel'){
    const ready=readiness(state);if(!ready.ready)throw Error('WIPE_NOT_READY');backupDigest=ready.backup.digest;
   }
   const result=await op(body.action,{id:body.ticketId,secret:body.secret,confirmation:body.confirmation,backupDigest});
   return reply(result);
  }
  throw Error('INVALID_SECURITY_REQUEST');
 }catch(error){
  const message=error.message||'';
  if(identity&&clients&&(message==='MFA_REJECTED'||passkeyAttempt)){
   await securityOp(clients.service,identity.user.id,'fail').catch(()=>{});
   return reply({code:'SECURITY_LOCKED'},423);
  }
  const allowed=['DEVELOPER_ONLY','ORIGIN_REJECTED','SECURITY_NOT_CONFIGURED','SECURITY_LOCKED','FRESH_MFA_REQUIRED','CHALLENGE_EXPIRED','AUTHORIZATION_EXPIRED','WIPE_NOT_READY','HOLD_REQUIRED','BACKUP_NOT_VERIFIED','BACKUP_CHANGED','CANCEL_FIRST','ALREADY_EXECUTING','REQUEST_EXISTS','PASSKEY_REQUIRED'];
  const code=allowed.includes(message)?message:'SECURITY_FAILED';
  return reply({code},code==='DEVELOPER_ONLY'||code==='ORIGIN_REJECTED'?403:code==='SECURITY_LOCKED'?423:400);
 }
}
