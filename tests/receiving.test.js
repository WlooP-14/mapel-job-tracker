import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('partial receipts, retries, corrections, Undo and hardware steps retain history and enforce roles',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));for(const file of (await readdir('supabase/migrations')).sort())await db.exec((await readFile('supabase/migrations/'+file,'utf8')).replace('create extension if not exists pgcrypto;',''));
 const operator='00000000-0000-0000-0000-000000000081',viewer='00000000-0000-0000-0000-000000000082',other='00000000-0000-0000-0000-000000000083';
 for(const [id,role]of [[operator,'operator'],[viewer,'viewer'],[other,'operator']]){await db.query('insert into auth.users(id) values ($1)',[id]);await db.query('insert into public.users(id,name,role) values ($1,$2::text,$2::text::public.app_role)',[id,role]);}
 async function as(id,sql,params=[]){await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await db.query(sql,params)}finally{await db.exec('reset role')}}
 const day=(await db.query("select (clock_timestamp() at time zone 'Asia/Kolkata')::date::text as day")).rows[0].day;
 const job=(await as(operator,"select public.create_mould('QA-RECEIVING','Receiving test',current_date+20) as id")).rows[0].id;
 const item=(await as(operator,'select public.add_bom_item($1,$2) as id',[job,JSON.stringify({category:'turn',name:'Pin',qty_required:4})])).rows[0].id;
 const ids=Array.from({length:6},(_,i)=>`00000000-0000-0000-0000-00000000009${i}`);
 const receive=(id,qty,wrong=false)=>as(operator,'select public.record_receipt($1,$2,$3,$4,$5,$6)',[item,id,qty,wrong,day,'QA receipt']);
 const status=async part=>(await db.query("select status from public.part_steps where bom_item_id=$1 and step_name='Received' and archived_at is null",[part])).rows[0].status;
 await assert.rejects(as(viewer,'select public.record_receipt($1,$2,2,false,$3,\'\')',[item,ids[0],day]),/not permitted/);
 await assert.rejects(as(operator,"insert into public.receiving_checks(bom_item_id,qty_expected,qty_found,result) values ($1,4,2,'short')",[item]),/permission denied/);
 await receive(ids[0],2);await receive(ids[0],2);assert.equal(await status(item),'IN PROCESS');assert.equal((await db.query('select count(*)::int as n from public.receiving_checks')).rows[0].n,1);
 await receive(ids[1],2);assert.equal(await status(item),'DONE');await as(operator,'select public.undo_receipt($1)',[ids[1]]);assert.equal(await status(item),'IN PROCESS');await as(operator,'select public.undo_receipt($1)',[ids[1]]);
 await receive(ids[2],3);assert.equal((await db.query('select result from public.receiving_checks where id=$1',[ids[2]])).rows[0].result,'excess');
 await receive(ids[3],7,true);assert.equal(await status(item),'DONE');
 await as(operator,'select public.correct_receipt($1,$2,2,false,$3,$4)',[ids[2],ids[4],day,'Count corrected']);await as(operator,'select public.correct_receipt($1,$2,2,false,$3,$4)',[ids[2],ids[4],day,'Count corrected']);
 assert.equal((await db.query('select count(*)::int as n from public.receiving_checks')).rows[0].n,5);assert.equal((await db.query('select result from public.receiving_checks where id=$1',[ids[4]])).rows[0].result,'ok');
 assert.equal((await db.query("select user_id from public.audit_log where table_name='receiving_checks' and row_id=$1 and action='INSERT'",[ids[0]])).rows[0].user_id,operator);
 const undoItem=(await as(operator,'select public.add_bom_item($1,$2) as id',[job,JSON.stringify({category:'child',name:'Undo test insert',qty_required:2})])).rows[0].id,original='00000000-0000-0000-0000-000000000101',replacement='00000000-0000-0000-0000-000000000102';
 await as(operator,'select public.record_receipt($1,$2,2,false,$3,\'\')',[undoItem,original,day]);await as(operator,'select public.correct_receipt($1,$2,3,false,$3,$4)',[original,replacement,day,'Count revised']);await as(operator,'select public.undo_receipt($1)',[replacement]);
 assert.equal((await db.query('select archived_at from public.receiving_checks where id=$1',[original])).rows[0].archived_at,null);assert.equal((await db.query('select sum(qty_found)::int as total from public.receiving_checks where bom_item_id=$1 and archived_at is null',[undoItem])).rows[0].total,2);
 const teamCorrection='00000000-0000-0000-0000-000000000103';
 await as(other,'select public.correct_receipt($1,$2,2,false,$3,$4)',[original,teamCorrection,day,'Team count checked']);
 assert.equal((await db.query('select checked_by from public.receiving_checks where id=$1',[original])).rows[0].checked_by,operator);
 assert.equal((await db.query('select checked_by from public.receiving_checks where id=$1',[teamCorrection])).rows[0].checked_by,other);
 const actors=await as(viewer,'select * from public.team_actor_names($1)',[[operator,other]]);assert.equal(actors.rows.length,2);assert.deepEqual(Object.keys(actors.rows[0]).sort(),['id','name']);
 assert.equal((await db.query("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_receipt','undo_receipt','correct_receipt','set_hardware_step','team_actor_names') and p.prosecdef")).rows[0].n,0);
 assert.equal((await db.query("select has_function_privilege('anon','public.record_receipt(uuid,uuid,numeric,boolean,date,text)','EXECUTE') as allowed")).rows[0].allowed,false);
 await assert.rejects(as(other,'select public.undo_receipt($1)',[ids[0]]),/RECEIPT_UNAVAILABLE/);
 await db.query("update public.receiving_checks set checked_on=now()-interval '20 seconds' where id=$1",[ids[0]]);await assert.rejects(as(operator,'select public.undo_receipt($1)',[ids[0]]),/UNDO_EXPIRED/);
 await db.query("update public.part_steps set status='IN PROCESS' where bom_item_id=$1 and step_name='Turning'",[item]);await assert.rejects(as(operator,'select public.correct_receipt($1,$2,1,false,$3,$4)',[ids[4],ids[5],day,'Short correction']),/RECEIPT_IN_USE/);
 await assert.rejects(as(operator,'select public.revise_bom_item($1,$2,$3)',[job,JSON.stringify({update_id:item,category:'turn',name:'Pin',qty_required:5}),'Extra quantity']),/QUANTITY_WITH_PROGRESS/);
 const hardware=(await as(operator,'select public.add_bom_item($1,$2) as id',[job,JSON.stringify({category:'hardware',name:'Bolt',qty_required:2})])).rows[0].id;
 await assert.rejects(as(operator,"select public.set_hardware_step($1,'Verified',true)",[hardware]),/RECEIVE_FIRST/);
 await as(operator,'select public.record_receipt($1,$2,2,false,$3,\'\')',[hardware,ids[5],day]);await assert.rejects(as(operator,"select public.set_hardware_step($1,'Issued',true)",[hardware]),/VERIFY_FIRST/);
 await as(operator,"select public.set_hardware_step($1,'Verified',true)",[hardware]);await as(operator,"select public.set_hardware_step($1,'Issued',true)",[hardware]);await assert.rejects(as(operator,"select public.set_hardware_step($1,'Verified',false)",[hardware]),/UNDO_ISSUE_FIRST/);
 assert.equal((await as(viewer,'select parts_ready from public.readiness where job_id=$1',[job])).rows[0].parts_ready,1);
 }finally{await db.close()}
});
