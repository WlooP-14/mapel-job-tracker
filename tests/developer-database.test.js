import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {hash} from '../lib/developer-security.js';

test('freeze, single-use MFA/passkey authorizations, timed holds, cancellation and a complete wipe are isolated and gated in PostgreSQL',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
  await db.exec((await readFile('supabase/schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
  const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`,[developer,admin,operator,viewer,job]=[1001,1002,1003,1004,1005].map(uid);
  for(const [id,role]of [[developer,'developer'],[admin,'admin'],[operator,'operator'],[viewer,'viewer']]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into public.users(id,name,role) values($1,$2::text,$2::text::public.app_role)',[id,role]);}
  await db.query("insert into public.jobs(id,mould_code,name) values($1,'WIPE-TEST','Isolated test only')",[job]);
  async function as(role,user,sql,args=[]){await db.exec('set role '+role);try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);return await db.query(sql,args);}finally{await db.exec('reset role');}}
  const op=(action,data={})=>as('service_role',null,'select public.developer_security_op($1,$2,$3) value',[developer,action,JSON.stringify({sessionId:'session',...data})]).then(r=>r.rows[0].value);
  const workerKey='test-worker-key-'+ 'a'.repeat(40),worker=(action,data={},key=workerKey)=>as('service_role',null,'select public.developer_worker_op($1,$2,$3) value',[key,action,JSON.stringify(data)]).then(r=>r.rows[0].value);
  for(const user of [developer,admin,operator,viewer])await assert.rejects(as('authenticated',user,"select public.developer_security_op($1,'state','{}')",[developer]),/permission denied/);
  await assert.rejects(as('service_role',null,"select public.developer_security_op($1,'state','{}')",[admin]),/DEVELOPER_ONLY/);
  await op('freeze',{value:true});
  await assert.rejects(db.query('insert into auth.users(id) values($1)',[uid(1010)]),/SYSTEM_FROZEN/);
  assert.equal((await as('authenticated',operator,'select * from public.jobs')).rows.length,0);
  assert.equal((await as('authenticated',developer,'select * from public.jobs')).rows.length,1);
  await op('freeze',{value:false});
  await assert.rejects(op('challenge',{purpose:'wipe',challenge:'challenge'}),/FRESH_MFA_REQUIRED/);
  await op('mfa_verified');
  const challenge=await op('challenge',{purpose:'wipe',challenge:'challenge',context:{delay:false}});
  await op('take_challenge',{id:challenge.id});await assert.rejects(op('take_challenge',{id:challenge.id}),/CHALLENGE_EXPIRED/);
  const devices=[];for(let n=0;n<2;n++)devices.push((await op('register',{name:'Device '+n,credentialId:'credential-'+n,publicKey:'test-public-key',counter:0,rpId:'localhost'})).id);
  async function ticket(purpose,context={}){return op('authorize',{purpose,context,credential:devices[0],previousCounter:0,counter:0,secretHash:hash('ticket-secret')});}
  let t=await ticket('wipe',{delay:false});await assert.rejects(op('hold',{id:t.id,secret:'ticket-secret'}),/WIPE_NOT_READY/);
  const receipt={payload:{completedAt:new Date().toISOString()},digest:'b'.repeat(64)};
  await db.query('update app_private.developer_control set wipe_enabled=true,worker_key_hash=$1,backup_receipt=$2,notification_ready=true,worker_seen_at=clock_timestamp()',[hash(workerKey),JSON.stringify(receipt)]);
  const authData=id=>({id,secret:'ticket-secret',backupDigest:receipt.digest,confirmation:'DELETE'});
  await op('hold',authData(t.id));await assert.rejects(op('commit',authData(t.id)),/HOLD_REQUIRED/);
  await db.query("update app_private.developer_tickets set hold_at=clock_timestamp()-interval '6 seconds' where id=$1",[t.id]);
  const scheduled=await op('commit',authData(t.id));await assert.rejects(op('commit',authData(t.id)),/AUTHORIZATION_EXPIRED/);
  const cancel=await ticket('cancel',{requestId:scheduled.id});await op('cancel',{id:cancel.id,secret:'ticket-secret'});
  assert.equal(await worker('claim'),null);
  t=await ticket('wipe',{delay:true});await op('hold',authData(t.id));await db.query("update app_private.developer_tickets set hold_at=clock_timestamp()-interval '6 seconds' where id=$1",[t.id]);
  const tomorrow=await op('commit',authData(t.id));assert.ok(Date.parse(tomorrow.scheduled_for)>Date.now()+86300000);assert.equal(await worker('claim'),null);
  const cancellation=await ticket('cancel',{requestId:tomorrow.id});await op('cancel',{id:cancellation.id,secret:'ticket-secret'});
  await op('fail');await assert.rejects(op('mfa_verified'),/SECURITY_LOCKED/);
  await db.exec('update app_private.developer_sessions set locked_until=null');await op('mfa_verified');
  t=await ticket('wipe',{delay:false});await op('hold',authData(t.id));await db.query("update app_private.developer_tickets set hold_at=clock_timestamp()-interval '6 seconds' where id=$1",[t.id]);await op('commit',authData(t.id));
  await assert.rejects(worker('claim',{},'wrong'),/WORKER_ONLY/);
  const execution=await worker('claim');assert.equal(execution.phase,'files');
  assert.equal((await as('authenticated',developer,'select * from public.jobs')).rows.length,0);
  const data={id:execution.id,lease:execution.lease,backupDigest:receipt.digest};
  await assert.rejects(worker('wipe_database',data),/WIPE_NOT_READY/);
  await worker('files_done',data);
  await assert.rejects(worker('wipe_database',{...data,lease:'wrong'}),/WORKER_LEASE_REQUIRED/);
  await db.exec('delete from storage.objects;delete from storage.buckets;');
  await worker('wipe_database',data);
  assert.equal((await db.query('select count(*) n from public.jobs')).rows[0].n,0);
  assert.equal((await db.query('select count(*) n from auth.users')).rows[0].n,4);
  await assert.rejects(worker('complete',data),/WIPE_INCOMPLETE/);
  await db.exec('delete from auth.users');await worker('complete',data);
  const status=(await as('anon',null,'select public.system_security_status() value')).rows[0].value;
  assert.ok(status.wipedAt);assert.equal(status.wiping,false);assert.equal(status.frozen,true);
  await assert.rejects(db.query('insert into auth.users(id) values($1)',[uid(1010)]),/SYSTEM_FROZEN/);
  assert.deepEqual((await db.query('select backup_receipt value from app_private.developer_control')).rows[0].value,receipt);
 }finally{await db.close();}
});
