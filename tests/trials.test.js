import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('trials require current assembly, resolved corrections and explicit trial outcomes before Finished',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));for(const f of (await readdir('supabase/migrations')).sort())await db.exec((await readFile('supabase/migrations/'+f,'utf8')).replace('create extension if not exists pgcrypto;',''));
 const op='00000000-0000-0000-0000-000000000301',viewer='00000000-0000-0000-0000-000000000302',id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 for(const [uid,role]of [[op,'operator'],[viewer,'viewer']]){await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into public.users(id,name,role) values($1,$2::text,$2::text::public.app_role)',[uid,role])}
 async function as(who,sql,args=[]){await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[who]);return await db.query(sql,args)}finally{await db.exec('reset role')}}
 const day=(await db.query("select (clock_timestamp() at time zone 'Asia/Kolkata')::date::text as day")).rows[0].day,job=(await as(op,"select public.create_mould('QA-TRIAL','Trial test',current_date+20) as id")).rows[0].id;
 const part=(await as(op,'select public.add_bom_item($1,$2) as id',[job,JSON.stringify({category:'hardware',name:'Test bolt',qty_required:1,size_text:'M12'})])).rows[0].id;
 const log=(n,kind,extra={},who=op)=>as(who,'select public.record_mould_event($1,$2,$3)',[job,id(n),JSON.stringify({kind,day,...extra})]);
 await assert.rejects(log(310,'assembly'),/PARTS_NOT_READY/);await assert.rejects(log(310,'assembly',{},viewer),/not permitted/);
 await as(op,'select public.record_receipt($1,$2,1,false,$3,\'\')',[part,id(311),day]);for(const step of ['Verified','Issued'])await as(op,'select public.set_hardware_step($1,$2,true)',[part,step]);
 await log(312,'assembly',{note:'Assembly complete'});await log(312,'assembly',{note:'Assembly complete'});assert.equal((await db.query('select count(*)::int n from public.mould_events')).rows[0].n,1);
 await log(340,'void',{related:id(312)});await assert.rejects(log(341,'trial',{stage:0,result:'passed'}),/ASSEMBLY_REQUIRED/);await log(342,'assembly',{note:'Assembly checked again'});
 await assert.rejects(log(343,'trial',{stage:0,result:'not_needed',note:'Cannot skip T0'}),/INVALID_TRIAL_RESULT/);
 await assert.rejects(log(343,'trial',{stage:0,result:'passed',details:{evidence:['other-mould/trials/private.pdf']}}),/INVALID_EVIDENCE/);
 await assert.rejects(log(313,'trial',{stage:1,result:'passed'}),/PREVIOUS_TRIAL/);
 await log(313,'trial',{stage:0,result:'needs_correction',note:'Flash on face',parts:[part]});
 await assert.rejects(log(314,'finish',{note:'Ready'}),/CORRECTIONS_OPEN/);
 const state=(await as(viewer,'select public.mould_trial_state($1) as state',[job])).rows[0].state;assert.equal(state.open_corrections.length,1);
 await log(315,'correction_done',{related:id(313),note:'Face corrected'});
 await log(316,'trial',{stage:1,result:'passed',note:'Retest passed'});await assert.rejects(log(344,'finish',{note:'T2 not acknowledged'}),/TRIALS_INCOMPLETE/);await log(317,'trial',{stage:2,result:'not_needed',note:'T1 passed; no further trial required'});
 await log(318,'finish',{note:'Team approved completed trials'});assert.equal((await db.query('select status from public.jobs where id=$1',[job])).rows[0].status,'finished');
 await assert.rejects(as(op,"update public.bom_items set size_text='M12x200' where id=$1",[part]),/MOULD_CLOSED/);
 await assert.rejects(log(319,'correction_open',{note:'Closed job mutation'}),/MOULD_CLOSED/);
 await assert.rejects(log(319,'reopen',{note:''}),/REASON_REQUIRED/);await log(319,'reopen',{note:'New correction requested'});
 await as(op,"select set_config('app.job_change_reason','QA bypass attempt',false)");await assert.rejects(as(op,"update public.jobs set status='finished' where id=$1",[job]),/TRIAL_WORKFLOW_REQUIRED/);
 await log(320,'correction_open',{note:'New finish correction',parts:[part]});await assert.rejects(log(321,'finish',{note:'Blocked'}),/CORRECTIONS_OPEN/);
 await log(322,'correction_done',{related:id(320),note:'Corrected'});await assert.rejects(log(323,'finish',{note:'Needs retest'}),/RETEST_REQUIRED/);
 await log(324,'trial',{stage:2,result:'passed',note:'Retest complete'});await log(325,'finish',{note:'Trials complete again'});await log(326,'reopen',{note:'BOM changed'});
 // A physical BOM change makes earlier assembly and trials stale.
 await as(op,'select public.revise_bom_item($1,$2,$3)',[job,JSON.stringify({update_id:part,category:'hardware',name:'Test bolt',qty_required:1,size_text:'M12x100'}),'Physical change']);
 await assert.rejects(log(327,'finish',{note:'Old assembly invalid'}),/ASSEMBLY_REQUIRED/);
 await assert.rejects(as(viewer,"insert into public.mould_events(job_id,kind,actual_on,created_by) values($1,'assembly',$2,$3)",[job,day,viewer]),/permission denied/);
 }finally{await db.close()}
});
