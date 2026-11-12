import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {defaultProcesses} from '../lib/processes.js';

test('material defaults allow turning-only P20 and leave optional processes unchecked',()=>{
 const stages=['Turning','Hardening','Grinding','Nitriding'].map((step_name,index)=>({category:'turn',step_name,default_selected:index<3}));
 assert.deepEqual(defaultProcesses(stages,[],'turn','P-20'),['Turning','Hardening','Grinding']);
 assert.deepEqual(defaultProcesses(stages,[{category:'turn',material:'p-20',step_name:'Turning'}],'turn',' P-20 '),['Turning']);
});

test('operators can configure processes while viewers cannot, with separate vendors and routes',async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile('tests/helpers/supabase-bootstrap.sql','utf8'));
  await db.exec((await readFile('supabase/schema.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
  const uid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  for(const [id,role] of [[uid(501),'admin'],[uid(502),'operator'],[uid(503),'viewer']]){
   await db.query('insert into auth.users(id) values ($1)',[id]);
   await db.query('insert into public.users(id,name,role) values ($1,$2::text,$2::text::public.app_role)',[id,role]);
  }
  async function as(id,sql,args=[]){
   await db.exec('set role authenticated');
   try{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);return await db.query(sql,args);}
   finally{await db.exec('reset role');}
  }
  const add="select public.save_processing_step($1,'turn','Polishing',2,5,false)";
  await assert.rejects(as(uid(503),add,[uid(504)]),/not permitted/);
  await as(uid(502),add,[uid(504)]);
  await as(uid(501),add,[uid(504)]);
  await assert.rejects(as(uid(501),"select public.save_processing_step($1,'turn',' polishing ',3,5,false)",[uid(505)]),/PROCESS_NAME_EXISTS/);
  const nitriding=(await db.query("select * from public.step_templates where step_name='Nitriding'")).rows[0];
  assert.equal(nitriding.default_selected,false);
  await as(uid(501),"select public.save_processing_step($1,'turn','Nitriding',3,3,false)",[nitriding.id]);
  assert.equal((await db.query("select order_no from public.step_templates where category='turn' and step_name='Grinding'")).rows[0].order_no,4);
  await assert.rejects(as(uid(501),"select public.save_processing_step($1,'hardware','Polishing',2,5,false)",[uid(506)]),/INVALID_PROCESS/);
  assert.equal((await db.query("select has_function_privilege('anon','public.save_processing_step(uuid,public.category,text,integer,integer,boolean)','execute') as allowed")).rows[0].allowed,false);
  const job=(await as(uid(502),"select public.create_mould('QA-PROCESS','Custom routes',current_date+30) as id")).rows[0].id;
  const day=(await db.query("select (clock_timestamp() at time zone 'Asia/Kolkata')::date::text as day")).rows[0].day;
  const parts=[];
  for(const name of ['P20 full','P20 turning only']){
   const part=(await as(uid(502),'select public.add_bom_item($1,$2) as id',[job,JSON.stringify({category:'turn',name,material:'P-20',qty_required:1})])).rows[0].id;
   parts.push(part);
   await as(uid(502),"select public.record_receipt($1,$2,1,false,$3,'')",[part,crypto.randomUUID(),day]);
  }
  const vendors=(await db.query("insert into public.vendors(name) values ('Turn shop'),('Heat treatment') returning id")).rows;
  const allot=async(batch,part,steps,overrides)=>as(uid(502),"select public.allot_work($1,$2,$3,$4,'outsourced',$5,$6,null,'',false)",[job,batch,[part],steps,vendors[0].id,JSON.stringify(overrides)]);
  await allot(uid(507),parts[0],['Turning','Nitriding','Grinding'],{Nitriding:vendors[1].id});
  await allot(uid(508),parts[1],['Turning'],{});
  assert.deepEqual((await db.query("select step_name,vendor_id from public.part_steps where bom_item_id=$1 and archived_at is null and status<>'NOT APPLICABLE' and step_name<>'Received' order by route_order",[parts[0]])).rows,[
   {step_name:'Turning',vendor_id:vendors[0].id},{step_name:'Nitriding',vendor_id:vendors[1].id},{step_name:'Grinding',vendor_id:vendors[0].id}
  ]);
  assert.equal((await db.query("select count(*)::int as total from public.part_steps where bom_item_id=$1 and archived_at is null and status<>'NOT APPLICABLE' and step_name<>'Received'",[parts[1]])).rows[0].total,1);
  const work=(await db.query("select id,step_name from public.part_steps where bom_item_id=$1 and archived_at is null",[parts[0]])).rows;
  const turning=work.find(step=>step.step_name==='Turning').id;
  const nitride=work.find(step=>step.step_name==='Nitriding').id;
  await as(uid(502),'select public.start_work_steps($1,$2,$3)',[job,[turning],day]);
  await as(uid(502),"select public.record_work_returns($1,$2,$3,'',$4)",[job,JSON.stringify([{step_id:turning,qty:1}]),day,uid(509)]);
  await as(uid(502),'select public.start_work_steps($1,$2,$3)',[job,[nitride],day]);
  const due=(await db.query("select public.shift_working_days($1,3+coalesce((select value::text::int from public.settings where key='handover_buffer_days' and archived_at is null),1))::text as day",[day])).rows[0].day;
  assert.equal((await db.query('select target_date::text as day from public.part_steps where id=$1',[nitride])).rows[0].day,due);
  await as(uid(502),"select public.save_processing_step($1,'turn','Nitriding',9,3,false)",[nitriding.id]);
  assert.equal((await db.query('select duration_days from public.part_steps where id=$1',[nitride])).rows[0].duration_days,3);
  assert.equal((await db.query("select count(*)::int as total from public.audit_log where table_name='step_templates' and row_id=$1",[uid(504)])).rows[0].total,2);
 }finally{await db.close();}
});
