-- Public RPCs run as the caller. Privileged receipt logic stays in the private schema.
-- Every writer checks the current database-backed role before accessing rows.
alter function public.record_receipt(uuid,uuid,numeric,boolean,date,text) set schema app_private;
alter function public.undo_receipt(uuid) set schema app_private;
alter function public.correct_receipt(uuid,uuid,numeric,boolean,date,text) set schema app_private;
alter function public.set_hardware_step(uuid,text,boolean) set schema app_private;
alter function public.team_actor_names(uuid[]) set schema app_private;

-- Operators can correct any team receipt, with an append-only reason and actor.
create or replace function app_private.correct_receipt(p_old uuid,p_receipt uuid,p_qty numeric,p_wrong boolean,p_received_on date,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_old public.receiving_checks;v_new public.receiving_checks;v_item public.bom_items;v_total numeric;v_result text;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 select * into v_old from public.receiving_checks where id=p_old;
 if not found then raise exception 'RECEIPT_UNAVAILABLE';end if;
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


create function public.record_receipt(p_item uuid,p_receipt uuid,p_qty numeric,p_wrong boolean,p_received_on date,p_note text default '') returns uuid
language sql security invoker set search_path='' as $$ select app_private.record_receipt(p_item,p_receipt,p_qty,p_wrong,p_received_on,p_note); $$;
revoke all on function public.record_receipt(uuid,uuid,numeric,boolean,date,text) from public,anon;
grant execute on function public.record_receipt(uuid,uuid,numeric,boolean,date,text) to authenticated;
revoke all on function app_private.record_receipt(uuid,uuid,numeric,boolean,date,text) from public,anon;
grant execute on function app_private.record_receipt(uuid,uuid,numeric,boolean,date,text) to authenticated;

create function public.undo_receipt(p_receipt uuid) returns void
language sql security invoker set search_path='' as $$ select app_private.undo_receipt(p_receipt); $$;
revoke all on function public.undo_receipt(uuid) from public,anon;
grant execute on function public.undo_receipt(uuid) to authenticated;
revoke all on function app_private.undo_receipt(uuid) from public,anon;
grant execute on function app_private.undo_receipt(uuid) to authenticated;

create function public.correct_receipt(p_old uuid,p_receipt uuid,p_qty numeric,p_wrong boolean,p_received_on date,p_reason text) returns uuid
language sql security invoker set search_path='' as $$ select app_private.correct_receipt(p_old,p_receipt,p_qty,p_wrong,p_received_on,p_reason); $$;
revoke all on function public.correct_receipt(uuid,uuid,numeric,boolean,date,text) from public,anon;
grant execute on function public.correct_receipt(uuid,uuid,numeric,boolean,date,text) to authenticated;
revoke all on function app_private.correct_receipt(uuid,uuid,numeric,boolean,date,text) from public,anon;
grant execute on function app_private.correct_receipt(uuid,uuid,numeric,boolean,date,text) to authenticated;

create function public.set_hardware_step(p_item uuid,p_step text,p_done boolean) returns void
language sql security invoker set search_path='' as $$ select app_private.set_hardware_step(p_item,p_step,p_done); $$;
revoke all on function public.set_hardware_step(uuid,text,boolean) from public,anon;
grant execute on function public.set_hardware_step(uuid,text,boolean) to authenticated;
revoke all on function app_private.set_hardware_step(uuid,text,boolean) from public,anon;
grant execute on function app_private.set_hardware_step(uuid,text,boolean) to authenticated;

create function public.team_actor_names(p_ids uuid[]) returns table(id uuid,name text)
language sql security invoker set search_path='' as $$ select * from app_private.team_actor_names(p_ids); $$;
revoke all on function public.team_actor_names(uuid[]) from public,anon;
grant execute on function public.team_actor_names(uuid[]) to authenticated;
revoke all on function app_private.team_actor_names(uuid[]) from public,anon;
grant execute on function app_private.team_actor_names(uuid[]) to authenticated;

