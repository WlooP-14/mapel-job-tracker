import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

test('schema bundle stays aligned with every versioned migration',async()=>{
 const manifest=JSON.parse(await readFile('supabase/schema-manifest.json','utf8'));
 const files=(await readdir('supabase/migrations')).filter(f=>/^\d+_.+\.sql$/.test(f)).sort();
 assert.deepEqual(files,manifest.migrations.map(m=>m.file));
 for(const m of manifest.migrations)assert.equal(createHash('sha256').update(await readFile('supabase/migrations/'+m.file)).digest('hex'),m.sha256);
 assert.equal(createHash('sha256').update(await readFile('supabase/schema.sql')).digest('hex'),manifest.schemaSha256);
 assert.equal(manifest.tableCount,24);
});

test('fresh-project schema installs atomically and refuses an existing database without changing data',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
  const sql=(await readFile('supabase/schema.sql','utf8')).replace('create extension if not exists pgcrypto;','');
  await db.exec(sql);
  const {rows}=await db.query("select count(*)::int as total, count(*) filter (where not rowsecurity)::int as unprotected from pg_tables where schemaname='public'");
  assert.deepEqual(rows[0],{total:24,unprotected:0});
  assert.equal((await db.query("select count(*)::int as total from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and t.tgname='audit_changes'")).rows[0].total,23);
  assert.equal((await db.query("select count(*)::int as total from pg_views where schemaname='public' and viewname in ('readiness','criticality')")).rows[0].total,2);
  assert.equal((await db.query("select default_days from public.step_templates where step_name='Hardening'")).rows[0].default_days,2);
  assert.equal((await db.query("select public from storage.buckets where id='bom-sources'")).rows[0].public,false);
  await db.exec("insert into public.jobs(mould_code,name) values ('KEEP-ME','Existing mould')");
  await assert.rejects(db.exec(sql),/already contains a schema/);
  await db.exec('rollback');
  assert.equal((await db.query("select name from public.jobs where mould_code='KEEP-ME'")).rows[0].name,'Existing mould');
  assert.equal((await db.query('select count(*)::int as total from public.jobs')).rows[0].total,1);
 }finally{await db.close();}
});
