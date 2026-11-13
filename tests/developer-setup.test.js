import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {developerSetupSql} from '../lib/developer-setup.js';

test('downloaded security update installs atomically, registers history and preserves existing data with wiping disabled',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
  const files=(await readdir('supabase/migrations')).filter(file=>/^\d+_/.test(file)&&file!=='20261113090000_developer_security.sql').sort();
  const sources=await Promise.all(files.map(file=>readFile('supabase/migrations/'+file,'utf8')));
  await db.exec(sources.join('\n').replace('create extension if not exists pgcrypto;',''));
  await db.exec("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);insert into public.jobs(mould_code,name) values('KEEP-EXISTING','Existing mould');");
  const sql=await developerSetupSql();await db.exec(sql);
  assert.equal((await db.query('select name from public.jobs')).rows[0].name,'Existing mould');
  assert.deepEqual((await db.query('select frozen,wipe_enabled from app_private.developer_control')).rows[0],{frozen:false,wipe_enabled:false});
  assert.equal((await db.query("select name from supabase_migrations.schema_migrations where version='20261113090000'")).rows[0].name,'developer_security');
  await assert.rejects(db.exec(sql),/already exists/);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from public.jobs')).rows[0].n,1);
 }finally{await db.close();}
});
