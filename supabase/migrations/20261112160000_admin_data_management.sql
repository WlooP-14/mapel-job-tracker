-- Administrative corrections retain original values in immutable audit history.
alter table public.jobs drop constraint jobs_mould_code_key;
create unique index jobs_current_mould_code_key on public.jobs(upper(mould_code)) where archived_at is null;
alter table public.audit_log add column reason text;
create or replace function app_private.audit_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.audit_log(user_id,table_name,row_id,action,old_value,new_value,reason)
 values(auth.uid(),tg_table_name,coalesce(to_jsonb(new)->>'id',to_jsonb(new)->>'key',to_jsonb(new)->>'user_id',to_jsonb(old)->>'id'),tg_op,
 case when tg_op='INSERT' then null else to_jsonb(old) end,case when tg_op='DELETE' then null else to_jsonb(new) end,
 nullif(current_setting('app.admin_reason',true),''));
 return coalesce(new,old);
end $$;

create function app_private.admin_record_fields(p_table text) returns text[]
language sql immutable set search_path='' as $$
 select case p_table
 when 'jobs' then array['mould_code','name','customer_id','trial_date_t0','priority']
 when 'bom_items' then array['name','category','material','qty_required','finish_size_text','rough_size_text','size_text','remark','notes','drawing_ref','two_d_submitted']
 when 'bom_sheets' then array['title','prepared_by','review_by','checked_by','order_by','received_by','sheet_date']
 when 'dispatch_batches' then array['label','notes']
 when 'part_steps' then array['vendor_id','duration_days','buffer_days','target_date','planned_sent_on','started_on']
 when 'receiving_checks' then array['qty_found','received_on','request_note','result']
 when 'stage_returns' then array['qty','reported_on','notes']
 when 'mould_events' then array['actual_on','trial_result','notes']
 when 'remarks' then array['text']
 when 'vendors' then array['name','contact','type']
 when 'customers' then array['name','code']
 when 'holidays' then array['date','note']
 when 'step_templates' then array['default_days','order_no','default_selected','active']
 when 'material_routes' then array['material','step_name','order_no']
 when 'users' then array['name','role','active']
 when 'settings' then array['value']
 else null::text[] end;
$$;
revoke all on function app_private.admin_record_fields(text) from public,anon,authenticated;

create function app_private.admin_record_job(p_table text,r jsonb) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v uuid;
begin
 if p_table='jobs' then return (r->>'id')::uuid;end if;
 if r ? 'job_id' then return (r->>'job_id')::uuid;end if;
 if r ? 'bom_item_id' then select job_id into v from public.bom_items where id=(r->>'bom_item_id')::uuid;
 elsif p_table='stage_returns' then select i.job_id into v from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where s.id=(r->>'part_step_id')::uuid;
 elsif p_table='remarks' then
  case r->>'entity_type'
   when 'job','mould' then v:=(r->>'entity_id')::uuid;
   when 'part','bom_item' then select job_id into v from public.bom_items where id=(r->>'entity_id')::uuid;
   when 'receiving' then select i.job_id into v from public.receiving_checks c join public.bom_items i on i.id=c.bom_item_id where c.id=(r->>'entity_id')::uuid;
   when 'step' then select i.job_id into v from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where s.id=(r->>'entity_id')::uuid;
   when 'batch' then select job_id into v from public.dispatch_batches where id=(r->>'entity_id')::uuid;
   else v:=null;
  end case;
 end if;
 return v;
end $$;
revoke all on function app_private.admin_record_job(text,jsonb) from public,anon,authenticated;

