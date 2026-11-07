-- Mould-level assembly, trials and corrections are an append-only event ledger.
create table public.mould_events(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,
 job_id uuid not null references public.jobs,kind text not null check(kind in ('assembly','trial','correction_open','correction_done','finish','reopen','void')),
 stage smallint check(stage between 0 and 2),trial_result text check(trial_result in ('passed','needs_correction','not_needed')),
 actual_on date not null,notes text,details jsonb not null default '{}',part_ids uuid[] not null default '{}',related_id uuid references public.mould_events,
 work_fingerprint text,request_digest text not null,created_by uuid not null references public.users,created_at timestamptz not null default clock_timestamp(),archived_at timestamptz
);
create index mould_events_job_sequence_idx on public.mould_events(job_id,sequence desc);
create index mould_events_actor_idx on public.mould_events(created_by);
create index mould_events_related_idx on public.mould_events(related_id);
create unique index mould_events_void_once_idx on public.mould_events(related_id) where kind='void';
alter table public.mould_events enable row level security;
create policy read_mould_events on public.mould_events for select to authenticated using ((select app_private.current_app_role()) is not null);
revoke all on public.mould_events from public,anon,authenticated;grant select on public.mould_events to authenticated;
create trigger audit_changes after insert or update or delete on public.mould_events for each row execute function app_private.audit_change();
create trigger prevent_delete before delete on public.mould_events for each row execute function public.no_delete();
create trigger mould_events_immutable before update or delete on public.mould_events for each row execute function public.append_only();

create function app_private.mould_work_fingerprint(p_job uuid) returns text language sql stable security invoker set search_path='' as $$
 select md5(coalesce(jsonb_agg(jsonb_build_object('id',i.id,'category',i.category,'material',i.material,'qty',i.qty_required,'finish',i.finish_size_text,'rough',i.rough_size_text,'size',i.size_text,'steps',(select jsonb_agg(jsonb_build_object('id',s.id,'stage',s.step_name,'status',s.status,'qty',s.qty_completed,'done',s.done_on) order by s.id) from public.part_steps s where s.bom_item_id=i.id and s.archived_at is null)) order by i.id),'[]'::jsonb)::text) from public.bom_items i where i.job_id=p_job and i.archived_at is null;
$$;
revoke all on function app_private.mould_work_fingerprint(uuid) from public,anon,authenticated;

create function app_private.mould_trial_state(p_job uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare fp text;a public.mould_events;last_trial public.mould_events;v_trials jsonb:='{}';v_events jsonb;v_open jsonb;r public.readiness;v_previous bigint:=0;n integer;
begin
 if app_private.current_app_role() is null then raise exception 'Operation not permitted';end if;
 if not exists(select 1 from public.jobs where id=p_job and archived_at is null) then raise exception 'MOULD_UNAVAILABLE';end if;
 fp:=app_private.mould_work_fingerprint(p_job);select * into r from public.readiness where job_id=p_job;
 select e.* into a from public.mould_events e where e.job_id=p_job and e.kind='assembly' and e.work_fingerprint=fp and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id) order by e.sequence desc limit 1;
 v_previous:=coalesce(a.sequence,0);
 for n in 0..2 loop
  select e.* into last_trial from public.mould_events e where e.job_id=p_job and e.kind='trial' and e.stage=n and e.work_fingerprint=fp and e.sequence>v_previous and a.id is not null and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id) order by e.sequence desc limit 1;
  if found then v_trials:=v_trials||jsonb_build_object(n::text,to_jsonb(last_trial));v_previous:=last_trial.sequence;else exit;end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.sequence desc),'[]') into v_open from public.mould_events e where e.job_id=p_job and (e.kind='correction_open' or(e.kind='trial' and e.trial_result='needs_correction')) and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id) and not exists(select 1 from public.mould_events d where d.related_id=e.id and d.kind='correction_done' and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=d.id));
 select coalesce(jsonb_agg(to_jsonb(e)-'request_digest' order by e.sequence desc),'[]') into v_events from public.mould_events e where e.job_id=p_job;
 return jsonb_build_object('fingerprint',fp,'assembly',case when a.id is null then null else to_jsonb(a)-'request_digest' end,'trials',v_trials,'open_corrections',v_open,'parts_ready',r.parts_ready,'parts_total',r.parts_total,'events',v_events);
