create or replace function app_private.undo_receipt(p_receipt uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_old public.receiving_checks;v_previous public.receiving_checks;v_item public.bom_items;v_total numeric;
begin
 v_role:=app_private.current_app_role();if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 select * into v_old from public.receiving_checks where id=p_receipt;
 if not found or (v_role='operator' and v_old.checked_by is distinct from auth.uid()) then raise exception 'RECEIPT_UNAVAILABLE';end if;
 v_item:=app_private.lock_receipt_item(v_old.bom_item_id);
 select * into v_old from public.receiving_checks where id=p_receipt for update;
 if v_old.archived_at is not null then return;end if;
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
