import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,readdir} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';
test('bulk work is atomic, follows configured routes, excludes hardware and uses actual sent dates',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));for(const f of (await readdir('supabase/migrations')).sort())await db.exec((await readFile('supabase/migrations/'+f,'utf8')).replace('create extension if not exists pgcrypto;',''));
 const op='00000000-0000-0000-0000-000000000201',viewer='00000000-0000-0000-0000-000000000202';for(const [id,role]of [[op,'operator'],[viewer,'viewer']]){await db.query('insert into auth.users(id) values($1)',[id]);await db.query('insert into public.users(id,name,role) values($1,$2::text,$2::text::public.app_role)',[id,role])}
 async function as(id,sql,args=[]){await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await db.query(sql,args)}finally{await db.exec('reset role')}}
 const day=(await db.query("select (clock_timestamp() at time zone 'Asia/Kolkata')::date::text as day")).rows[0].day,uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
 const job=(await as(op,"select public.create_mould('QA-WORK','Work test',current_date+20) as id")).rows[0].id;
 async function part(name,category='turn',qty=2,jobId=job){return (await as(op,'select public.add_bom_item($1,$2) as id',[jobId,JSON.stringify({category,name,material:'8620',qty_required:qty})])).rows[0].id;}
 const a=await part('Pin A'),b=await part('Pin B','turn',4),hardware=await part('Bolt','hardware');
 const vendor=(await db.query("insert into public.vendors(name) values('QA vendor') returning id")).rows[0].id;
 const allot=(actor,batch,items,sent=day,reallot=false,steps=['Turning','Hardening','Grinding'])=>as(actor,'select public.allot_work($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[job,batch,items,steps,'outsourced',vendor,'{}',sent,'QA 8620',reallot]);
 await assert.rejects(allot(viewer,uid(210),[a,b]),/not permitted/);
 await assert.rejects(allot(op,uid(210),[a,b]),/RECEIVE_FIRST/);assert.equal((await db.query('select count(*)::int n from public.dispatch_batches')).rows[0].n,0);
 for(const [item,qty,n]of [[a,2,211],[b,4,212],[hardware,2,213]])await as(op,'select public.record_receipt($1,$2,$3,false,$4,\'\')',[item,uid(n),qty,day]);
 await assert.rejects(allot(op,uid(210),[a,hardware]),/HARDWARE_NOT_PLANNED/);
 await allot(op,uid(210),[a,b]);await allot(op,uid(210),[a,b]);assert.equal((await db.query('select count(*)::int n from public.batch_items where archived_at is null')).rows[0].n,2);
 const steps=(await db.query('select s.* from public.part_steps s where bom_item_id=$1 and archived_at is null order by route_order nulls first',[a])).rows,turn=steps.find(s=>s.step_name==='Turning'),hard=steps.find(s=>s.step_name==='Hardening'),grind=steps.find(s=>s.step_name==='Grinding');
 const due=(await db.query('select public.shift_working_days($1,4)::text as day',[day])).rows[0].day;assert.equal((await db.query('select target_date::text as day from public.part_steps where id=$1',[turn.id])).rows[0].day,due);assert.equal(turn.status,'IN PROCESS');
 await assert.rejects(allot(op,uid(214),[a]),/ALREADY_ALLOTTED/);await assert.rejects(allot(op,uid(214),[a],day,true),/WORK_ALREADY_STARTED/);
 await assert.rejects(as(op,'select public.start_work_steps($1,$2,$3)',[job,[hard.id],day]),/PREVIOUS_STEP/);
 await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:turn.id,qty:1}]),day,'Partial return',uid(215)]);await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:turn.id,qty:1}]),day,'Partial return',uid(215)]);
 assert.equal((await db.query('select qty_completed::int n from public.part_steps where id=$1',[turn.id])).rows[0].n,1);
 await assert.rejects(as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:turn.id,qty:2}]),day,'Too much',uid(216)]),/QUANTITY_EXCEEDS/);
 await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:turn.id,qty:1}]),day,'Remaining',uid(217)]);
 const nextDue=(await db.query('select public.shift_working_days($1,3)::text as day',[day])).rows[0].day;assert.equal((await db.query('select target_date::text as day from public.part_steps where id=$1',[hard.id])).rows[0].day,nextDue);
 await db.exec("update public.step_templates set default_days=9 where category='turn' and step_name='Hardening'");
 await as(op,'select public.start_work_steps($1,$2,$3)',[job,[hard.id],day]);assert.equal((await db.query('select duration_days from public.part_steps where id=$1',[hard.id])).rows[0].duration_days,2);
 await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:hard.id,qty:2}]),day,'Hardening done',uid(218)]);await as(op,'select public.start_work_steps($1,$2,$3)',[job,[grind.id],day]);
 await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:grind.id,qty:1}]),day,'Partial final return',uid(219)]);
 assert.equal((await db.query('select qty_back::int n from public.batch_items where batch_id=$1 and bom_item_id=$2',[uid(210),a])).rows[0].n,1);
 const event=(await db.query('select id from public.stage_returns where part_step_id=$1 and qty>0',[grind.id])).rows[0].id;await as(op,'select public.undo_work_return($1)',[event]);assert.equal((await db.query('select qty_back::int n from public.batch_items where batch_id=$1 and bom_item_id=$2',[uid(210),a])).rows[0].n,0);
 await assert.rejects(as(viewer,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:grind.id,qty:2}]),day,'Denied',uid(220)]),/not permitted/);
 await as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:grind.id,qty:2}]),day,'Final return',uid(221)]);
 assert.equal((await as(viewer,'select parts_ready from public.readiness where job_id=$1',[job])).rows[0].parts_ready,1);
 // A late internal plan must not charge the vendor before the real dispatch clock expires.
 const lateJob=(await as(op,"select public.create_mould('QA-LATE-SEND','Late internal plan',current_date-20) as id")).rows[0].id,latePart=await part('Late sent pin','turn',1,lateJob);
 await as(op,'select public.record_receipt($1,$2,1,false,$3,\'\')',[latePart,uid(222),day]);await as(op,'select public.allot_work($1,$2,$3,$4,$5,$6,$7,$8,$9,false)',[lateJob,uid(223),[latePart],['Turning'],'outsourced',vendor,'{}',day,'Late internal dispatch']);
 await db.query('select app_private.recalculate_stage_alerts($1)',[day]);assert.equal((await db.query("select status from public.part_steps where bom_item_id=$1 and step_name='Turning' and archived_at is null",[latePart])).rows[0].status,'IN PROCESS');
 await assert.rejects(as(op,'select app_private.recalculate_stage_alerts($1)',[day]),/permission denied/);
 // A changed holiday moves an actual deadline; repeated checks retain one alert per day/target.
 const future=(await db.query('select public.shift_working_days($1,1)::text as day',[day])).rows[0].day;
 await db.query('insert into public.holidays(date,note) values($1,\'QA calendar\')',[future]);
 const holidayDue=(await db.query('select public.shift_working_days($1,4)::text as day',[day])).rows[0].day;
 assert.equal((await db.query("select target_date::text as day from public.part_steps where bom_item_id=$1 and step_name='Turning' and archived_at is null",[latePart])).rows[0].day,holidayDue);
 await db.query('select app_private.recalculate_stage_alerts($1)',[day]);const count=(await db.query('select count(*)::int n from public.remarks where event_key is not null')).rows[0].n;await db.query('select app_private.recalculate_stage_alerts($1)',[day]);assert.equal((await db.query('select count(*)::int n from public.remarks where event_key is not null')).rows[0].n,count);
 // Planning-only allotments can be replaced and undone without losing their previous steps.
 const c=await part('Unstarted pin');await as(op,'select public.record_receipt($1,$2,2,false,$3,\'\')',[c,uid(230),day]);
 await allot(op,uid(231),[c],null);const previous=(await db.query('select id from public.part_steps where bom_item_id=$1 and batch_id=$2 and archived_at is null',[c,uid(231)])).rows.map(s=>s.id).sort();
 await allot(op,uid(232),[c],null,true,['Turning']);await as(op,'select public.undo_allot_work($1)',[uid(232)]);
 assert.deepEqual((await db.query('select id from public.part_steps where bom_item_id=$1 and batch_id=$2 and archived_at is null',[c,uid(231)])).rows.map(s=>s.id).sort(),previous);
 assert.ok((await db.query('select archived_at from public.dispatch_batches where id=$1',[uid(232)])).rows[0].archived_at);
 const before=(await db.query('select count(*)::int n from public.stage_returns')).rows[0].n;
 await assert.rejects(as(op,'select public.record_work_returns($1,$2,$3,$4,$5)',[job,JSON.stringify([{step_id:steps.find(s=>s.step_name==='Turning').id,qty:1},{step_id:hard.id,qty:99}]),day,'Atomic failure',uid(233)]));
 assert.equal((await db.query('select count(*)::int n from public.stage_returns')).rows[0].n,before);
 }finally{await db.close()}
});
