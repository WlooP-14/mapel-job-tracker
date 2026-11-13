import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {canonical} from '../lib/developer-security.js';
import {executeWipe,removeLiveStorage,removeLiveAuth} from '../lib/kill-worker.js';

const ref='aaaaaaaaaaaaaaaaaaaa',keys=generateKeyPairSync('ed25519'),publicKey=keys.publicKey.export({type:'spki',format:'pem'}).toString();
function receipt(old=false){const payload={id:'isolated',projectRef:ref,completedAt:new Date(Date.now()-(old?172800000:0)).toISOString(),restoreTestedAt:new Date().toISOString(),snapshotSha256:'a'.repeat(64),independent:true,appCanDelete:false,workerCanDelete:false,includes:['database','auth','storage']};return {payload,signature:sign(null,Buffer.from(canonical(payload)),keys.privateKey).toString('base64url')};}
test('worker deletes only live storage, paginates from zero, then clears database before Auth',async()=>{
 const events=[],files=Array.from({length:205},(_,i)=>({id:String(i),name:'file-'+String(i).padStart(3,'0')})),nested=[{id:'nested',name:'photo.jpg'}],users=Array.from({length:205},(_,i)=>({id:String(i)}));
 const store={list:async(prefix,options)=>{assert.equal(options.offset,0);const data=prefix==='folder'?nested:[...files,...(nested.length?[{id:null,name:'folder'}]:[])];return {data:data.slice(0,100)};},remove:async paths=>{for(const path of paths){const list=path.startsWith('folder/')?nested:files;list.splice(list.findIndex(f=>f.name===path.split('/').at(-1)),1);}return {};}};
 const client={storage:{listBuckets:async()=>({data:[{id:'live-only'}]}),from:id=>{assert.equal(id,'live-only');return store;},deleteBucket:async()=>{events.push('bucket');return {};}},auth:{admin:{listUsers:async options=>{assert.equal(options.page,1);return {data:{users:users.slice(0,100)}};},deleteUser:async id=>{assert.ok(events.includes('wipe_database'));users.splice(users.findIndex(u=>u.id===id),1);return {};}}}};
 const proof=receipt(),call=async(action)=>{events.push(action);if(action==='inspect')return {enabled:true,backup:proof,backupPublicKey:publicKey};if(action==='claim')return {id:'isolated',phase:'files',lease:'lease',backup:proof};return {};};
 const result=await executeWipe({client,call,projectRef:ref,publicKey,enabled:true,mailReady:true});
 assert.equal(result.processed,true);assert.equal(files.length+nested.length+users.length,0);assert.ok(events.indexOf('bucket')<events.indexOf('files_done'));assert.ok(events.indexOf('files_done')<events.indexOf('wipe_database'));assert.equal(events.at(-1),'complete');
});
test('disabled, unverified, stale, or wrong-key worker never claims or touches live data',async()=>{
 for(const setup of [{enabled:false},{mailReady:false},{proof:{payload:{}}},{proof:receipt(true)},{pinned:'wrong'}]){
  const events=[],call=async action=>{events.push(action);return {enabled:true,backup:setup.proof||receipt(),backupPublicKey:setup.pinned||publicKey};};
  await assert.rejects(executeWipe({client:{},call,projectRef:ref,publicKey,enabled:true,mailReady:true,...setup}));assert.ok(!events.includes('claim'));
 }
});
test('Auth-phase resumption validates original signed backup and skips completed destructive phases',async()=>{
 const events=[],proof=receipt(true),call=async action=>{events.push(action);if(action==='inspect')return {enabled:true,phase:'auth',backup:proof,backupPublicKey:publicKey};if(action==='claim')return {id:'resume',lease:'new',phase:'auth',backup:proof};return {};};
 const client={auth:{admin:{listUsers:async()=>({data:{users:[]}})}}};
 await executeWipe({client,call,projectRef:ref,publicKey,enabled:true,mailReady:true});assert.ok(!events.includes('files_done'));assert.ok(!events.includes('wipe_database'));assert.equal(events.at(-1),'complete');
});
test('failed deletes and unchanging pages stop without marking completion',async()=>{
 const storage={storage:{listBuckets:async()=>({data:[{id:'live'}]}),from:()=>({list:async()=>({data:[{id:'file',name:'file'}]}),remove:async()=>({})})}};
 await assert.rejects(removeLiveStorage(storage,async()=>{}),/STORAGE_REMOVE_STALLED/);
 await assert.rejects(removeLiveAuth({auth:{admin:{listUsers:async()=>({data:{users:[{id:'user'}]}}),deleteUser:async()=>({error:true})}}},async()=>{}),/AUTH_REMOVE_FAILED/);
});
