import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('admin cleanup is role checked, recoverable, audited, concurrency safe and preserves linked work',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
  await db.exec((await readFile('supabase/schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
  const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const [dev,admin,op,viewer,job,part,batch,receipt,returned]=[901,902,903,904,905,906,907,908,909].map(uid);
  for(const [id,role]of [[dev,'developer'],[admin,'admin'],[op,'operator'],[viewer,'viewer']]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into public.users(id,name,role) values($1,$2::text,$2::text::public.app_role)',[id,role]);}
  async function as(id,sql,args=[]){await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await db.query(sql,args);}finally{await db.exec('reset role');}}
  await db.query("insert into public.jobs(id,mould_code,name,trial_date_t0) values($1,'TEST-CLEANUP','False mould','2026-12-20')",[job]);
  await as(op,'select public.add_bom_item($1,$2)',[job,JSON.stringify({id:part,category:'turn',name:'False part',material:'P-20',qty_required:2})]);
  // The creation function generates its own identifier.
  const item=(await db.query('select id from public.bom_items where job_id=$1',[job])).rows[0].id;
  async function version(table,id){const key=table==='settings'?'key':'id';return (await db.query(`select md5(to_jsonb(r)::text) v from public.${table} r where ${key}::text=$1`,[id])).rows[0].v;}
  async function manage(actor,table,id,action,changes={},token){return as(actor,'select public.admin_manage_record($1,$2,$3,$4,$5,$6)',[table,id,action,JSON.stringify(changes),'Remove test data / correct mistake',token??await version(table,id)]);}
  for(const actor of [op,viewer]){
   await assert.rejects(as(actor,"select public.admin_list_records('jobs')"),/ADMIN_ONLY/);
   await assert.rejects(manage(actor,'jobs',job,'delete'),/ADMIN_ONLY/);
  }
  await assert.rejects(as(op,'update public.jobs set archived_at=now() where id=$1',[job]),/ADMIN_ONLY/);
  await assert.rejects(as(admin,"select public.admin_list_records('audit_log')"),/INVALID_ADMIN_REQUEST/);
  await assert.rejects(manage(admin,'jobs',job,'edit',{id:uid(999)}),/INVALID_ADMIN_FIELDS/);
  const stale=await version('jobs',job);
  await manage(admin,'jobs',job,'edit',{name:'Corrected mould'});
  await assert.rejects(manage(admin,'jobs',job,'delete',{},stale),/RECORD_CHANGED/);
  await manage(admin,'jobs',job,'delete');
  assert.equal((await db.query('select count(*) n from public.readiness where job_id=$1',[job])).rows[0].n,0);
  assert.equal((await db.query('select count(*) n from public.bom_items where job_id=$1',[job])).rows[0].n,1);
  await assert.rejects(as(op,'select public.record_receipt($1,$2,2,false,$3,$4)',[item,receipt,'2026-11-10','After delete']),/MOULD_CLOSED/);
  await manage(dev,'jobs',job,'restore');
  await as(op,'select public.record_receipt($1,$2,2,false,$3,$4)',[item,receipt,'2026-11-10','Received']);
  await as(op,"select public.allot_work($1,$2,$3,array['Turning'],'inhouse',null,'{}','2026-11-10','Test batch',false)",[job,batch,[item]]);
  const step=(await db.query("select id from public.part_steps where bom_item_id=$1 and batch_id=$2 and step_name='Turning'",[item,batch])).rows[0].id;
  await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:step,qty:2}]),'2026-11-10','Return',returned]);
  const event=(await db.query('select id from public.stage_returns where part_step_id=$1',[step])).rows[0].id;
  await manage(admin,'stage_returns',event,'edit',{qty:1});
  assert.equal(Number((await db.query('select qty_completed from public.part_steps where id=$1',[step])).rows[0].qty_completed),1);
  await manage(admin,'stage_returns',event,'delete');
  assert.equal(Number((await db.query('select qty_completed from public.part_steps where id=$1',[step])).rows[0].qty_completed),0);
  await manage(admin,'stage_returns',event,'restore');
  assert.equal(Number((await db.query('select qty_completed from public.part_steps where id=$1',[step])).rows[0].qty_completed),1);
  await assert.rejects(manage(admin,'receiving_checks',receipt,'delete'),/RECEIPT_IN_USE/);
  await manage(admin,'dispatch_batches',batch,'delete');
  assert.equal((await db.query('select count(*) n from public.part_steps where bom_item_id=$1 and archived_at is null and batch_id is not null',[item])).rows[0].n,0);
  await manage(admin,'dispatch_batches',batch,'restore');
  assert.equal(Number((await db.query('select qty_completed from public.part_steps where id=$1',[step])).rows[0].qty_completed),1);
  const assembly=uid(915);
  await db.query("insert into public.mould_events(id,job_id,kind,actual_on,request_digest,created_by,work_fingerprint) values($1,$2,'assembly','2026-11-10','fixture',$3,app_private.mould_work_fingerprint($2))",[assembly,job,admin]);
  assert.equal((await as(admin,'select public.mould_trial_state($1) state',[job])).rows[0].state.assembly.id,assembly);
  await manage(admin,'mould_events',assembly,'delete');
  const trialState=(await as(admin,'select public.mould_trial_state($1) state',[job])).rows[0].state;
  assert.equal(trialState.assembly,null);
  assert.equal(trialState.events.some(row=>row.id===assembly),false);
  await manage(admin,'mould_events',assembly,'restore');
  assert.equal((await as(admin,'select public.mould_trial_state($1) state',[job])).rows[0].state.assembly.id,assembly);
  const fileA=uid(916),fileB=uid(917);
  await db.query("insert into public.bom_sheets(id,job_id,section,source_image) values($1,$3,'turn','saved-source'),($2,$3,'base','saved-source')",[fileA,fileB,job]);
  await manage(admin,'bom_sheets',fileA,'delete');
  assert.equal((await db.query('select count(*) n from public.bom_sheets where job_id=$1 and archived_at is null',[job])).rows[0].n,0);
  await manage(admin,'bom_sheets',fileA,'restore');
  assert.equal((await db.query('select count(*) n from public.bom_sheets where job_id=$1 and archived_at is null',[job])).rows[0].n,2);
  const note=uid(918);await db.query("insert into public.remarks(id,entity_type,entity_id,text,kind,created_by) values($1,'job',$2,'False alert','alert',$3)",[note,job,op]);
  await manage(admin,'remarks',note,'delete');
  assert.equal((await as(op,'select count(*) n from public.mould_remarks where id=$1',[note])).rows[0].n,0);
  await manage(admin,'remarks',note,'restore');
  await manage(admin,'jobs',job,'delete');
  assert.equal((await as(op,'select count(*) n from public.mould_remarks where id=$1',[note])).rows[0].n,0);
  assert.equal((await as(admin,"select public.admin_list_records('bom_items') data")).rows[0].data.rows.some(row=>row.id===item),false);
  await manage(admin,'jobs',job,'restore');
  await manage(admin,'jobs',job,'delete');
  const replacement=uid(919);
  await db.query("insert into public.jobs(id,mould_code,name) values($1,'TEST-CLEANUP','Replacement')",[replacement]);
  await assert.rejects(manage(admin,'jobs',job,'restore'),/duplicate key/);
  await manage(admin,'jobs',replacement,'edit',{mould_code:'replacement-code'});
  assert.equal((await db.query('select mould_code,qr_code from public.jobs where id=$1',[replacement])).rows[0].qr_code,'REPLACEMENT-CODE');
  await manage(admin,'jobs',job,'restore');
  await assert.rejects(manage(admin,'users',dev,'delete'),/PROTECTED_ACCOUNT/);
  await assert.rejects(manage(admin,'users',admin,'delete'),/PROTECTED_ACCOUNT/);
  assert.ok((await db.query("select count(*) n from public.audit_log where user_id=$1 and reason='Remove test data / correct mistake'",[admin])).rows[0].n>0);
  await assert.rejects(db.exec("update public.audit_log set action='FAKE'"),/History is append-only/);
  await assert.rejects(db.query('delete from public.jobs where id=$1',[job]),/Hard delete is disabled/);
  await db.exec('create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
  const registration=await readFile('supabase/register_manual_admin_migrations.sql','utf8');
  await db.exec(registration);await db.exec(registration);
  assert.equal((await db.query('select count(*) n from supabase_migrations.schema_migrations')).rows[0].n,2);
 }finally{await db.close();}
});
