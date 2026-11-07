-- Calendar helpers use the same Sunday/holiday rules as the tested client engine.
create function public.shift_working_days(p_start date,p_days integer) returns date
language plpgsql stable security invoker set search_path='' as $$
declare v_day date:=p_start;v_left integer:=abs(p_days);v_direction integer:=case when p_days<0 then -1 else 1 end;
begin
 if p_start is null or p_days is null or abs(p_days)>3650 then raise exception 'Invalid working-day range';end if;
 while v_left>0 loop
  v_day:=v_day+v_direction;
  if extract(dow from v_day)<>0 and not exists(select 1 from public.holidays where date=v_day and archived_at is null) then v_left:=v_left-1;end if;
 end loop;
 return v_day;
end $$;
create function public.working_days_between(p_start date,p_end date) returns integer
language plpgsql stable security invoker set search_path='' as $$
declare v_day date:=least(p_start,p_end);v_end date:=greatest(p_start,p_end);v_count integer:=0;
begin
 if p_start is null or p_end is null or v_end-v_day>5000 then raise exception 'Invalid working-day range';end if;
 while v_day<v_end loop
  v_day:=v_day+1;
  if extract(dow from v_day)<>0 and not exists(select 1 from public.holidays where date=v_day and archived_at is null) then v_count:=v_count+1;end if;
 end loop;
 return v_count*case when p_end<p_start then -1 else 1 end;
end $$;
revoke all on function public.shift_working_days(date,integer),public.working_days_between(date,date) from public,anon;
grant execute on function public.shift_working_days(date,integer),public.working_days_between(date,date) to authenticated;

create function app_private.keep_job_plan_history() returns trigger
language plpgsql security invoker set search_path='' as $$
declare v_field text;v_reason text:=nullif(btrim(current_setting('app.job_change_reason',true)),'');v_delta integer;
begin
 foreach v_field in array array['trial_date_t0','priority','status','name','customer_id'] loop
  if (to_jsonb(old)->>v_field) is distinct from (to_jsonb(new)->>v_field) then
   if v_reason is null then raise exception 'A reason is required for mould changes';end if;
   insert into public.job_date_history(job_id,field,old_value,new_value,reason,changed_by) values(new.id,v_field,to_jsonb(old)->>v_field,to_jsonb(new)->>v_field,v_reason,auth.uid());
  end if;
 end loop;
 if old.trial_date_t0 is distinct from new.trial_date_t0 and old.trial_date_t0 is not null and new.trial_date_t0 is not null then
  v_delta:=public.working_days_between(old.trial_date_t0,new.trial_date_t0);
  update public.part_steps s set planned_date=case when s.planned_date is null then null else public.shift_working_days(s.planned_date,v_delta) end,
   target_date=case when s.started_on is not null or s.target_date is null then s.target_date else public.shift_working_days(s.target_date,v_delta) end
  from public.bom_items i where s.bom_item_id=i.id and i.job_id=new.id and s.archived_at is null and i.archived_at is null and s.status not in ('DONE','NOT APPLICABLE');
 end if;
 return new;
end $$;
revoke all on function app_private.keep_job_plan_history() from public,anon,authenticated;
create trigger keep_job_plan_history before update of trial_date_t0,priority,status,name,customer_id on public.jobs for each row execute function app_private.keep_job_plan_history();

create function public.change_mould_plan(p_job uuid,p_trial date,p_priority text,p_status text,p_name text,p_customer uuid,p_reason text) returns void
language plpgsql security invoker set search_path='' as $$
declare v_role public.app_role;v_job public.jobs;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 select * into v_job from public.jobs where id=p_job and archived_at is null for update;
 if not found or v_job.status not in ('active','on_hold') then raise exception 'Mould is not open for changes';end if;
 if p_trial is null or p_priority is null or p_priority not in ('normal','high','urgent') or p_status is null or p_status not in ('active','on_hold') or nullif(btrim(p_name),'') is null or length(btrim(p_name))>160 or nullif(btrim(p_reason),'') is null then raise exception 'Invalid mould changes or missing reason';end if;
 if p_customer is not null and not exists(select 1 from public.customers where id=p_customer and archived_at is null) then raise exception 'Customer is unavailable';end if;
 perform set_config('app.job_change_reason',btrim(p_reason),true);
 update public.jobs set trial_date_t0=p_trial,priority=p_priority,status=p_status,name=btrim(p_name),customer_id=p_customer where id=p_job;
 perform set_config('app.job_change_reason','',true);
end $$;
revoke all on function public.change_mould_plan(uuid,date,text,text,text,uuid,text) from public,anon;
grant execute on function public.change_mould_plan(uuid,date,text,text,text,uuid,text) to authenticated;
