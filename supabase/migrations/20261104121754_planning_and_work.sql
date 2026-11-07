-- Bulk allotment and immutable work-return events. No purchasing or gate-pass fields.
alter table public.dispatch_batches add column request_digest text;
alter table public.dispatch_batches add column category public.category;
alter table public.dispatch_batches add column material text;
alter table public.dispatch_batches add column trial_lead_days integer;
alter table public.dispatch_batches add column created_at timestamptz;
alter table public.dispatch_batches alter column created_at set default clock_timestamp();
alter table public.dispatch_batches add column previous_state jsonb;
alter table public.dispatch_batches add column undone_at timestamptz;
revoke insert,update on public.dispatch_batches,public.batch_items from authenticated;
alter table public.part_steps add column route_order integer;
alter table public.part_steps add column duration_days integer check(duration_days>=0);
alter table public.part_steps add column buffer_days integer not null default 0 check(buffer_days>=0);
alter table public.part_steps add column qty_completed numeric not null default 0 check(qty_completed>=0);
alter table public.part_steps add column planned_sent_on date;
alter table public.part_steps add column handover_from date;
create unique index batch_items_active_part_idx on public.batch_items(batch_id,bom_item_id) where archived_at is null;
create table public.stage_returns(id uuid primary key default gen_random_uuid(),part_step_id uuid not null references public.part_steps,qty numeric not null check(qty<>0),reported_on date not null,notes text,created_by uuid references public.users,created_at timestamptz not null default clock_timestamp(),undoes_id uuid unique references public.stage_returns,corrects_id uuid references public.stage_returns,archived_at timestamptz);
create index stage_returns_step_idx on public.stage_returns(part_step_id,created_at desc);
create index stage_returns_actor_idx on public.stage_returns(created_by);
create index stage_returns_corrects_idx on public.stage_returns(corrects_id);
alter table public.stage_returns enable row level security;
create policy read_work_returns on public.stage_returns for select to authenticated using ((select app_private.current_app_role()) is not null);
revoke all on public.stage_returns from public,anon,authenticated;
grant select on public.stage_returns to authenticated;
create trigger audit_changes after insert or update or delete on public.stage_returns for each row execute function app_private.audit_change();
create trigger prevent_delete before delete on public.stage_returns for each row execute function public.no_delete();
create trigger work_returns_immutable before update or delete on public.stage_returns for each row execute function public.append_only();
alter table public.movements add column stage_return_id uuid references public.stage_returns;
alter table public.movements add column batch_id uuid references public.dispatch_batches;
create index movements_batch_idx on public.movements(batch_id);
create index movements_work_return_idx on public.movements(stage_return_id);
revoke insert,update on public.movements from authenticated;
alter table public.remarks add column event_key text;
create unique index remarks_event_key_idx on public.remarks(event_key) where event_key is not null;
insert into public.settings(key,value) values('handover_buffer_days','1'),('trial_lead_days','10'),('delay_scheduler_status','"unconfigured"') on conflict(key) do nothing;

create function app_private.require_editor() returns void language plpgsql stable security invoker set search_path='' as $$
begin if app_private.current_app_role() is null or app_private.current_app_role() not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;end $$;
create function app_private.lock_work_step(p_step uuid) returns public.part_steps language plpgsql security definer set search_path='' as $$
declare v_step public.part_steps;v_item public.bom_items;
begin
 select * into v_step from public.part_steps where id=p_step and archived_at is null;
 if not found or v_step.batch_id is null or v_step.mode is null or v_step.step_name='Received' then raise exception 'STEP_UNAVAILABLE';end if;
 v_item:=app_private.lock_receipt_item(v_step.bom_item_id);
 if v_item.category='hardware' then raise exception 'HARDWARE_NOT_PLANNED';end if;
 select * into v_step from public.part_steps where id=p_step and archived_at is null for update;
 if not found or not exists(select 1 from public.dispatch_batches where id=v_step.batch_id and archived_at is null) then raise exception 'STEP_UNAVAILABLE';end if;
 return v_step;
end $$;

