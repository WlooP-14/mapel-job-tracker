import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {existingBomMatches} from '../lib/bom-matches.js';

test('a later BOM recognizes exact matches without treating changed specifications as duplicates',()=>{
 const saved={id:'saved',category:'base',name:'Top plate',qty_required:2,material:'P20',finish_size_text:'20 × 30'};
 const same={...saved,id:'same',name:' top  plate ',qty_required:'2'};
 const changed={...same,id:'changed',finish_size_text:'20 × 35'};
 const differentSection={...same,id:'section',category:'child'};
 assert.deepEqual([...existingBomMatches([same,changed,differentSection],[saved])],[['same',saved]]);
});

test('mould and manual BOM operations are atomic, audited, and role restricted',async()=>{
 const db=new PGlite();try{
 await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
 for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort())await db.exec((await readFile('supabase/migrations/'+f,'utf8')).replace('create extension if not exists pgcrypto;',''));
 const operator='00000000-0000-0000-0000-000000000021',viewer='00000000-0000-0000-0000-000000000022';
 for(const [id,role]of [[operator,'operator'],[viewer,'viewer']]){await db.query('insert into auth.users(id) values ($1)',[id]);await db.query('insert into public.users(id,name,role) values ($1,$2::text,$2::text::public.app_role)',[id,role]);}
 async function as(id,sql,params=[]){await db.exec('set role authenticated');try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await db.query(sql,params);}finally{await db.exec('reset role');}}
 const job=(await as(operator,"select public.create_mould(' qa-1420 ','Test mould','2026-11-20') as id")).rows[0].id;
 assert.equal((await db.query('select mould_code from public.jobs where id=$1',[job])).rows[0].mould_code,'QA-1420');
 await assert.rejects(as(operator,"select public.create_mould('QA-1420','Duplicate','2026-11-20')"),/unique constraint/);
 await assert.rejects(as(viewer,"select public.create_mould('BLOCKED','Denied','2026-11-20')"),/not permitted/);
 const item={category:'turn',name:'Sprue Bush',qty_required:2,material:'8620',finish_size_text:'ϕ44x233',rough_size_text:'ϕ48x240'};
 const id=(await as(operator,'select public.add_bom_item($1,$2::jsonb) as id',[job,JSON.stringify(item)])).rows[0].id;
 assert.equal((await db.query('select count(*)::int as total from public.part_steps where bom_item_id=$1',[id])).rows[0].total,4);
 assert.equal((await db.query('select count(*)::int as total from public.bom_revisions where job_id=$1',[job])).rows[0].total,1);
 assert.equal((await db.query("select user_id from public.audit_log where table_name='bom_items' and row_id=$1",[id])).rows[0].user_id,operator);
 await as(operator,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify({...item,id})]);
 assert.equal((await db.query('select count(*)::int as total from public.bom_revisions where job_id=$1',[job])).rows[0].total,1);
 await assert.rejects(as(operator,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify({...item,id,name:'Changed on retry'})]),/identifier is already used/);
 await db.exec("create function public.test_fail_stage() returns trigger language plpgsql as $$begin raise exception 'simulated stage failure'; end$$; create trigger test_fail_stage before insert on public.part_steps for each row execute function public.test_fail_stage();");
 await assert.rejects(as(operator,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify({...item,name:'Must roll back'})]),/simulated stage failure/);
 assert.equal((await db.query('select count(*)::int as total from public.bom_items')).rows[0].total,1);
 assert.equal((await db.query('select count(*)::int as total from public.bom_revisions')).rows[0].total,1);
 await db.exec('drop trigger test_fail_stage on public.part_steps; drop function public.test_fail_stage();');
 await assert.rejects(as(viewer,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify(item)]),/not permitted/);
 await assert.rejects(as(operator,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify({...item,qty_required:0})]),/Quantity/);
 assert.equal((await db.query('select count(*)::int as total from public.bom_items')).rows[0].total,1);
 await as(operator,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify({...item,category:'hardware',name:'Bolt'})]);
 assert.deepEqual((await db.query("select step_name from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where i.category='hardware' order by step_name")).rows.map(x=>x.step_name),['Issued','Received','Verified']);
 assert.equal((await db.query('select max(revision_no) as revision from public.bom_revisions where job_id=$1',[job])).rows[0].revision,2);
 const imported=[{...item,id:'00000000-0000-0000-0000-000000000071',category:'base',name:'Top plate'},{...item,id:'00000000-0000-0000-0000-000000000072',category:'child',name:'Insert'}],importId='00000000-0000-0000-0000-000000000073',metadata={code:'QA-1420',prepared_by:'Tester'};
 await assert.rejects(as(viewer,'select public.import_bom($1,$2,$3,$4)',[job,importId,JSON.stringify(imported),JSON.stringify(metadata)]),/not permitted/);
 await assert.rejects(as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,JSON.stringify(imported),JSON.stringify({...metadata,code:'OTHER'})]),/code mismatch/);
 await assert.rejects(as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,JSON.stringify([imported[0],{...imported[1],qty_required:0}]),JSON.stringify(metadata)]),/Quantity/);
 assert.equal((await db.query('select count(*)::int as total from public.bom_items')).rows[0].total,2);
 await as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,JSON.stringify(imported),JSON.stringify(metadata)]);
 await as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,JSON.stringify(imported),JSON.stringify(metadata)]);
 assert.equal((await db.query('select count(*)::int as total from public.bom_items')).rows[0].total,4);
 assert.equal((await db.query('select count(*)::int as total from public.bom_sheets')).rows[0].total,2);
 const firstFileImport='00000000-0000-0000-0000-000000000074';
 const secondFileImport='00000000-0000-0000-0000-000000000075';
 for(const [importId,rowId,filename,preparedBy] of [
  [firstFileImport,'00000000-0000-0000-0000-000000000076','base-bom.xlsx','Base team'],
  [secondFileImport,'00000000-0000-0000-0000-000000000077','insert-bom.xlsx','Insert team'],
 ]){
  const rows=JSON.stringify([{...item,id:rowId,category:'base',name:filename}]);
  const fileMetadata=JSON.stringify({...metadata,source:`${job}/${importId}/${filename}`,prepared_by:preparedBy});
  await as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,rows,fileMetadata]);
  await as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,rows,fileMetadata]);
  if(importId===firstFileImport)await db.query("update public.part_steps set status='DONE' where bom_item_id=$1 and step_name='Received'",[rowId]);
 }
 assert.deepEqual((await db.query("select i.name,i.archived_at,s.status from public.bom_items i join public.part_steps s on s.bom_item_id=i.id where i.id=$1 and s.step_name='Received' and s.archived_at is null",['00000000-0000-0000-0000-000000000076'])).rows,[{name:'base-bom.xlsx',archived_at:null,status:'DONE'}]);
 const files=await as(viewer,'select source_image,prepared_by from public.bom_sheets where job_id=$1 and source_image is not null order by revision_no',[job]);
 assert.deepEqual(files.rows.map(row=>[row.source_image.split('/').at(-1),row.prepared_by]),[
  ['base-bom.xlsx','Base team'],
  ['insert-bom.xlsx','Insert team']
 ]);
 assert.equal((await db.query('select count(*)::int as total from public.bom_items where job_id=$1',[job])).rows[0].total,6);
 await assert.rejects(as(operator,'select public.import_bom($1,$2,$3,$4)',[job,importId,JSON.stringify(imported),JSON.stringify({...metadata,prepared_by:'Changed'})]),/identifier already used/);
 const revised={...item,update_id:id,name:'Revised pin',qty_required:3};
 await assert.rejects(as(operator,'select public.revise_bom_item($1,$2,$3)',[job,JSON.stringify(revised),'']),/reason required/);
 await as(operator,'select public.revise_bom_item($1,$2,$3)',[job,JSON.stringify(revised),'Drawing update']);
 assert.equal((await db.query('select name from public.bom_items where id=$1',[id])).rows[0].name,'Revised pin');
 assert.equal((await db.query('select count(*)::int as total from public.part_steps where bom_item_id=$1 and archived_at is null',[id])).rows[0].total,4);
 await db.query("update public.part_steps set status='IN PROCESS' where bom_item_id=$1 and step_name='Turning'",[id]);
 await assert.rejects(as(operator,'select public.revise_bom_item($1,$2,$3)',[job,JSON.stringify({...revised,category:'hardware'}),'Move']),/with progress/);
 assert.equal((await as(operator,"select public.shift_working_days('2026-11-07',2)::text as day")).rows[0].day,'2026-11-10');
 assert.equal((await as(operator,"select public.shift_working_days('2026-11-10',-2)::text as day")).rows[0].day,'2026-11-07');
 await db.query("update public.part_steps set started_on='2026-11-04',target_date='2026-11-09' where bom_item_id=$1 and step_name='Turning'",[id]);
 await db.query("update public.part_steps set planned_date='2026-11-14',target_date='2026-11-14' where bom_item_id=$1 and step_name='Grinding'",[id]);
 await assert.rejects(as(operator,"update public.jobs set trial_date_t0='2026-11-23' where id=$1",[job]),/reason is required/);
 await assert.rejects(as(viewer,"select public.change_mould_plan($1,'2026-11-23','high','on_hold','Updated mould',null,'Trial moved')",[job]),/not permitted/);
 await as(operator,"select public.change_mould_plan($1,'2026-11-23','high','on_hold','Updated mould',null,'Trial moved')",[job]);
 assert.equal((await db.query("select target_date::text from public.part_steps where bom_item_id=$1 and step_name='Turning'",[id])).rows[0].target_date,'2026-11-09');
 assert.equal((await db.query("select target_date::text from public.part_steps where bom_item_id=$1 and step_name='Grinding'",[id])).rows[0].target_date,'2026-11-17');
 assert.deepEqual((await db.query("select old_value,new_value,reason from public.job_date_history where job_id=$1 and field='trial_date_t0'",[job])).rows[0],{old_value:'2026-11-20',new_value:'2026-11-23',reason:'Trial moved'});
 const attachmentIds=['00000000-0000-0000-0000-000000000080','00000000-0000-0000-0000-000000000081'];
 const saveOriginals=`insert into public.bom_sheets(id,job_id,section,revision_no,title,source_image)
  values($1,$3::uuid,'base',0,'drawing.pdf',$3::uuid::text||'/drawing.pdf'),
        ($2,$3::uuid,'base',0,'parts.xlsx',$3::uuid::text||'/parts.xlsx')
  on conflict(id) do nothing`;
 await assert.rejects(as(viewer,saveOriginals,[...attachmentIds,job]),/row-level security/);
 await as(operator,saveOriginals,[...attachmentIds,job]);
 await as(operator,saveOriginals,[...attachmentIds,job]);
 const originals=await as(viewer,'select title from public.bom_sheets where job_id=$1 and revision_no=0 order by title',[job]);
 assert.deepEqual(originals.rows.map(row=>row.title),['drawing.pdf','parts.xlsx']);
 assert.equal((await db.query('select count(*)::int as total from public.bom_items where job_id=$1',[job])).rows[0].total,6);
 await db.query('update public.jobs set archived_at=now() where id=$1',[job]);
 await assert.rejects(as(operator,'select public.add_bom_item($1,$2::jsonb)',[job,JSON.stringify(item)]),/not open/);
 }finally{await db.close();}
});
