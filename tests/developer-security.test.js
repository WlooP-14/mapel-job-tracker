import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,randomBytes,createHash,sign} from 'node:crypto';
import {isoCBOR} from '@simplewebauthn/server/helpers';
import {canonical,hash,verifyBackupReceipt,verifyDeviceRegistration,verifyDeviceAuthentication,readiness,freshAal2,trustedRp,developerIdentity} from '../lib/developer-security.js';

const ref='aaaaaaaaaaaaaaaaaaaa';
const backupKeys=generateKeyPairSync('ed25519');
const publicKey=backupKeys.publicKey.export({type:'spki',format:'pem'}).toString();
function receipt(overrides={}){
 const payload={id:'test-backup',projectRef:ref,completedAt:new Date().toISOString(),restoreTestedAt:new Date().toISOString(),snapshotSha256:'a'.repeat(64),independent:true,appCanDelete:false,workerCanDelete:false,includes:['database','auth','storage'],...overrides};
 const signature=sign(null,Buffer.from(canonical(payload)),backupKeys.privateKey).toString('base64url');return {payload,signature};
}
test('backup gates require a fresh signed full backup, separate deletion authority and recent restore proof',()=>{
 const verified=verifyBackupReceipt(receipt(),publicKey,ref);assert.equal(verified.digest.length,64);
 for(const change of [{projectRef:'wrong'},{completedAt:'2000-01-01'},{completedAt:'2099-01-01'},{restoreTestedAt:'2000-01-01'},{includes:['database']},{appCanDelete:true},{workerCanDelete:true},{independent:false}])assert.throws(()=>verifyBackupReceipt(receipt(change),publicKey,ref),/BACKUP_NOT_VERIFIED/);
 const tampered=receipt();tampered.payload.snapshotSha256='b'.repeat(64);assert.throws(()=>verifyBackupReceipt(tampered,publicKey,ref),/BACKUP_NOT_VERIFIED/);
 const state={backup:receipt(),backupPublicKey:publicKey,devices:[{},{}],workerConfigured:true,workerSeenAt:new Date().toISOString(),notificationReady:true,wipeEnabled:true};
 assert.equal(readiness(state,{NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`,KILL_SWITCH_ENABLED:'true'}).ready,true);
 assert.equal(readiness(state,{NEXT_PUBLIC_SUPABASE_URL:`https://${ref}.supabase.co`}).ready,false);
});

test('developer identity is verified remotely and ordinary roles cannot enter the security API',async()=>{
 const token='e30.'+Buffer.from(JSON.stringify({session_id:'session'})).toString('base64url')+'.signature';
 for(const role of ['viewer','operator','admin']){
  const query={select:()=>query,eq:()=>query,maybeSingle:async()=>({data:{role,active:true}})};
  const clients={service:{auth:{getUser:async()=>({data:{user:{id:'actor'}}})},from:()=>query}};
  await assert.rejects(developerIdentity(new Request('https://example.test',{headers:{Authorization:'Bearer '+token}}),clients),/DEVELOPER_ONLY/);
 }
 assert.throws(()=>trustedRp('https://attacker.example/api/developer',{NODE_ENV:'production'}),/ORIGIN_REJECTED/);
 const claims={session_id:'session',aal:'aal2',amr:[{method:'totp',timestamp:Math.floor(Date.now()/1000)}]};
 const jwt=p=>'e30.'+Buffer.from(JSON.stringify(p)).toString('base64url')+'.verified-elsewhere';
 assert.equal(freshAal2(jwt(claims)),'session');
 assert.throws(()=>freshAal2(jwt({...claims,aal:'aal1'})),/FRESH_MFA_REQUIRED/);
 assert.throws(()=>freshAal2(jwt({...claims,amr:[{method:'totp',timestamp:1}]})),/FRESH_MFA_REQUIRED/);
});

test('real passkey signatures bind the challenge, origin, RP and user verification flags',async()=>{
 const rp={rpID:'localhost',origin:'http://localhost:3000'},challenge=randomBytes(32).toString('base64url'),credentialId=randomBytes(32),keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=keys.publicKey.export({format:'jwk'});
 const cose=isoCBOR.encode(new Map([[1,2],[3,-7],[-1,1],[-2,Buffer.from(jwk.x,'base64url')],[-3,Buffer.from(jwk.y,'base64url')]]));
 const rpHash=createHash('sha256').update(rp.rpID).digest();
 const len=Buffer.alloc(2);len.writeUInt16BE(credentialId.length);
 const authData=Buffer.concat([rpHash,Buffer.from([0x45]),Buffer.alloc(4),Buffer.alloc(16),len,credentialId,Buffer.from(cose)]);
 const data=type=>Buffer.from(JSON.stringify({type,challenge,origin:rp.origin}));
 const registration={id:credentialId.toString('base64url'),rawId:credentialId.toString('base64url'),type:'public-key',response:{clientDataJSON:data('webauthn.create').toString('base64url'),attestationObject:Buffer.from(isoCBOR.encode(new Map([['fmt','none'],['attStmt',new Map()],['authData',authData]]))).toString('base64url'),transports:['internal']},clientExtensionResults:{}};
 const registered=await verifyDeviceRegistration(registration,challenge,rp);assert.equal(registered.id,registration.id);
 function assertion(flags=0x05){
  const counter=Buffer.alloc(4);counter.writeUInt32BE(1);const authenticatorData=Buffer.concat([rpHash,Buffer.from([flags]),counter]),clientData=data('webauthn.get');
  return {id:registered.id,rawId:registered.id,type:'public-key',response:{authenticatorData:authenticatorData.toString('base64url'),clientDataJSON:clientData.toString('base64url'),signature:sign('sha256',Buffer.concat([authenticatorData,createHash('sha256').update(clientData).digest()]),keys.privateKey).toString('base64url')},clientExtensionResults:{}};
 }
 const device={credential_id:registered.id,public_key:Buffer.from(registered.publicKey).toString('base64url'),counter:0,rp_id:rp.rpID,transports:['internal']};
 assert.equal(await verifyDeviceAuthentication(assertion(),challenge,rp,device),1);
 await assert.rejects(verifyDeviceAuthentication(assertion(),randomBytes(32).toString('base64url'),rp,device));
 await assert.rejects(verifyDeviceAuthentication(assertion(),challenge,{...rp,origin:'https://attacker.example'},device));
 await assert.rejects(verifyDeviceAuthentication(assertion(0x01),challenge,rp,device));
 await assert.rejects(verifyDeviceAuthentication(assertion(),challenge,rp,{...device,counter:2}));
});