create function app_private.allot_work(p_job uuid,p_batch uuid,p_items uuid[],p_steps text[],p_mode text,p_vendor uuid,p_stage_vendors jsonb,p_sent_on date,p_label text,p_reallot boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_job public.jobs;v_part public.bom_items;v_first public.bom_items;v_step text;v_template record;v_vendor uuid;v_days integer;v_buffer integer;v_lead integer;v_order integer;v_plan date;v_target date;v_prev_plan date;v_prev_target date;v_digest text;v_old public.dispatch_batches;v_old_batches uuid[];v_previous jsonb;
begin
 perform app_private.require_editor();
 select * into v_job from public.jobs where id=p_job and archived_at is null and status in ('active','on_hold') for update;
 if not found then raise exception 'MOULD_CLOSED';end if;
 if p_batch is null or coalesce(cardinality(p_items),0) not between 1 and 500 or coalesce(cardinality(p_steps),0) not between 1 and 20 or p_mode is null or p_mode not in ('inhouse','outsourced') or jsonb_typeof(p_stage_vendors) is distinct from 'object' or p_reallot is null or length(coalesce(p_label,''))>160 or v_job.trial_date_t0 is null then raise exception 'INVALID_ALLOTMENT';end if;
 if cardinality(p_items)<>(select count(distinct x) from unnest(p_items) x) or cardinality(p_steps)<>(select count(distinct x) from unnest(p_steps) x) then raise exception 'DUPLICATE_SELECTION';end if;
 if p_sent_on>(clock_timestamp() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_DATE';end if;
 v_digest:=md5(jsonb_build_object('items',p_items,'steps',p_steps,'mode',p_mode,'vendor',p_vendor,'overrides',p_stage_vendors,'sent',p_sent_on,'label',p_label,'reallot',p_reallot)::text);
 select * into v_old from public.dispatch_batches where id=p_batch;
 if found then if v_old.job_id=p_job and v_old.created_by=auth.uid() and v_old.request_digest=v_digest and v_old.archived_at is null then return p_batch;end if;raise exception 'BATCH_IDENTIFIER_USED';end if;
 if (select count(*) from public.bom_items where id=any(p_items) and job_id=p_job and archived_at is null)<>cardinality(p_items) then raise exception 'INVALID_PART_SELECTION';end if;
 if exists(select 1 from public.bom_items where id=any(p_items) and category='hardware') then raise exception 'HARDWARE_NOT_PLANNED';end if;
 select * into v_first from public.bom_items where id=p_items[1];
 if nullif(btrim(v_first.material),'') is null or exists(select 1 from public.bom_items where id=any(p_items) and (category<>v_first.category or lower(btrim(material)) is distinct from lower(btrim(v_first.material)))) then raise exception 'SELECT_ONE_MATERIAL_AND_SECTION';end if;
 if exists(select 1 from unnest(p_steps) n where not exists(select 1 from public.step_templates where category=v_first.category and step_name=n and step_name<>'Received' and active and archived_at is null)) then raise exception 'INVALID_ROUTE';end if;
 if exists(select 1 from public.step_templates where category=v_first.category and step_name=any(p_steps) and active and archived_at is null and default_days is null) then raise exception 'STAGE_DAYS_NOT_SET';end if;
 if exists(select 1 from jsonb_object_keys(p_stage_vendors) k where not(k=any(p_steps))) then raise exception 'INVALID_STAGE_VENDOR';end if;
 if p_mode='outsourced' and (p_vendor is null or not exists(select 1 from public.vendors where id=p_vendor and archived_at is null)) then raise exception 'VENDOR_REQUIRED';end if;
 if p_mode='inhouse' and (p_vendor is not null or p_stage_vendors<>'{}'::jsonb) then raise exception 'INHOUSE_HAS_NO_VENDOR';end if;
 v_buffer:=coalesce((select value::text::integer from public.settings where key='handover_buffer_days' and archived_at is null),1);
 v_lead:=coalesce((select value::text::integer from public.settings where key='trial_lead_days' and archived_at is null),10);
 if v_buffer not between 0 and 365 or v_lead not between 0 and 365 then raise exception 'INVALID_DURATION_SETTING';end if;
 -- Validate the full selection before writing, then retain old allotments as history.
 for v_part in select * from public.bom_items where id=any(p_items) order by id for update loop
  if not exists(select 1 from public.part_steps where bom_item_id=v_part.id and step_name='Received' and status='DONE' and archived_at is null) or (select coalesce(sum(qty_found),0) from public.receiving_checks where bom_item_id=v_part.id and archived_at is null and result<>'wrong')<v_part.qty_required then raise exception 'RECEIVE_FIRST';end if;
  if exists(select 1 from public.part_steps where bom_item_id=v_part.id and step_name<>'Received' and batch_id is not null and archived_at is null) then
   if not p_reallot then raise exception 'ALREADY_ALLOTTED';end if;
   if exists(select 1 from public.part_steps where bom_item_id=v_part.id and step_name<>'Received' and archived_at is null and (started_on is not null or qty_completed>0 or status in ('IN PROCESS','DONE'))) then raise exception 'WORK_ALREADY_STARTED';end if;
  end if;
  if exists(select 1 from public.part_steps where bom_item_id=v_part.id and step_name<>'Received' and archived_at is null and (started_on is not null or qty_completed>0 or status in ('IN PROCESS','DONE'))) then raise exception 'WORK_ALREADY_STARTED';end if;
 end loop;
 select array_agg(distinct batch_id) into v_old_batches from public.batch_items where bom_item_id=any(p_items) and archived_at is null;
 v_previous:=jsonb_build_object('steps',(select coalesce(jsonb_agg(id),'[]') from public.part_steps where bom_item_id=any(p_items) and step_name<>'Received' and archived_at is null),'items',(select coalesce(jsonb_agg(id),'[]') from public.batch_items where bom_item_id=any(p_items) and archived_at is null),'batches',to_jsonb(coalesce(v_old_batches,array[]::uuid[])));
 update public.batch_items set archived_at=now() where bom_item_id=any(p_items) and archived_at is null;
 update public.part_steps set archived_at=now() where bom_item_id=any(p_items) and step_name<>'Received' and archived_at is null;
 update public.dispatch_batches b set archived_at=now() where b.id=any(v_old_batches) and not exists(select 1 from public.batch_items i where i.batch_id=b.id and i.archived_at is null);
 insert into public.dispatch_batches(id,job_id,label,mode,sent_on,created_by,request_digest,category,material,trial_lead_days,previous_state) values(p_batch,p_job,nullif(btrim(p_label),''),p_mode,p_sent_on,auth.uid(),v_digest,v_first.category,v_first.material,v_lead,v_previous);
 for v_part in select * from public.bom_items where id=any(p_items) order by id loop
  insert into public.batch_items(batch_id,bom_item_id,qty_sent) values(p_batch,v_part.id,v_part.qty_required);
  v_order:=0;v_prev_plan:=null;v_prev_target:=null;
  foreach v_step in array p_steps loop
   v_order:=v_order+1;
   select default_days into strict v_days from public.step_templates where category=v_part.category and step_name=v_step and active and archived_at is null;
   v_vendor:=case when p_mode='outsourced' then coalesce(nullif(p_stage_vendors->>v_step,'')::uuid,p_vendor) else null end;
   if v_vendor is not null and not exists(select 1 from public.vendors where id=v_vendor and archived_at is null) then raise exception 'VENDOR_UNAVAILABLE';end if;
   v_plan:=case when v_order=1 then public.shift_working_days(v_job.trial_date_t0,-v_lead) else public.shift_working_days(v_prev_plan,v_days+v_buffer) end;
   v_target:=case when v_order=1 then case when p_sent_on is null then v_plan else public.shift_working_days(p_sent_on,v_days) end else public.shift_working_days(v_prev_target,v_days+v_buffer) end;
   insert into public.part_steps(bom_item_id,batch_id,step_name,status,mode,vendor_id,planned_date,started_on,target_date,route_order,duration_days,buffer_days,planned_sent_on)
   values(v_part.id,p_batch,v_step,case when v_order=1 and p_sent_on is not null then 'IN PROCESS'::public.step_status else 'PENDING'::public.step_status end,p_mode,v_vendor,v_plan,case when v_order=1 then p_sent_on else null end,v_target,v_order,v_days,case when v_order=1 then 0 else v_buffer end,case when v_order=1 then public.shift_working_days(v_plan,-v_days) else v_prev_plan end);
   v_prev_plan:=v_plan;v_prev_target:=v_target;
  end loop;
  insert into public.part_steps(bom_item_id,batch_id,step_name,status,route_order)
  select v_part.id,p_batch,step_name,'NOT APPLICABLE',1000+order_no from public.step_templates where category=v_part.category and step_name<>'Received' and not(step_name=any(p_steps)) and active and archived_at is null;
  if p_sent_on is not null then insert into public.movements(bom_item_id,batch_id,"from","to",qty,dispatched_on) values(v_part.id,p_batch,'store',case when p_mode='outsourced' then 'vendor' else 'shop' end,v_part.qty_required,p_sent_on);end if;
 end loop;
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('batch',p_batch,jsonb_build_object('code','work_allotted','values',jsonb_build_object('count',cardinality(p_items),'material',v_first.material))::text,'info',auth.uid());
 return p_batch;
end $$;

create function app_private.start_one_work_step(p_step uuid,p_started date) returns void language plpgsql security definer set search_path='' as $$
declare s public.part_steps;v_prev public.part_steps;v_due date;v_grace date;v_qty numeric;
begin
 s:=app_private.lock_work_step(p_step);
 if p_started is null or p_started>(clock_timestamp() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_DATE';end if;
 if s.status in ('DONE','NOT APPLICABLE') then raise exception 'STEP_NOT_WAITING';end if;
 if s.started_on is not null then if s.started_on=p_started then return;end if;raise exception 'WORK_ALREADY_STARTED';end if;
 if s.duration_days is null or s.route_order is null then raise exception 'STAGE_DAYS_NOT_SET';end if;
 if exists(select 1 from public.part_steps where bom_item_id=s.bom_item_id and batch_id=s.batch_id and archived_at is null and route_order<s.route_order and status not in ('DONE','NOT APPLICABLE')) then raise exception 'PREVIOUS_STEP';end if;
 select * into v_prev from public.part_steps where bom_item_id=s.bom_item_id and batch_id=s.batch_id and archived_at is null and route_order<s.route_order and status='DONE' order by route_order desc limit 1;
 if v_prev.done_on is not null and p_started<v_prev.done_on then raise exception 'INVALID_DATE';end if;
 v_due:=public.shift_working_days(p_started,s.duration_days);
 v_grace:=case when v_prev.done_on is not null then public.shift_working_days(v_prev.done_on,s.duration_days+s.buffer_days) else null end;
 update public.part_steps set started_on=p_started,target_date=greatest(v_due,v_grace),handover_from=v_prev.done_on,status='IN PROCESS' where id=s.id;
 select qty_required into v_qty from public.bom_items where id=s.bom_item_id;
 insert into public.movements(bom_item_id,batch_id,"from","to",qty,dispatched_on) values(s.bom_item_id,s.batch_id,'shop',case when s.mode='outsourced' then 'vendor' else 'shop' end,v_qty,p_started);
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('step',s.id,jsonb_build_object('code','work_started','values',jsonb_build_object('stage',s.step_name,'date',p_started))::text,'info',auth.uid());
end $$;

create function app_private.refresh_work_total(p_step uuid) returns numeric language plpgsql security definer set search_path='' as $$
declare s public.part_steps;v_qty numeric;v_total numeric;v_done date;v_next public.part_steps;
begin
 s:=app_private.lock_work_step(p_step);select qty_required into v_qty from public.bom_items where id=s.bom_item_id;
 select coalesce(sum(qty),0) into v_total from public.stage_returns where part_step_id=s.id;
 if v_total<0 or v_total>v_qty then raise exception 'QUANTITY_EXCEEDS';end if;
 if v_total<v_qty and exists(select 1 from public.part_steps where bom_item_id=s.bom_item_id and batch_id=s.batch_id and archived_at is null and route_order>s.route_order and status<>'NOT APPLICABLE' and (started_on is not null or qty_completed>0 or status='DONE')) then raise exception 'RETURN_IN_USE';end if;
 select max(r.reported_on) into v_done from public.stage_returns r where r.part_step_id=s.id and r.qty>0 and not exists(select 1 from public.stage_returns u where u.undoes_id=r.id);
 update public.part_steps set qty_completed=v_total,status=case when v_total=v_qty then 'DONE'::public.step_status when target_date<(clock_timestamp() at time zone 'Asia/Kolkata')::date then 'DELAY'::public.step_status else 'IN PROCESS'::public.step_status end,done_on=case when v_total=v_qty then v_done else null end where id=s.id;
 select * into v_next from public.part_steps where bom_item_id=s.bom_item_id and batch_id=s.batch_id and archived_at is null and route_order>s.route_order and status<>'NOT APPLICABLE' order by route_order limit 1;
 if found and v_next.started_on is null then
  update public.part_steps set handover_from=case when v_total=v_qty then v_done else null end,planned_sent_on=case when v_total=v_qty then v_done else s.target_date end,target_date=public.shift_working_days(case when v_total=v_qty then v_done else s.target_date end,v_next.duration_days+v_next.buffer_days) where id=v_next.id;
 elsif not found then
  update public.batch_items set qty_back=v_total where batch_id=s.batch_id and bom_item_id=s.bom_item_id and archived_at is null;
 end if;
 return v_total;
end $$;

create function app_private.record_one_work_return(p_step uuid,p_event uuid,p_qty numeric,p_day date,p_note text) returns numeric language plpgsql security definer set search_path='' as $$
declare s public.part_steps;v_old public.stage_returns;v_total numeric;v_required numeric;
begin
 s:=app_private.lock_work_step(p_step);
 if p_event is null or p_qty is null or p_qty<=0 or p_qty::text in ('NaN','Infinity','-Infinity') or p_day is null or p_day>(clock_timestamp() at time zone 'Asia/Kolkata')::date or length(coalesce(p_note,''))>1000 then raise exception 'INVALID_RETURN';end if;
 select * into v_old from public.stage_returns where id=p_event;
 if found then
  if v_old.part_step_id=p_step and v_old.qty=p_qty and v_old.reported_on=p_day and coalesce(v_old.notes,'')=coalesce(p_note,'') and v_old.created_by=auth.uid() then return s.qty_completed;end if;
  raise exception 'RETURN_IDENTIFIER_USED';
 end if;
 if s.started_on is null or s.status in ('DONE','NOT APPLICABLE') then raise exception 'START_FIRST';end if;
 if p_day<s.started_on then raise exception 'INVALID_DATE';end if;
 select qty_required into v_required from public.bom_items where id=s.bom_item_id;
 if p_qty+s.qty_completed>v_required then raise exception 'QUANTITY_EXCEEDS';end if;
 insert into public.stage_returns(id,part_step_id,qty,reported_on,notes,created_by) values(p_event,p_step,p_qty,p_day,nullif(p_note,''),auth.uid());
 v_total:=app_private.refresh_work_total(p_step);
 if s.mode='outsourced' then insert into public.movements(bom_item_id,batch_id,stage_return_id,"from","to",qty,returned_on) values(s.bom_item_id,s.batch_id,p_event,'vendor','shop',p_qty,p_day);end if;
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('step',p_step,jsonb_build_object('code',case when v_total=v_required then 'work_done' else 'work_partial' end,'values',jsonb_build_object('stage',s.step_name,'qty',v_total,'expected',v_required,'date',p_day))::text,'info',auth.uid());
 if v_total=v_required and p_day<s.target_date then insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('step',p_step,jsonb_build_object('code','work_early','values',jsonb_build_object('stage',s.step_name,'days',public.working_days_between(p_day,s.target_date)))::text,'info',auth.uid());end if;
 return v_total;
end $$;

create function app_private.record_work_returns(p_job uuid,p_updates jsonb,p_day date,p_note text,p_request uuid) returns void language plpgsql security definer set search_path='' as $$
declare u jsonb;v_id uuid;
begin
 perform app_private.require_editor();
 if jsonb_typeof(p_updates) is distinct from 'array' or jsonb_array_length(p_updates) not between 1 and 500 or p_request is null then raise exception 'INVALID_SELECTION';end if;
 perform 1 from public.jobs where id=p_job and archived_at is null and status in ('active','on_hold') for share;if not found then raise exception 'MOULD_CLOSED';end if;
 if exists(select 1 from jsonb_array_elements(p_updates) group by value->>'step_id' having count(*)>1) then raise exception 'DUPLICATE_SELECTION';end if;
 for u in select x.value from jsonb_array_elements(p_updates) x join public.part_steps s on s.id=(x.value->>'step_id')::uuid order by s.bom_item_id,s.route_order loop
  if not exists(select 1 from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where s.id=(u->>'step_id')::uuid and i.job_id=p_job and i.archived_at is null and s.archived_at is null) then raise exception 'INVALID_SELECTION';end if;
  v_id:=md5(p_request::text||(u->>'step_id'))::uuid;
  perform app_private.record_one_work_return((u->>'step_id')::uuid,v_id,(u->>'qty')::numeric,p_day,p_note);
 end loop;
 if (select count(*) from jsonb_array_elements(p_updates) x join public.part_steps s on s.id=(x.value->>'step_id')::uuid)<>jsonb_array_length(p_updates) then raise exception 'INVALID_SELECTION';end if;
end $$;

create function app_private.undo_work_return(p_event uuid) returns void language plpgsql security definer set search_path='' as $$
declare e public.stage_returns;s public.part_steps;
begin
 perform app_private.require_editor();select * into e from public.stage_returns where id=p_event;
 if not found or e.qty<=0 or (app_private.current_app_role()='operator' and e.created_by is distinct from auth.uid()) then raise exception 'RETURN_UNAVAILABLE';end if;
 s:=app_private.lock_work_step(e.part_step_id);
 if exists(select 1 from public.stage_returns where undoes_id=p_event) then return;end if;
 if clock_timestamp()>e.created_at+interval '10 seconds' then raise exception 'UNDO_EXPIRED';end if;
 insert into public.stage_returns(part_step_id,qty,reported_on,notes,created_by,undoes_id) values(e.part_step_id,-e.qty,e.reported_on,'undo',auth.uid(),e.id);
 perform app_private.refresh_work_total(e.part_step_id);
 update public.movements set archived_at=now() where stage_return_id=e.id and archived_at is null;
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('step',e.part_step_id,jsonb_build_object('code','work_undone','values',jsonb_build_object('qty',e.qty,'stage',s.step_name))::text,'info',auth.uid());
end $$;

create function app_private.undo_allot_work(p_batch uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.dispatch_batches;v_parts uuid[];
begin
 perform app_private.require_editor();select * into b from public.dispatch_batches where id=p_batch;
 if not found or (app_private.current_app_role()='operator' and b.created_by is distinct from auth.uid()) then raise exception 'BATCH_UNAVAILABLE';end if;
 perform 1 from public.jobs where id=b.job_id and archived_at is null and status in ('active','on_hold') for update;if not found then raise exception 'MOULD_CLOSED';end if;
 select * into b from public.dispatch_batches where id=p_batch for update;
 if b.undone_at is not null then return;end if;
 if b.archived_at is not null then raise exception 'BATCH_SUPERSEDED';end if;
 if b.created_at is null or clock_timestamp()>b.created_at+interval '10 seconds' then raise exception 'UNDO_EXPIRED';end if;
 if exists(select 1 from public.part_steps s where s.batch_id=p_batch and (s.qty_completed>0 or exists(select 1 from public.stage_returns r where r.part_step_id=s.id))) then raise exception 'WORK_ALREADY_STARTED';end if;
 update public.part_steps set archived_at=now() where batch_id=p_batch and archived_at is null;
 update public.batch_items set archived_at=now() where batch_id=p_batch and archived_at is null;
 update public.movements set archived_at=now() where batch_id=p_batch and archived_at is null;
 update public.dispatch_batches set archived_at=now(),undone_at=clock_timestamp() where id=p_batch;
 update public.part_steps set archived_at=null where id=any(array(select jsonb_array_elements_text(coalesce(b.previous_state->'steps','[]')))::uuid[]);
 update public.batch_items set archived_at=null where id=any(array(select jsonb_array_elements_text(coalesce(b.previous_state->'items','[]')))::uuid[]);
 update public.dispatch_batches set archived_at=null where id=any(array(select jsonb_array_elements_text(coalesce(b.previous_state->'batches','[]')))::uuid[]);
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('batch',p_batch,jsonb_build_object('code','allotment_undone','values','{}'::jsonb)::text,'info',auth.uid());
end $$;
create function app_private.start_work_steps(p_job uuid,p_steps uuid[],p_started date) returns void language plpgsql security definer set search_path='' as $$
declare v_selected record;
begin
 perform app_private.require_editor();
 if coalesce(cardinality(p_steps),0) not between 1 and 500 or cardinality(p_steps)<>(select count(distinct x) from unnest(p_steps) x) then raise exception 'INVALID_SELECTION';end if;
 perform 1 from public.jobs where id=p_job and archived_at is null and status in ('active','on_hold') for share;if not found then raise exception 'MOULD_CLOSED';end if;
 if (select count(*) from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where s.id=any(p_steps) and i.job_id=p_job and i.archived_at is null and s.archived_at is null)<>cardinality(p_steps) then raise exception 'INVALID_SELECTION';end if;
 for v_selected in select id from public.part_steps where id=any(p_steps) order by bom_item_id,route_order loop perform app_private.start_one_work_step(v_selected.id,p_started);end loop;
end $$;

create function app_private.recalculate_stage_alerts(p_day date default (clock_timestamp() at time zone 'Asia/Kolkata')::date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j record;s record;v_due date;v_status public.step_status;v_prev_part uuid;v_prev_target date;v_days integer;v_window integer;v_code text;v_values jsonb;v_changed integer:=0;v_added integer:=0;v_rows integer;
begin
 if p_day is null then raise exception 'INVALID_DATE';end if;
 perform pg_advisory_xact_lock(hashtext('mjt-stage-alerts'));
 v_window:=coalesce((select value::text::integer from public.settings where key='alert_working_days' and archived_at is null),2);
 for j in select id from public.jobs where archived_at is null and status in ('active','on_hold') order by id for share loop
  v_prev_part:=null;v_prev_target:=null;
  for s in select w.*,i.name as part_name from public.part_steps w join public.bom_items i on i.id=w.bom_item_id where i.job_id=j.id and i.archived_at is null and w.archived_at is null and w.batch_id is not null and w.status<>'NOT APPLICABLE' and w.step_name<>'Received' order by w.bom_item_id,w.route_order loop
   if v_prev_part is distinct from s.bom_item_id then v_prev_target:=null;v_prev_part:=s.bom_item_id;end if;
   if s.status='DONE' then v_prev_target:=s.done_on;continue;end if;
   v_due:=s.target_date;
   if s.duration_days is not null then
    if s.started_on is not null then v_due:=greatest(public.shift_working_days(s.started_on,s.duration_days),case when s.handover_from is not null then public.shift_working_days(s.handover_from,s.duration_days+s.buffer_days) else null end);
    elsif s.handover_from is not null then v_due:=public.shift_working_days(s.handover_from,s.duration_days+s.buffer_days);
    elsif v_prev_target is not null then v_due:=public.shift_working_days(v_prev_target,s.duration_days+s.buffer_days);end if;
   end if;
   v_prev_target:=v_due;
   v_status:=case when v_due<p_day then 'DELAY'::public.step_status when s.started_on is not null then 'IN PROCESS'::public.step_status else 'PENDING'::public.step_status end;
   if v_status is distinct from s.status or v_due is distinct from s.target_date then update public.part_steps set status=v_status,target_date=v_due where id=s.id;v_changed:=v_changed+1;end if;
   v_code:=null;v_values:=jsonb_build_object('stage',s.step_name,'part',s.part_name,'date',v_due);
   if v_due<p_day then
    if s.started_on is null then v_code:='work_not_sent';
    else v_days:=public.working_days_between(v_due,p_day);v_code:=case when v_days>0 then 'work_late' else 'work_past_due' end;v_values:=v_values||jsonb_build_object('days',v_days);end if;
   elsif v_due is not null and public.working_days_between(p_day,v_due)<=v_window then v_code:='work_due_soon';v_values:=v_values||jsonb_build_object('days',public.working_days_between(p_day,v_due));end if;
   if v_code is not null then
    insert into public.remarks(entity_type,entity_id,text,kind,created_by,event_key) values('step',s.id,jsonb_build_object('code',v_code,'values',v_values)::text,case when v_status='DELAY' then 'delay' else 'alert' end,null,s.id::text||':'||p_day::text||':'||v_due::text||':'||v_code) on conflict(event_key) where event_key is not null do nothing;
    get diagnostics v_rows=row_count;v_added:=v_added+v_rows;
   end if;
   if s.started_on>s.planned_sent_on then
    insert into public.remarks(entity_type,entity_id,text,kind,created_by,event_key) values('step',s.id,jsonb_build_object('code','dispatch_late','values',jsonb_build_object('stage',s.step_name,'days',public.working_days_between(s.planned_sent_on,s.started_on),'date',s.started_on))::text,'info',null,s.id::text||':dispatch:'||s.started_on::text) on conflict(event_key) where event_key is not null do nothing;
   end if;
  end loop;
 end loop;
 insert into public.settings(key,value) values('delay_last_check',jsonb_build_object('checked_at',clock_timestamp(),'as_of',p_day,'changed',v_changed,'remarks',v_added)) on conflict(key) do update set value=excluded.value;
 return jsonb_build_object('changed',v_changed,'remarks',v_added);
end $$;
revoke all on function app_private.recalculate_stage_alerts(date) from public,anon,authenticated;
create function app_private.refresh_work_calendar() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.date is not distinct from old.date and new.archived_at is not distinct from old.archived_at then return new;end if;
 perform app_private.recalculate_stage_alerts();return new;
end $$;
revoke all on function app_private.refresh_work_calendar() from public,anon,authenticated;
create trigger refresh_work_calendar after insert or update of date,archived_at on public.holidays for each row execute function app_private.refresh_work_calendar();

-- Resolve mould and actor context without exposing the Users directory or phones.
create view public.mould_remarks with (security_invoker=true) as
select r.*,coalesce(j.id,i.job_id,ri.job_id,si.job_id,b.job_id) as job_id,coalesce(i.name,ri.name,si.name) as part_name,coalesce(i.category,ri.category,si.category,b.category) as category,a.name as actor_name
from public.remarks r
left join public.jobs j on r.entity_type in ('job','mould') and j.id=r.entity_id
left join public.bom_items i on r.entity_type in ('part','bom_item') and i.id=r.entity_id
left join public.receiving_checks rc on r.entity_type='receiving' and rc.id=r.entity_id
left join public.bom_items ri on ri.id=rc.bom_item_id
left join public.part_steps s on r.entity_type='step' and s.id=r.entity_id
left join public.bom_items si on si.id=s.bom_item_id
left join public.dispatch_batches b on r.entity_type='batch' and b.id=r.entity_id
left join lateral public.team_actor_names(array[r.created_by]) a on true
where coalesce(j.id,i.job_id,ri.job_id,si.job_id,b.job_id) is not null;
revoke all on public.mould_remarks from public,anon,authenticated;grant select on public.mould_remarks to authenticated;
drop policy add_history on public.remarks;
create policy add_history on public.remarks for insert to authenticated with check ((select app_private.current_app_role()) in ('developer','admin','operator') and created_by=(select auth.uid()));

create function public.allot_work(p_job uuid,p_batch uuid,p_items uuid[],p_steps text[],p_mode text,p_vendor uuid,p_stage_vendors jsonb,p_sent_on date,p_label text,p_reallot boolean default false) returns uuid language sql security invoker set search_path='' as $$ select app_private.allot_work(p_job,p_batch,p_items,p_steps,p_mode,p_vendor,p_stage_vendors,p_sent_on,p_label,p_reallot); $$;
create function public.start_work_steps(p_job uuid,p_steps uuid[],p_started date) returns void language sql security invoker set search_path='' as $$ select app_private.start_work_steps(p_job,p_steps,p_started); $$;
create function public.record_work_returns(p_job uuid,p_updates jsonb,p_day date,p_note text,p_request uuid) returns void language sql security invoker set search_path='' as $$ select app_private.record_work_returns(p_job,p_updates,p_day,p_note,p_request); $$;
create function public.undo_work_return(p_event uuid) returns void language sql security invoker set search_path='' as $$ select app_private.undo_work_return(p_event); $$;
create function public.undo_allot_work(p_batch uuid) returns void language sql security invoker set search_path='' as $$ select app_private.undo_allot_work(p_batch); $$;
revoke all on function app_private.require_editor(),app_private.lock_work_step(uuid),app_private.start_one_work_step(uuid,date),app_private.refresh_work_total(uuid),app_private.record_one_work_return(uuid,uuid,numeric,date,text) from public,anon,authenticated;
revoke all on function app_private.allot_work(uuid,uuid,uuid[],text[],text,uuid,jsonb,date,text,boolean),app_private.start_work_steps(uuid,uuid[],date),app_private.record_work_returns(uuid,jsonb,date,text,uuid),app_private.undo_work_return(uuid),app_private.undo_allot_work(uuid) from public,anon;
grant execute on function app_private.allot_work(uuid,uuid,uuid[],text[],text,uuid,jsonb,date,text,boolean),app_private.start_work_steps(uuid,uuid[],date),app_private.record_work_returns(uuid,jsonb,date,text,uuid),app_private.undo_work_return(uuid),app_private.undo_allot_work(uuid) to authenticated;
revoke all on function public.allot_work(uuid,uuid,uuid[],text[],text,uuid,jsonb,date,text,boolean),public.start_work_steps(uuid,uuid[],date),public.record_work_returns(uuid,jsonb,date,text,uuid),public.undo_work_return(uuid),public.undo_allot_work(uuid) from public,anon;
grant execute on function public.allot_work(uuid,uuid,uuid[],text[],text,uuid,jsonb,date,text,boolean),public.start_work_steps(uuid,uuid[],date),public.record_work_returns(uuid,jsonb,date,text,uuid),public.undo_work_return(uuid),public.undo_allot_work(uuid) to authenticated;

-- A single in-database job; no external requests or credentials and no cleanup/deletes.
do $scheduler$ begin
 if exists(select 1 from pg_available_extensions where name='pg_cron') then
  create extension if not exists pg_cron with schema pg_catalog;
  grant usage on schema cron to postgres;grant all privileges on all tables in schema cron to postgres;
  if not exists(select 1 from cron.job where jobname='mjt-nightly-alerts') then perform cron.schedule('mjt-nightly-alerts','30 19 * * *','select app_private.recalculate_stage_alerts();');end if;
  if exists(select 1 from cron.job where jobname='mjt-nightly-alerts' and schedule='30 19 * * *' and command='select app_private.recalculate_stage_alerts();' and active) then
   insert into public.settings(key,value) values('delay_scheduler_status','"scheduled"') on conflict(key) do update set value=excluded.value;
  end if;
 end if;
end $scheduler$;
do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['dispatch_batches','batch_items','stage_returns'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