create function app_private.admin_list_records(p_table text,p_job uuid,p_deleted boolean,p_search text,p_offset integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if app_private.current_app_role() is null or app_private.current_app_role() not in ('admin','developer') then raise exception 'ADMIN_ONLY' using errcode='42501';end if;
 if app_private.admin_record_fields(p_table) is null or p_offset<0 or p_offset>100000 or length(coalesce(p_search,''))>160 or p_deleted is null then raise exception 'INVALID_ADMIN_REQUEST';end if;
 execute format($q$
  select coalesce(jsonb_agg(row_data order by row_data->>'__label'),'[]') from (
   select (to_jsonb(r)-array['request_digest','import_digest','previous_state','work_fingerprint'])||jsonb_build_object(
    '__version',md5(to_jsonb(r)::text),'__job',app_private.admin_record_job(%L,to_jsonb(r)),
    '__part',coalesce((select name from public.bom_items where id=(to_jsonb(r)->>'bom_item_id')::uuid),(select i.name from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where s.id=(to_jsonb(r)->>'part_step_id')::uuid)),
    '__label',coalesce(to_jsonb(r)->>'name',to_jsonb(r)->>'mould_code',to_jsonb(r)->>'title',to_jsonb(r)->>'step_name',to_jsonb(r)->>'key',to_jsonb(r)->>'text',to_jsonb(r)->>'kind',to_jsonb(r)->>'received_on',to_jsonb(r)->>'reported_on',to_jsonb(r)->>'date',to_jsonb(r)->>'id')) as row_data
   from public.%I r where (r.archived_at is not null)=$1
   and ($2 is null or app_private.admin_record_job(%L,to_jsonb(r))=$2)
   and ($3='' or to_jsonb(r)::text ilike '%%'||$3||'%%')
   and (%L<>'users' or to_jsonb(r)->>'role'<>'developer')
   and (%L='jobs' or app_private.admin_record_job(%L,to_jsonb(r)) is null or exists(select 1 from public.jobs j where j.id=app_private.admin_record_job(%L,to_jsonb(r)) and j.archived_at is null))
   order by coalesce(to_jsonb(r)->>'name',to_jsonb(r)->>'mould_code',to_jsonb(r)->>'title',to_jsonb(r)->>'step_name',to_jsonb(r)->>'key',to_jsonb(r)->>'text',to_jsonb(r)->>'kind',to_jsonb(r)->>'received_on',to_jsonb(r)->>'reported_on',to_jsonb(r)->>'date',to_jsonb(r)->>'id'),to_jsonb(r)->>'id'
   limit 51 offset $4
  ) rows
 $q$,p_table,p_table,p_table,p_table,p_table,p_table,p_table,p_table) into result using p_deleted,p_job,coalesce(p_search,''),p_offset;
 return jsonb_build_object('rows',result,'more',jsonb_array_length(result)>50);
end $$;

-- Only the role-checked definer function below can enter correction mode.
-- Audit, BOM revision snapshots and date history always remain immutable.
create or replace function public.append_only() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' and tg_table_name in ('remarks','stage_returns','mould_events')
 and current_setting('app.admin_correction',true)='yes'
 and app_private.current_app_role() in ('admin','developer')
 and current_user=(select pg_get_userbyid(proowner) from pg_proc where oid='app_private.admin_manage_record(text,text,text,jsonb,text,text)'::regprocedure)
 then return new;end if;
 raise exception 'History is append-only';
end $$;

-- Exclude administratively removed events from derived work and trial state.
do $$ declare fn text;body text;begin
 foreach fn in array array['app_private.refresh_work_total(uuid)','app_private.mould_trial_state(uuid)','app_private.require_trial_finish(uuid)','app_private.record_mould_event(uuid,uuid,jsonb)','app_private.guard_mould_terminal_state()'] loop
  body:=pg_get_functiondef(fn::regprocedure);
  body:=replace(body,'where part_step_id=s.id;','where part_step_id=s.id and archived_at is null;');
  body:=replace(body,'where r.part_step_id=s.id and r.qty>0','where r.part_step_id=s.id and r.archived_at is null and r.qty>0');
  body:=replace(body,'where u.undoes_id=r.id','where u.undoes_id=r.id and u.archived_at is null');
  body:=replace(body,'where e.job_id=p_job','where e.job_id=p_job and e.archived_at is null');
  body:=replace(body,'where m.job_id=new.id','where m.job_id=new.id and m.archived_at is null');
  body:=replace(body,'where v.kind=''void''','where v.archived_at is null and v.kind=''void''');
  body:=replace(body,'where d.related_id=e.id','where d.archived_at is null and d.related_id=e.id');
  execute body;
 end loop;
end $$;

create function app_private.admin_manage_record(p_table text,p_id text,p_action text,p_changes jsonb,p_reason text,p_version text) returns void
language plpgsql security definer set search_path='' as $$
declare fields text[];old_row jsonb;new_row jsonb;v_key text;v_job uuid;j public.jobs;v_sets text;v_archived timestamptz;v_step uuid;v_part uuid;v_category public.category;
begin
 if app_private.current_app_role() is null or app_private.current_app_role() not in ('admin','developer') then raise exception 'ADMIN_ONLY' using errcode='42501';end if;
 fields:=app_private.admin_record_fields(p_table);
 if fields is null or p_action is null or p_action not in ('edit','delete','restore') or nullif(btrim(p_reason),'') is null or length(p_reason)>500 or p_version is null or length(p_version)<>32 or p_id is null or length(p_id)>160 then raise exception 'INVALID_ADMIN_REQUEST';end if;
 if p_table<>'settings' and p_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'INVALID_ADMIN_REQUEST';end if;
 v_key:=case when p_table='settings' then 'key' else 'id' end;
 -- Read parent identity before taking the standard parent-then-child lock order.
 execute format('select to_jsonb(r) from public.%I r where %I::text=$1',p_table,v_key) into old_row using p_id;
 if old_row is null then raise exception 'RECORD_UNAVAILABLE';end if;
 v_job:=app_private.admin_record_job(p_table,old_row);
 if v_job is not null then
  select * into j from public.jobs where id=v_job for update;
  if not found or (p_table<>'jobs' and j.archived_at is not null) then raise exception 'RESTORE_MOULD_FIRST';end if;
  if p_table<>'jobs' and j.status='finished' then raise exception 'REOPEN_MOULD_FIRST';end if;
 end if;
 execute format('select to_jsonb(r) from public.%I r where %I::text=$1 for update',p_table,v_key) into old_row using p_id;
 if old_row is null then raise exception 'RECORD_UNAVAILABLE';end if;
 if md5(old_row::text)<>p_version then raise exception 'RECORD_CHANGED';end if;
 if p_table='users' and (old_row->>'role'='developer' or (old_row->>'id'=auth.uid()::text and (p_action<>'edit' or p_changes ?| array['role','active']))) then raise exception 'PROTECTED_ACCOUNT';end if;
 if p_action='edit' and (jsonb_typeof(p_changes) is distinct from 'object' or p_changes='{}' or length(p_changes::text)>12000 or exists(select 1 from jsonb_object_keys(p_changes) k where not(k=any(fields)))) then raise exception 'INVALID_ADMIN_FIELDS';end if;
 if p_action='edit' and old_row->>'archived_at' is not null then raise exception 'RESTORE_RECORD_FIRST';end if;
 if p_table='users' and p_changes ? 'role' and p_changes->>'role' not in ('admin','operator','viewer') then raise exception 'PROTECTED_ACCOUNT';end if;
 if p_table='mould_events' and old_row->>'kind' in ('finish','reopen','void') then raise exception 'USE_TRIAL_WORKFLOW';end if;
 if p_table='stage_returns' and (old_row->>'undoes_id' is not null or exists(select 1 from public.stage_returns where undoes_id=p_id::uuid and archived_at is null)) then raise exception 'RETURN_ALREADY_REVERSED';end if;
 if p_table='part_steps' and old_row->>'step_name' in ('Received','Verified','Issued') then raise exception 'USE_RECEIVING_WORKFLOW';end if;
 perform set_config('app.admin_correction','yes',true);
 perform set_config('app.admin_reason',btrim(p_reason),true);
 perform set_config('app.job_change_reason',btrim(p_reason),true);
 if p_action='edit' then
  if p_changes ? 'name' and (nullif(btrim(p_changes->>'name'),'') is null or length(p_changes->>'name')>160) then raise exception 'INVALID_ADMIN_FIELDS';end if;
  if p_changes ? 'mould_code' then
   if nullif(btrim(p_changes->>'mould_code'),'') is null or upper(btrim(p_changes->>'mould_code')) !~ '^[A-Z0-9][A-Z0-9_-]{1,59}$' then raise exception 'INVALID_ADMIN_FIELDS';end if;
   p_changes:=jsonb_set(p_changes,'{mould_code}',to_jsonb(upper(btrim(p_changes->>'mould_code'))));
  end if;
  if p_changes ? 'trial_date_t0' and p_changes->>'trial_date_t0' is null then raise exception 'INVALID_ADMIN_FIELDS';end if;
  if p_changes ? 'role' and p_changes->>'role' is null then raise exception 'INVALID_ADMIN_FIELDS';end if;
  if p_changes ? 'qty_required' and ((p_changes->>'qty_required')::numeric<=0 or (p_changes->>'qty_required')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'INVALID_ADMIN_FIELDS';end if;
  if p_changes ? 'qty' and ((p_changes->>'qty')::numeric<=0 or (p_changes->>'qty')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'INVALID_ADMIN_FIELDS';end if;
  if p_changes ? 'qty_found' and ((p_changes->>'qty_found')::numeric<0 or (p_changes->>'qty_found')::numeric::text in ('NaN','Infinity','-Infinity')) then raise exception 'INVALID_ADMIN_FIELDS';end if;
  if p_table='bom_items' and p_changes ? 'category' and p_changes->>'category'<>old_row->>'category' then
   if exists(select 1 from public.part_steps where bom_item_id=p_id::uuid and archived_at is null and step_name<>'Received' and (batch_id is not null or status not in ('PENDING','NOT APPLICABLE'))) then raise exception 'PART_HAS_WORK';end if;
   update public.part_steps set archived_at=clock_timestamp() where bom_item_id=p_id::uuid and archived_at is null and step_name<>'Received';
  end if;
  if p_table='part_steps' and old_row->>'step_name' in ('Received','Verified','Issued') then raise exception 'USE_RECEIVING_WORKFLOW';end if;
  if p_table='mould_events' and p_changes ? 'trial_result' and old_row->>'kind'<>'trial' then raise exception 'INVALID_ADMIN_FIELDS';end if;
  foreach v_key in array array['actual_on','received_on','reported_on','started_on'] loop
   if p_changes ? v_key and (p_changes->>v_key)::date>(clock_timestamp() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_DATE';end if;
  end loop;
  foreach v_key in array array['default_days','duration_days','buffer_days'] loop
   if p_changes ? v_key and p_changes->>v_key is not null and ((p_changes->>v_key)::integer<0 or (p_changes->>v_key)::integer>365) then raise exception 'INVALID_ADMIN_FIELDS';end if;
  end loop;
  select string_agg(format('%I=(jsonb_populate_record(null::public.%I,$2)).%I',key,p_table,key),',') into v_sets from jsonb_object_keys(p_changes) key;
  if p_table='receiving_checks' then v_sets:=v_sets||',archived_at=archived_at';end if;
  execute format('update public.%I set %s where %I::text=$1',p_table,v_sets,case when p_table='settings' then 'key' else 'id' end) using p_id,p_changes;
  if p_table='jobs' and p_changes ? 'mould_code' then update public.jobs set qr_code=p_changes->>'mould_code' where id=p_id::uuid;end if;
  if p_table='part_steps' and p_changes ? 'started_on' then
   if p_changes->>'started_on' is null and (old_row->>'qty_completed')::numeric>0 then raise exception 'RETURN_IN_USE';end if;
   if exists(select 1 from public.stage_returns where part_step_id=p_id::uuid and archived_at is null and reported_on<(p_changes->>'started_on')::date) then raise exception 'INVALID_DATE';end if;
   update public.part_steps set target_date=case when started_on is not null then public.shift_working_days(started_on,duration_days) else target_date end where id=p_id::uuid;
  end if;
  if p_table='bom_items' and p_changes ? 'category' and p_changes->>'category'<>old_row->>'category' then
   insert into public.part_steps(bom_item_id,step_name,status) select p_id::uuid,step_name,'PENDING' from public.step_templates where category=(p_changes->>'category')::public.category and active and archived_at is null and default_selected and step_name<>'Received';
  end if;
 elsif p_action='delete' then
  if old_row->>'archived_at' is not null then raise exception 'RECORD_CHANGED';end if;
  v_archived:=clock_timestamp();
  execute format('update public.%I set archived_at=$2 where %I::text=$1',p_table,case when p_table='settings' then 'key' else 'id' end) using p_id,v_archived;
  if p_table='users' then update public.users set active=false where id=p_id::uuid;end if;
 else
  if old_row->>'archived_at' is null then raise exception 'RECORD_CHANGED';end if;
  v_archived:=(old_row->>'archived_at')::timestamptz;
  execute format('update public.%I set archived_at=null where %I::text=$1',p_table,case when p_table='settings' then 'key' else 'id' end) using p_id;
  if p_table='jobs' and old_row->>'status'='archived' then update public.jobs set status='on_hold' where id=p_id::uuid;end if;
  -- Restored accounts remain inactive until an admin deliberately approves access.
 end if;
 if p_table='bom_sheets' and old_row->>'source_image' is not null and p_action in ('delete','restore') then
  update public.bom_sheets set archived_at=case when p_action='delete' then v_archived else null end where job_id=v_job and source_image=old_row->>'source_image' and id<>p_id::uuid and (case when p_action='delete' then archived_at is null else archived_at=v_archived end);
 end if;
 if p_table='bom_items' and p_action in ('delete','restore') then
  update public.batch_items set archived_at=case when p_action='delete' then v_archived else null end where bom_item_id=p_id::uuid and (case when p_action='delete' then archived_at is null else archived_at=v_archived end);
 end if;
 if p_table='dispatch_batches' and p_action in ('delete','restore') then
  if p_action='restore' and exists(select 1 from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where i.id in (select bom_item_id from public.batch_items where batch_id=p_id::uuid) and s.archived_at is null and (s.batch_id is not null or s.step_name<>'Received' and s.status not in ('PENDING','NOT APPLICABLE'))) then raise exception 'BATCH_HAS_NEW_WORK';end if;
  for v_part in select bom_item_id from public.batch_items where batch_id=p_id::uuid loop
   if p_action='delete' then
    update public.part_steps set archived_at=v_archived where bom_item_id=v_part and batch_id=p_id::uuid and archived_at is null;
    insert into public.part_steps(bom_item_id,step_name,status) select v_part,t.step_name,'PENDING' from public.step_templates t join public.bom_items i on i.id=v_part and i.category=t.category where t.active and t.archived_at is null and t.default_selected and t.step_name<>'Received' and not exists(select 1 from public.part_steps s where s.bom_item_id=v_part and s.step_name=t.step_name and s.archived_at is null);
    insert into public.part_steps(bom_item_id,step_name,status) select v_part,s.step_name,'PENDING' from public.part_steps s where s.bom_item_id=v_part and s.batch_id=p_id::uuid and s.archived_at=v_archived and not exists(select 1 from public.part_steps current_step where current_step.bom_item_id=v_part and current_step.archived_at is null and current_step.step_name<>'Received') order by s.route_order limit 1;
   else
    update public.part_steps set archived_at=clock_timestamp() where bom_item_id=v_part and batch_id is null and step_name<>'Received' and archived_at is null;
    update public.part_steps set archived_at=null where bom_item_id=v_part and batch_id=p_id::uuid and archived_at=v_archived;
   end if;
  end loop;
  update public.batch_items set archived_at=case when p_action='delete' then v_archived else null end where batch_id=p_id::uuid and (case when p_action='delete' then archived_at is null else archived_at=v_archived end);
 end if;
 if p_table='receiving_checks' then
  v_part:=(old_row->>'bom_item_id')::uuid;
  if (select coalesce(sum(qty_found) filter(where result<>'wrong'),0) from public.receiving_checks where bom_item_id=v_part and archived_at is null)<(select qty_required from public.bom_items where id=v_part) and exists(select 1 from public.part_steps where bom_item_id=v_part and archived_at is null and step_name<>'Received' and (batch_id is not null or status not in ('PENDING','NOT APPLICABLE'))) then raise exception 'RECEIPT_IN_USE';end if;
 end if;
 if p_table='stage_returns' then
  v_step:=(old_row->>'part_step_id')::uuid;
  if exists(select 1 from public.stage_returns r join public.part_steps s on s.id=r.part_step_id where r.id=p_id::uuid and r.archived_at is null and r.reported_on<s.started_on) then raise exception 'INVALID_DATE';end if;
  perform app_private.refresh_work_total(v_step);
  select to_jsonb(r) into new_row from public.stage_returns r where id=p_id::uuid;
  update public.movements set qty=(new_row->>'qty')::numeric,returned_on=(new_row->>'reported_on')::date,archived_at=(new_row->>'archived_at')::timestamptz where stage_return_id=p_id::uuid;
 end if;
 if p_table='part_steps' and old_row->>'batch_id' is not null then
  update public.batch_items b set qty_back=coalesce((select s.qty_completed from public.part_steps s where s.bom_item_id=b.bom_item_id and s.batch_id=b.batch_id and s.archived_at is null and s.status<>'NOT APPLICABLE' order by s.route_order desc limit 1),0) where b.batch_id=(old_row->>'batch_id')::uuid and b.bom_item_id=(old_row->>'bom_item_id')::uuid and b.archived_at is null;
 end if;
 perform set_config('app.admin_correction','',true);
 perform set_config('app.admin_reason','',true);
 perform set_config('app.job_change_reason','',true);
end $$;

create function app_private.guard_admin_removal() returns trigger language plpgsql set search_path='' as $$
begin
 if new.archived_at is distinct from old.archived_at and current_user in ('authenticated','anon')
 and coalesce(app_private.current_app_role(),'viewer') not in ('admin','developer') then raise exception 'ADMIN_ONLY' using errcode='42501';end if;
 return new;
end $$;
revoke all on function app_private.guard_admin_removal() from public,anon,authenticated;
do $$ declare tbl text;begin
 foreach tbl in array array['jobs','bom_items','bom_sheets','dispatch_batches','vendors','customers'] loop
  execute format('create trigger admin_removal_only before update of archived_at on public.%I for each row execute function app_private.guard_admin_removal()',tbl);
 end loop;
end $$;

revoke all on function app_private.admin_list_records(text,uuid,boolean,text,integer),app_private.admin_manage_record(text,text,text,jsonb,text,text) from public,anon;
grant execute on function app_private.admin_list_records(text,uuid,boolean,text,integer),app_private.admin_manage_record(text,text,text,jsonb,text,text) to authenticated;
create function public.admin_list_records(p_table text,p_job uuid default null,p_deleted boolean default false,p_search text default '',p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select app_private.admin_list_records(p_table,p_job,p_deleted,p_search,p_offset); $$;
create function public.admin_manage_record(p_table text,p_id text,p_action text,p_changes jsonb,p_reason text,p_version text) returns void language sql security invoker set search_path='' as $$ select app_private.admin_manage_record(p_table,p_id,p_action,p_changes,p_reason,p_version); $$;
revoke all on function public.admin_list_records(text,uuid,boolean,text,integer),public.admin_manage_record(text,text,text,jsonb,text,text) from public,anon;
grant execute on function public.admin_list_records(text,uuid,boolean,text,integer),public.admin_manage_record(text,text,text,jsonb,text,text) to authenticated;

create or replace view public.mould_remarks with (security_invoker=true) as
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
where r.archived_at is null and exists(select 1 from public.jobs parent where parent.id=coalesce(j.id,i.job_id,ri.job_id,si.job_id,b.job_id) and parent.archived_at is null);