end $$;

create function app_private.require_trial_finish(p_job uuid) returns void language plpgsql stable security definer set search_path='' as $$
declare state jsonb;last_pass bigint;last_fix bigint;
begin
 state:=app_private.mould_trial_state(p_job);
 if (state->>'parts_total')::integer=0 or (state->>'parts_ready')::integer<>(state->>'parts_total')::integer then raise exception 'PARTS_NOT_READY';end if;
 if state->'assembly'='null'::jsonb then raise exception 'ASSEMBLY_REQUIRED';end if;
 if jsonb_array_length(state->'open_corrections')>0 then raise exception 'CORRECTIONS_OPEN';end if;
 if not(state->'trials' ?& array['0','1','2']) then raise exception 'TRIALS_INCOMPLETE';end if;
 select max(e.sequence) into last_pass from public.mould_events e where e.job_id=p_job and e.kind='trial' and e.trial_result='passed' and e.work_fingerprint=state->>'fingerprint' and e.sequence>(state->'assembly'->>'sequence')::bigint and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id);
 select max(e.sequence) into last_fix from public.mould_events e where e.job_id=p_job and e.kind in ('correction_open','correction_done') and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id);
 if last_pass is null or last_pass<coalesce(last_fix,0) then raise exception 'RETEST_REQUIRED';end if;
 if exists(select 1 from public.mould_events e where e.job_id=p_job and e.kind='trial' and e.trial_result='needs_correction' and e.sequence>last_pass and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id)) then raise exception 'RETEST_REQUIRED';end if;
end $$;
revoke all on function app_private.require_trial_finish(uuid) from public,anon,authenticated;

