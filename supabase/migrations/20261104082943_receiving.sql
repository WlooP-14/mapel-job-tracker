-- Receipts are events: corrections archive the original and append a replacement.
alter table public.receiving_checks add column received_on date;
alter table public.receiving_checks add column request_note text;
alter table public.receiving_checks add column corrects_receipt_id uuid references public.receiving_checks;
create index receiving_checks_corrects_idx on public.receiving_checks(corrects_receipt_id);
revoke insert,update on public.receiving_checks from authenticated;
create function app_private.guard_bom_item_update() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.job_id is distinct from old.job_id then raise exception 'PART_MOULD_CANNOT_CHANGE';end if;
 if new.qty_required is distinct from old.qty_required and exists(select 1 from public.part_steps where bom_item_id=old.id and archived_at is null and step_name<>'Received' and (batch_id is not null or status not in ('PENDING','NOT APPLICABLE'))) then raise exception 'QUANTITY_WITH_PROGRESS';end if;
 return new;
end $$;
revoke all on function app_private.guard_bom_item_update() from public,anon,authenticated;
create trigger guard_bom_item_update before update of job_id,qty_required on public.bom_items for each row execute function app_private.guard_bom_item_update();

create function app_private.lock_receipt_item(p_item uuid) returns public.bom_items
language plpgsql security definer set search_path='' as $$
declare v_item public.bom_items;
begin
 select * into v_item from public.bom_items where id=p_item and archived_at is null;
 if not found then raise exception 'PART_UNAVAILABLE';end if;
 perform 1 from public.jobs where id=v_item.job_id and archived_at is null and status in ('active','on_hold') for share;
 if not found then raise exception 'MOULD_CLOSED';end if;
 select * into v_item from public.bom_items where id=p_item and archived_at is null for update;
 if not found then raise exception 'PART_UNAVAILABLE';end if;
 return v_item;
end $$;
create function app_private.refresh_received_stage() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_item public.bom_items;v_id uuid;v_total numeric;v_first date;v_last date;v_status public.step_status;
begin
 v_id:=coalesce(to_jsonb(new)->>'bom_item_id',to_jsonb(new)->>'id')::uuid;
 select * into v_item from public.bom_items where id=v_id for update;
 select coalesce(sum(qty_found) filter(where result<>'wrong'),0),min(coalesce(received_on,checked_on::date)) filter(where result<>'wrong'),max(coalesce(received_on,checked_on::date)) filter(where result<>'wrong')
 into v_total,v_first,v_last from public.receiving_checks where bom_item_id=v_id and archived_at is null;
 v_status:=case when v_total>=v_item.qty_required then 'DONE'::public.step_status when v_total>0 then 'IN PROCESS'::public.step_status else 'PENDING'::public.step_status end;
 update public.part_steps set status=v_status,started_on=v_first,done_on=case when v_status='DONE' then v_last else null end where bom_item_id=v_id and step_name='Received' and archived_at is null;
 if not found then insert into public.part_steps(bom_item_id,step_name,status,started_on,done_on) values(v_id,'Received',v_status,v_first,case when v_status='DONE' then v_last else null end);end if;
 return new;
end $$;
create trigger refresh_received_stage after insert or update of archived_at on public.receiving_checks for each row execute function app_private.refresh_received_stage();
create trigger refresh_received_requirement after update of qty_required on public.bom_items for each row when (new.qty_required is distinct from old.qty_required) execute function app_private.refresh_received_stage();

create function app_private.receipt_flag(p_receipt uuid,p_item uuid,p_total numeric,p_expected numeric,p_result text) returns void
language sql security definer set search_path='' as $$
 insert into public.remarks(entity_type,entity_id,text,kind,created_by)
 values('receiving',p_receipt,jsonb_build_object('code','receipt_'||p_result,'values',jsonb_build_object('found',p_total,'expected',p_expected,'qty',abs(p_expected-p_total),'item',p_item))::text,case when p_result='ok' then 'info' else 'alert' end,auth.uid());
$$;

