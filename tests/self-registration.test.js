import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('self-registration creates an inactive viewer and only an authorized user can promote it',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
  await db.exec((await readFile('supabase/schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
  const admin='00000000-0000-0000-0000-000000000201';
  const applicant='00000000-0000-0000-0000-000000000202';
  await db.query('insert into auth.users(id) values ($1)',[admin]);
  await db.query("insert into public.users(id,name,role) values ($1,'Test Admin','admin')",[admin]);
  await db.query('insert into auth.users(id,phone,raw_app_meta_data,raw_user_meta_data) values ($1,$2,$3,$4)',[applicant,'919999999999',JSON.stringify({mjt_self_registration:true}),JSON.stringify({full_name:'Test Applicant',role:'developer'})]);
  assert.deepEqual((await db.query('select name,phone,role,active from public.users where id=$1',[applicant])).rows,[{name:'Test Applicant',phone:'+919999999999',role:'viewer',active:false}]);
  async function as(id,sql,params=[]){
   await db.exec('set role authenticated');
   try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await db.query(sql,params);}
   finally{await db.exec('reset role');}
  }
  assert.equal((await as(applicant,'select app_private.current_app_role() as role')).rows[0].role,null);
  assert.equal((await as(applicant,"update public.users set role='admin' where id=$1 returning id",[applicant])).rows.length,0);
  await assert.rejects(as(admin,"update public.users set role='developer' where id=$1",[applicant]),/row-level security/);
  assert.equal((await as(admin,"update public.users set role='admin', active=true where id=$1 returning role",[applicant])).rows[0].role,'admin');
 }finally{await db.close();}
});