create function app_private.record_mould_event(p_job uuid,p_event uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.jobs;old public.mould_events;related public.mould_events;state jsonb;kind text:=p_data->>'kind';day date:=(p_data->>'day')::date;note text:=btrim(coalesce(p_data->>'note',''));stage integer:=(p_data->>'stage')::integer;result text:=p_data->>'result';details jsonb:=coalesce(p_data->'details','{}');parts uuid[];fp text;digest text;previous jsonb;last_fix bigint;last_pass bigint;path text;
begin
 perform app_private.require_editor();select * into j from public.jobs where id=p_job and archived_at is null for update;if not found then raise exception 'MOULD_UNAVAILABLE';end if;
 if p_event is null or jsonb_typeof(p_data) is distinct from 'object' or kind is null or kind not in ('assembly','trial','correction_open','correction_done','finish','reopen','void') or day is null or day>(clock_timestamp() at time zone 'Asia/Kolkata')::date or length(note)>2000 or jsonb_typeof(details) is distinct from 'object' or length(details::text)>8000 then raise exception 'INVALID_TRIAL_EVENT';end if;
 digest:=md5(p_data::text);select * into old from public.mould_events where id=p_event;if found then if old.job_id=p_job and old.created_by=auth.uid() and old.request_digest=digest then return p_event;end if;raise exception 'EVENT_IDENTIFIER_USED';end if;
 if kind not in ('reopen','void') and j.status not in ('active','on_hold') then raise exception 'MOULD_CLOSED';end if;
 if kind in ('correction_open','correction_done','finish','reopen') and note='' then raise exception 'REASON_REQUIRED';end if;
 if coalesce(jsonb_typeof(p_data->'parts'),'array')<>'array' then raise exception 'INVALID_PART_SELECTION';end if;
 parts:=array(select jsonb_array_elements_text(coalesce(p_data->'parts','[]'))::uuid);
 if cardinality(parts)>500 or exists(select 1 from unnest(parts) id where not exists(select 1 from public.bom_items i where i.id=id and i.job_id=p_job and i.archived_at is null)) then raise exception 'INVALID_PART_SELECTION';end if;
 if details ? 'evidence' then
  if jsonb_typeof(details->'evidence') is distinct from 'array' or jsonb_array_length(details->'evidence')>5 then raise exception 'INVALID_EVIDENCE';end if;
  for path in select jsonb_array_elements_text(details->'evidence') loop if path not like p_job::text||'/trials/%' or not exists(select 1 from storage.objects o where o.bucket_id='bom-sources' and o.name=path) then raise exception 'INVALID_EVIDENCE';end if;end loop;
 end if;
 state:=app_private.mould_trial_state(p_job);fp:=state->>'fingerprint';
 if kind='assembly' then
  if (state->>'parts_total')::integer=0 or (state->>'parts_ready')::integer<>(state->>'parts_total')::integer then raise exception 'PARTS_NOT_READY';end if;
  if exists(select 1 from public.part_steps s join public.bom_items i on i.id=s.bom_item_id where i.job_id=p_job and i.archived_at is null and s.archived_at is null and s.done_on>day) then raise exception 'INVALID_DATE';end if;
 elsif kind='trial' then
  if state->'assembly'='null'::jsonb then raise exception 'ASSEMBLY_REQUIRED';end if;
  if (state->>'parts_ready')::integer<>(state->>'parts_total')::integer then raise exception 'PARTS_NOT_READY';end if;
  if stage is null or stage not between 0 and 2 or result is null or result not in ('passed','needs_correction','not_needed') or(stage=0 and result='not_needed') then raise exception 'INVALID_TRIAL_RESULT';end if;
  if result<>'needs_correction' and jsonb_array_length(state->'open_corrections')>0 then raise exception 'CORRECTIONS_OPEN';end if;
  previous:=case when stage=0 then state->'assembly' else state->'trials'->(stage-1)::text end;
  if previous is null or previous='null'::jsonb then raise exception 'PREVIOUS_TRIAL';end if;
  if day<(previous->>'actual_on')::date then raise exception 'INVALID_DATE';end if;
  if result in ('needs_correction','not_needed') and note='' then raise exception 'REASON_REQUIRED';end if;
  select max(e.sequence) into last_fix from public.mould_events e where e.job_id=p_job and e.kind in ('correction_open','correction_done') and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id);
  select max(e.sequence) into last_pass from public.mould_events e where e.job_id=p_job and e.kind='trial' and e.trial_result='passed' and e.work_fingerprint=fp and e.sequence>(state->'assembly'->>'sequence')::bigint and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id);
  if result='not_needed' and(last_pass is null or last_pass<coalesce(last_fix,0)) then raise exception 'RETEST_REQUIRED';end if;
  if exists(select 1 from public.mould_events e where e.job_id=p_job and e.kind='correction_done' and e.actual_on>day and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id)) then raise exception 'INVALID_DATE';end if;
 elsif kind in ('correction_done','void') then
  select * into related from public.mould_events where id=(p_data->>'related')::uuid and job_id=p_job;
  if not found or related.kind='void' or exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=related.id) then raise exception 'EVENT_UNAVAILABLE';end if;
  if kind='correction_done' then
   if not(related.kind='correction_open' or(related.kind='trial' and related.trial_result='needs_correction')) or exists(select 1 from public.mould_events d where d.related_id=related.id and d.kind='correction_done' and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=d.id)) then raise exception 'CORRECTION_RESOLVED';end if;
   if day<related.actual_on then raise exception 'INVALID_DATE';end if;
  else
   if clock_timestamp()>related.created_at+interval '10 seconds' then raise exception 'UNDO_EXPIRED';end if;
   if app_private.current_app_role()='operator' and related.created_by<>auth.uid() then raise exception 'Operation not permitted';end if;
   if exists(select 1 from public.mould_events e where e.job_id=p_job and e.sequence>related.sequence and e.kind<>'void' and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=e.id)) then raise exception 'EVENT_IN_USE';end if;
  end if;
 elsif kind='finish' then perform app_private.require_trial_finish(p_job);
 elsif kind='reopen' then if j.status<>'finished' then raise exception 'MOULD_NOT_FINISHED';end if;
 end if;
 insert into public.mould_events(id,job_id,kind,stage,trial_result,actual_on,notes,details,part_ids,related_id,work_fingerprint,request_digest,created_by) values(p_event,p_job,kind,case when kind='trial' then stage end,case when kind='trial' then result end,day,nullif(note,''),details,parts,related.id,fp,digest,auth.uid());
 if kind in ('finish','reopen') or(kind='void' and related.kind in ('finish','reopen')) then
  perform set_config('app.job_change_reason',case when kind='void' then 'Undo: '||coalesce(related.notes,related.kind) else note end,true);
  update public.jobs set status=case when kind='finish' or(kind='void' and related.kind='reopen') then 'finished' else 'active' end where id=p_job;
  perform set_config('app.job_change_reason','',true);
 end if;
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('job',p_job,jsonb_build_object('code','trial_'||kind,'values',jsonb_build_object('stage',stage,'date',day,'note',note))::text,'info',auth.uid());
 return p_event;
