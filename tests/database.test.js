import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('migrations enforce roles, history, storage and readiness in PostgreSQL', async () => {
 const db = new PGlite();
 try {
 await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
 for (const file of (await readdir('supabase/migrations')).sort()) {
   const sql = (await readFile(`supabase/migrations/${file}`,'utf8')).replace('create extension if not exists pgcrypto;','');
   await db.exec(sql);
 }
 const ids = ['developer','admin','operator','viewer'].map((_,i)=>`00000000-0000-0000-0000-00000000000${i+1}`);
 for (const [i,role] of ['developer','admin','operator','viewer'].entries()) await db.query(`insert into auth.users values ($1);`,[ids[i]]).then(()=>db.query('insert into public.users(id,name,role) values ($1,$2,$3)',[ids[i],role,role]));
 const job='10000000-0000-0000-0000-000000000001';
 await db.query(`insert into public.jobs(id,mould_code,name) values ($1,'TEST','Test mould')`,[job]);
 const asRole = async (i,sql,params=[]) => { await db.exec('set role authenticated'); try { await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]); return await db.query(sql,params); } finally {await db.exec('reset role');} };
 assert.equal((await asRole(3,'select * from public.jobs')).rows.length,1);
 await assert.rejects(asRole(2,"insert into public.customers(name) values ('Denied master')"),/row-level security/);
 await assert.rejects(asRole(2,"select public.save_material_route('turn','8620',array['Turning'])"),/not permitted/);
 await asRole(1,"select public.save_material_route('turn','8620',array['Turning','Hardening','Grinding'])");
 await asRole(1,"select public.save_material_route('turn','8620',array['Turning','Grinding'])");
 assert.equal((await asRole(1,"select * from public.material_routes where archived_at is null")).rows.length,2);
 assert.equal((await db.query('select count(*)::int as total from public.material_routes')).rows[0].total,5);
 await assert.rejects(asRole(1,"select public.save_material_route('hardware','STD',array['Turning'])"),/Invalid route/);
 await assert.rejects(asRole(1,"select public.save_material_route('turn','8620',array['Made up'])"),/Unknown processing step/);

 await asRole(3,"insert into public.user_prefs(user_id,language) values ($1,'mr')",[ids[3]]);
 assert.equal((await asRole(3,'select language from public.user_prefs')).rows[0].language,'mr');
 await assert.rejects(asRole(3,"insert into public.user_prefs(user_id,language) values ($1,'hi')",[ids[0]]),/row-level security/);
 await asRole(1,"update public.step_templates set default_days=5 where step_name='Turning'");
 await assert.rejects(asRole(2,"update public.step_templates set default_days=6 where step_name='Turning' returning id").then(result=>{if(!result.rows.length)throw Error('No authorized rows');}),/No authorized rows/);
 await assert.rejects(asRole(3,"insert into public.jobs(mould_code,name) values ('DENIED','Denied')"),/row-level security/);
 await assert.rejects(asRole(2,"insert into public.settings(key,value) values ('denied','1')"),/row-level security/);
 assert.equal((await asRole(1,"select * from public.users where role='developer'")).rows.length,0);
 await assert.rejects(asRole(1,"update public.users set role='developer' where id=$1",[ids[3]]),/row-level security/);
 await assert.rejects(asRole(2,"update public.jobs set name='Updated' where id=$1",[job]),/reason is required/);
 await asRole(2,"select public.change_mould_plan($1,'2026-11-24','normal','active','Updated',null,'Correct mould name')",[job]);
 const audit=await asRole(0,"select * from public.audit_log where table_name='jobs' and action='UPDATE'");
 assert.equal(audit.rows[0].user_id,ids[2]); assert.equal(audit.rows[0].old_value.name,'Test mould');
 await assert.rejects(db.query('delete from public.jobs where id=$1',[job]),/Hard delete/);
 await assert.rejects(db.exec("update public.audit_log set action='fake'"),/append-only/);
 const item='20000000-0000-0000-0000-000000000001';
 await db.query("insert into public.bom_items(id,job_id,category,name,qty_required) values ($1,$2,'hardware','Bolt',1)",[item,job]);
 assert.equal((await asRole(3,'select * from public.readiness')).rows[0].parts_total,1);
 await assert.rejects(asRole(2,"insert into public.part_steps(bom_item_id,step_name,mode) values ($1,'Turning','outsourced')",[item]),/Hardware/);
 await asRole(2,"insert into storage.objects(bucket_id,name) values ('bom-sources',$1)",[job+'/photo.png']);
 await assert.rejects(asRole(3,"insert into storage.objects(bucket_id,name) values ('bom-sources',$1)",[job+'/blocked.png']),/row-level security/);
 assert.equal((await asRole(3,'select * from storage.objects')).rows.length,1);
 assert.equal((await asRole(2,"delete from storage.objects returning id")).rows.length,0);
 await asRole(2,"insert into public.part_steps(bom_item_id,step_name,status) values ($1,'Issued','NOT APPLICABLE')",[item]);
 assert.equal((await asRole(3,'select * from public.readiness')).rows[0].parts_total,0);
 await db.query('update public.users set active=false where id=$1',[ids[3]]);
 assert.equal((await asRole(3,'select * from public.jobs')).rows.length,0);
 await db.query('update public.users set active=true where id=$1',[ids[3]]);
 await assert.rejects(asRole(2,"update public.jobs set archived_at=now() where id=$1",[job]),/ADMIN_ONLY/);
 await asRole(1,"update public.jobs set archived_at=now() where id=$1",[job]);
 assert.equal((await asRole(3,'select * from storage.objects')).rows.length,0);
 } finally {await db.close();}
});