create function public.record_receipt(p_item uuid,p_receipt uuid,p_qty numeric,p_wrong boolean,p_received_on date,p_note text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_item public.bom_items;v_old public.receiving_checks;v_total numeric;v_result text;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 v_item:=app_private.lock_receipt_item(p_item);
 if p_receipt is null or p_qty is null or p_qty<0 or (p_qty=0 and not p_wrong) or p_qty::text in ('NaN','Infinity','-Infinity') or p_wrong is null or p_received_on is null or p_received_on>(clock_timestamp() at time zone 'Asia/Kolkata')::date or length(coalesce(p_note,''))>1000 then raise exception 'INVALID_RECEIPT';end if;
 select * into v_old from public.receiving_checks where id=p_receipt;
 if found then
  if v_old.bom_item_id=p_item and v_old.qty_found=p_qty and (v_old.result='wrong')=p_wrong and v_old.received_on=p_received_on and coalesce(v_old.request_note,'')=coalesce(p_note,'') and v_old.checked_by=auth.uid() and v_old.archived_at is null then return p_receipt;end if;
  raise exception 'RECEIPT_IDENTIFIER_USED';
 end if;
 select coalesce(sum(qty_found),0) into v_total from public.receiving_checks where bom_item_id=p_item and archived_at is null and result<>'wrong';
 v_total:=v_total+case when p_wrong then 0 else p_qty end;
 v_result:=case when p_wrong then 'wrong' when v_total<v_item.qty_required then 'short' when v_total>v_item.qty_required then 'excess' else 'ok' end;
 insert into public.receiving_checks(id,bom_item_id,qty_expected,qty_found,result,checked_by,received_on,request_note) values(p_receipt,p_item,v_item.qty_required,p_qty,v_result,auth.uid(),p_received_on,coalesce(p_note,''));
 perform app_private.receipt_flag(p_receipt,p_item,v_total,v_item.qty_required,v_result);
 return p_receipt;
end $$;

create function public.undo_receipt(p_receipt uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_old public.receiving_checks;v_previous public.receiving_checks;v_item public.bom_items;v_total numeric;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 select * into v_old from public.receiving_checks where id=p_receipt;
 if not found or (v_role='operator' and v_old.checked_by is distinct from auth.uid()) then raise exception 'RECEIPT_UNAVAILABLE';end if;
 v_item:=app_private.lock_receipt_item(v_old.bom_item_id);
 select * into v_old from public.receiving_checks where id=p_receipt for update;
 if v_old.archived_at is not null then return;end if;
 if clock_timestamp()>v_old.checked_on+interval '10 seconds' then raise exception 'UNDO_EXPIRED';end if;
 select coalesce(sum(qty_found),0) into v_total from public.receiving_checks where bom_item_id=v_item.id and archived_at is null and result<>'wrong' and id<>p_receipt;
 if v_old.corrects_receipt_id is not null then
  select * into v_previous from public.receiving_checks where id=v_old.corrects_receipt_id and bom_item_id=v_item.id for update;
  if not found or v_previous.archived_at is null then raise exception 'RECEIPT_UNAVAILABLE';end if;
  v_total:=v_total+case when v_previous.result='wrong' then 0 else v_previous.qty_found end;
 end if;
 if v_total<v_item.qty_required and exists(select 1 from public.part_steps where bom_item_id=v_item.id and archived_at is null and step_name<>'Received' and (batch_id is not null or status not in ('PENDING','NOT APPLICABLE'))) then raise exception 'RECEIPT_IN_USE';end if;
 update public.receiving_checks set archived_at=now() where id=p_receipt;
 if v_old.corrects_receipt_id is not null then update public.receiving_checks set archived_at=null where id=v_previous.id;end if;
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('receiving',p_receipt,jsonb_build_object('code','receipt_undone','values',jsonb_build_object('qty',v_old.qty_found))::text,'info',auth.uid());
end $$;

create function public.correct_receipt(p_old uuid,p_receipt uuid,p_qty numeric,p_wrong boolean,p_received_on date,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_old public.receiving_checks;v_new public.receiving_checks;v_item public.bom_items;v_total numeric;v_result text;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 select * into v_old from public.receiving_checks where id=p_old;
 if not found or (v_role='operator' and v_old.checked_by is distinct from auth.uid()) then raise exception 'RECEIPT_UNAVAILABLE';end if;
 v_item:=app_private.lock_receipt_item(v_old.bom_item_id);
 select * into v_new from public.receiving_checks where id=p_receipt;
 if found then
  if v_new.corrects_receipt_id=p_old and v_new.checked_by=auth.uid() and v_new.qty_found=p_qty and (v_new.result='wrong')=p_wrong and v_new.received_on=p_received_on and v_new.request_note=p_reason and v_new.archived_at is null then return p_receipt;end if;
  raise exception 'RECEIPT_IDENTIFIER_USED';
 end if;
 select * into v_old from public.receiving_checks where id=p_old and archived_at is null for update;
 if not found or p_receipt is null or nullif(btrim(p_reason),'') is null or length(p_reason)>1000 or p_qty is null or p_qty<0 or (p_qty=0 and not p_wrong) or p_qty::text in ('NaN','Infinity','-Infinity') or p_wrong is null or p_received_on is null or p_received_on>(clock_timestamp() at time zone 'Asia/Kolkata')::date then raise exception 'INVALID_RECEIPT';end if;
 select coalesce(sum(qty_found),0) into v_total from public.receiving_checks where bom_item_id=v_item.id and archived_at is null and result<>'wrong' and id<>p_old;
 v_total:=v_total+case when p_wrong then 0 else p_qty end;
 if v_total<v_item.qty_required and exists(select 1 from public.part_steps where bom_item_id=v_item.id and archived_at is null and step_name<>'Received' and (batch_id is not null or status not in ('PENDING','NOT APPLICABLE'))) then raise exception 'RECEIPT_IN_USE';end if;
 v_result:=case when p_wrong then 'wrong' when v_total<v_item.qty_required then 'short' when v_total>v_item.qty_required then 'excess' else 'ok' end;
 update public.receiving_checks set archived_at=now() where id=p_old;
 insert into public.receiving_checks(id,bom_item_id,qty_expected,qty_found,result,checked_by,received_on,request_note,corrects_receipt_id) values(p_receipt,v_item.id,v_item.qty_required,p_qty,v_result,auth.uid(),p_received_on,p_reason,p_old);
 perform app_private.receipt_flag(p_receipt,v_item.id,v_total,v_item.qty_required,v_result);
 insert into public.remarks(entity_type,entity_id,text,kind,created_by) values('receiving',p_receipt,jsonb_build_object('code','receipt_corrected','values',jsonb_build_object('old',v_old.qty_found,'qty',p_qty))::text,'info',auth.uid());
 return p_receipt;
end $$;

create function public.set_hardware_step(p_item uuid,p_step text,p_done boolean) returns void
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_item public.bom_items;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 v_item:=app_private.lock_receipt_item(p_item);
 if v_item.category<>'hardware' or p_step not in ('Verified','Issued') or p_step is null or p_done is null then raise exception 'INVALID_HARDWARE_STEP';end if;
 if p_done and not exists(select 1 from public.part_steps where bom_item_id=p_item and step_name='Received' and status='DONE' and archived_at is null) then raise exception 'RECEIVE_FIRST';end if;
 if p_done and p_step='Issued' and not exists(select 1 from public.part_steps where bom_item_id=p_item and step_name='Verified' and status='DONE' and archived_at is null) then raise exception 'VERIFY_FIRST';end if;
 if not p_done and p_step='Verified' and exists(select 1 from public.part_steps where bom_item_id=p_item and step_name='Issued' and status='DONE' and archived_at is null) then raise exception 'UNDO_ISSUE_FIRST';end if;
 update public.part_steps set status=case when p_done then 'DONE'::public.step_status else 'PENDING'::public.step_status end,done_on=case when p_done then (clock_timestamp() at time zone 'Asia/Kolkata')::date else null end where bom_item_id=p_item and step_name=p_step and archived_at is null;
 if not found then raise exception 'HARDWARE_STEP_UNAVAILABLE';end if;
end $$;

revoke all on function app_private.lock_receipt_item(uuid),app_private.refresh_received_stage(),app_private.receipt_flag(uuid,uuid,numeric,numeric,text) from public,anon,authenticated;
revoke all on function public.record_receipt(uuid,uuid,numeric,boolean,date,text),public.undo_receipt(uuid),public.correct_receipt(uuid,uuid,numeric,boolean,date,text),public.set_hardware_step(uuid,text,boolean) from public,anon;
grant execute on function public.record_receipt(uuid,uuid,numeric,boolean,date,text),public.undo_receipt(uuid),public.correct_receipt(uuid,uuid,numeric,boolean,date,text),public.set_hardware_step(uuid,text,boolean) to authenticated;

-- History may show actor names without exposing the users directory, phone or role.
create function public.team_actor_names(p_ids uuid[]) returns table(id uuid,name text)
language plpgsql stable security definer set search_path='' as $$
begin
 if app_private.current_app_role() is null then raise exception 'Operation not permitted';end if;
 if coalesce(array_length(p_ids,1),0)>2000 then raise exception 'Too many actors';end if;
 return query select u.id,u.name from public.users u where u.id=any(p_ids) and
 (exists(select 1 from public.receiving_checks r where r.checked_by=u.id)
 or exists(select 1 from public.jobs j where j.created_by=u.id)
 or exists(select 1 from public.job_date_history h where h.changed_by=u.id)
 or exists(select 1 from public.remarks r where r.created_by=u.id));
end $$;
revoke all on function public.team_actor_names(uuid[]) from public,anon;
grant execute on function public.team_actor_names(uuid[]) to authenticated;

do $$ declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['receiving_checks','remarks'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
  end loop;
 end if;
end $$;