end $$;

-- Raw table updates cannot bypass the terminal workflow event or its completion gates.
create function app_private.guard_mould_terminal_state() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.mould_events;
begin
 if new.status is not distinct from old.status or(new.status<>'finished' and old.status<>'finished') then return new;end if;
 select m.* into e from public.mould_events m where m.job_id=new.id and m.kind in ('finish','reopen') and not exists(select 1 from public.mould_events v where v.kind='void' and v.related_id=m.id) order by m.sequence desc limit 1;
 if not found or e.kind<>(case when new.status='finished' then 'finish' else 'reopen' end) then raise exception 'TRIAL_WORKFLOW_REQUIRED';end if;
 if new.status='finished' then perform app_private.require_trial_finish(new.id);end if;return new;
end $$;
revoke all on function app_private.guard_mould_terminal_state() from public,anon,authenticated;
create trigger guard_mould_terminal_state before update of status on public.jobs for each row execute function app_private.guard_mould_terminal_state();
create function app_private.guard_closed_mould_work() returns trigger language plpgsql security definer set search_path='' as $$
declare job uuid;state text;
begin
 if tg_table_name='bom_items' then job:=new.job_id;else select job_id into job from public.bom_items where id=new.bom_item_id;end if;
 select status into state from public.jobs where id=job for share;
 if state='finished' then raise exception 'MOULD_CLOSED';end if;return new;
end $$;
revoke all on function app_private.guard_closed_mould_work() from public,anon,authenticated;
create trigger guard_closed_mould_work before insert or update on public.bom_items for each row execute function app_private.guard_closed_mould_work();
create trigger guard_closed_mould_work before insert or update on public.part_steps for each row execute function app_private.guard_closed_mould_work();

create function public.record_mould_event(p_job uuid,p_event uuid,p_data jsonb) returns uuid language sql security invoker set search_path='' as $$ select app_private.record_mould_event(p_job,p_event,p_data); $$;
create function public.mould_trial_state(p_job uuid) returns jsonb language sql stable security invoker set search_path='' as $$ select app_private.mould_trial_state(p_job); $$;
revoke all on function app_private.record_mould_event(uuid,uuid,jsonb),app_private.mould_trial_state(uuid),public.record_mould_event(uuid,uuid,jsonb),public.mould_trial_state(uuid) from public,anon;
grant execute on function app_private.record_mould_event(uuid,uuid,jsonb),app_private.mould_trial_state(uuid),public.record_mould_event(uuid,uuid,jsonb),public.mould_trial_state(uuid) to authenticated;
do $$ begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.mould_events;end if;end $$;
