-- Optional processes stay out of the default route until explicitly selected.
alter table public.step_templates add column default_selected boolean not null default true;

insert into public.step_templates(category,step_name,order_no,default_days,default_selected)
select 'turn','Nitriding',coalesce(max(order_no),0)+1,null,false
from public.step_templates where category='turn'
having not exists(select 1 from public.step_templates where category='turn' and lower(btrim(step_name))='nitriding' and archived_at is null);

create function app_private.save_processing_step(p_id uuid,p_category public.category,p_name text,p_days integer,p_order integer,p_default boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_role public.app_role;v_old public.step_templates;
begin
 v_role:=app_private.current_app_role();
 if v_role is null or v_role not in ('admin','developer','operator') then raise exception 'Operation not permitted';end if;
 if p_id is null or p_category is null or p_category='hardware' or nullif(btrim(p_name),'') is null or length(btrim(p_name))>80
  or lower(btrim(p_name)) in ('received','verified','issued') or p_days is null or p_days not between 0 and 365
  or p_order is null or p_order not between 1 and 999 or p_default is null then raise exception 'INVALID_PROCESS';end if;
 -- Serialize process creation per section, including concurrent requests and retries.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('mjt-process-'||p_category::text));
 select * into v_old from public.step_templates where id=p_id for update;
 if found then
  if v_old.category<>p_category or v_old.step_name<>btrim(p_name) or v_old.archived_at is not null then raise exception 'PROCESS_IDENTIFIER_USED';end if;
 else
  if exists(select 1 from public.step_templates where category=p_category and lower(btrim(step_name))=lower(btrim(p_name)) and archived_at is null) then raise exception 'PROCESS_NAME_EXISTS';end if;
 end if;
 if v_old.id is null or p_order<v_old.order_no then
  update public.step_templates set order_no=order_no+1
  where category=p_category and archived_at is null and step_name<>'Received' and id<>p_id
   and order_no>=p_order and (v_old.id is null or order_no<v_old.order_no);
 elsif p_order>v_old.order_no then
  update public.step_templates set order_no=order_no-1
  where category=p_category and archived_at is null and step_name<>'Received' and id<>p_id
   and order_no>v_old.order_no and order_no<=p_order;
 end if;
 if v_old.id is not null then
  update public.step_templates set default_days=p_days,order_no=p_order,default_selected=p_default where id=p_id;
 else
  insert into public.step_templates(id,category,step_name,default_days,order_no,default_selected)
  values(p_id,p_category,btrim(p_name),p_days,p_order,p_default);
 end if;
 return p_id;
end $$;
revoke all on function app_private.save_processing_step(uuid,public.category,text,integer,integer,boolean) from public,anon;
grant execute on function app_private.save_processing_step(uuid,public.category,text,integer,integer,boolean) to authenticated;
create function public.save_processing_step(p_id uuid,p_category public.category,p_name text,p_days integer,p_order integer,p_default boolean)
returns uuid language sql security invoker set search_path='' as $$
 select app_private.save_processing_step(p_id,p_category,p_name,p_days,p_order,p_default);
$$;
revoke all on function public.save_processing_step(uuid,public.category,text,integer,integer,boolean) from public,anon;
grant execute on function public.save_processing_step(uuid,public.category,text,integer,integer,boolean) to authenticated;

create or replace function public.add_bom_item(p_job uuid,p_item jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_role public.app_role; v_category public.category; v_id uuid; v_qty numeric; v_serial integer; v_revision integer; v_existing public.bom_items;
begin
 v_role:=app_private.current_app_role();
 if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted'; end if;
 -- Serialize part numbering and BOM snapshots per mould, including concurrent phone edits.
 perform 1 from public.jobs where id=p_job and archived_at is null and status in ('active','on_hold') for update;
 if not found then raise exception 'Mould is not open for BOM changes'; end if;
 if jsonb_typeof(p_item)<>'object' or p_item is null then raise exception 'Invalid part'; end if;
 v_category:=(p_item->>'category')::public.category;
 if v_category is null or nullif(btrim(p_item->>'name'),'') is null or length(btrim(p_item->>'name'))>160 then raise exception 'Invalid part name or category'; end if;
 v_qty:=(p_item->>'qty_required')::numeric;
 if v_qty is null or v_qty<=0 or v_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Quantity must be positive'; end if;
 v_id:=coalesce((p_item->>'id')::uuid,gen_random_uuid());
 select * into v_existing from public.bom_items where id=v_id;
 if found then
  if v_existing.job_id=p_job and v_existing.archived_at is null
   and v_existing.category=v_category and v_existing.name=btrim(p_item->>'name') and v_existing.qty_required=v_qty
   and v_existing.material is not distinct from nullif(btrim(p_item->>'material'),'')
   and v_existing.finish_size_text is not distinct from nullif(p_item->>'finish_size_text','')
   and v_existing.rough_size_text is not distinct from nullif(p_item->>'rough_size_text','')
   and v_existing.size_text is not distinct from nullif(p_item->>'size_text','')
   and v_existing.remark is not distinct from nullif(p_item->>'remark','')
   and v_existing.two_d_submitted=coalesce((p_item->>'two_d_submitted')::boolean,false)
   then return v_id; end if;
  raise exception 'Part identifier is already used';
 end if;
 if not exists(select 1 from public.step_templates where category=v_category and active and archived_at is null) then raise exception 'No active steps configured for category'; end if;
 select coalesce(max(serial_no),0)+1 into v_serial from public.bom_items where job_id=p_job and category=v_category and archived_at is null;
 insert into public.bom_items(id,job_id,category,serial_no,name,material,finish_size_text,rough_size_text,finish_dims,rough_dims,size_text,remark,qty_required,two_d_submitted,notes)
 values(v_id,p_job,v_category,v_serial,btrim(p_item->>'name'),nullif(btrim(p_item->>'material'),''),nullif(p_item->>'finish_size_text',''),nullif(p_item->>'rough_size_text',''),nullif(p_item->'finish_dims','null'::jsonb),nullif(p_item->'rough_dims','null'::jsonb),nullif(p_item->>'size_text',''),nullif(p_item->>'remark',''),v_qty,coalesce((p_item->>'two_d_submitted')::boolean,false),nullif(p_item->>'notes',''));
 insert into public.part_steps(bom_item_id,step_name,status)
 select v_id,step_name,'PENDING' from public.step_templates where category=v_category and active and archived_at is null and default_selected order by order_no;
 select coalesce(max(revision_no),0)+1 into v_revision from public.bom_revisions where job_id=p_job;
 insert into public.bom_revisions(job_id,revision_no,snapshot,reason,created_by)
 select p_job,v_revision,coalesce(jsonb_agg(to_jsonb(i) order by i.category,i.serial_no),'[]'::jsonb),'manual_add',auth.uid()
 from public.bom_items i where i.job_id=p_job and i.archived_at is null;
 return v_id;
end $$;
create or replace function public.revise_bom_item(p_job uuid,p_item jsonb,p_reason text) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_old public.bom_items;v_category public.category;v_qty numeric;v_revision integer;v_role public.app_role;
begin
 v_role:=app_private.current_app_role();
 if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 perform 1 from public.jobs where id=p_job and archived_at is null and status in ('active','on_hold') for update;
 if not found then raise exception 'Mould is not open for BOM changes';end if;
 select * into v_old from public.bom_items where id=(p_item->>'update_id')::uuid and job_id=p_job and archived_at is null for update;
 if not found then raise exception 'Original part unavailable';end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Revision reason required';end if;
 v_category:=(p_item->>'category')::public.category;v_qty:=(p_item->>'qty_required')::numeric;
 if v_category is null or nullif(btrim(p_item->>'name'),'') is null or length(btrim(p_item->>'name'))>160 or v_qty is null or v_qty<=0 or v_qty::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid reviewed part';end if;
 if v_category<>v_old.category then
  if not exists(select 1 from public.step_templates where category=v_category and active and archived_at is null) then raise exception 'No active steps configured';end if;
  if exists(select 1 from public.part_steps where bom_item_id=v_old.id and archived_at is null and (status<>'PENDING' or batch_id is not null)) then raise exception 'Cannot move a part with progress';end if;
  update public.part_steps set archived_at=now() where bom_item_id=v_old.id and archived_at is null;
 end if;
 update public.bom_items set category=v_category,serial_no=case when category=v_category then serial_no else (select coalesce(max(serial_no),0)+1 from public.bom_items where job_id=p_job and category=v_category and archived_at is null) end,
 name=btrim(p_item->>'name'),material=nullif(btrim(p_item->>'material'),''),qty_required=v_qty,finish_size_text=nullif(p_item->>'finish_size_text',''),rough_size_text=nullif(p_item->>'rough_size_text',''),finish_dims=nullif(p_item->'finish_dims','null'::jsonb),rough_dims=nullif(p_item->'rough_dims','null'::jsonb),size_text=nullif(p_item->>'size_text',''),remark=nullif(p_item->>'remark',''),two_d_submitted=coalesce((p_item->>'two_d_submitted')::boolean,false)
 where id=v_old.id;
 if v_category<>v_old.category then
  insert into public.part_steps(bom_item_id,step_name,status) select v_old.id,step_name,'PENDING' from public.step_templates where category=v_category and active and archived_at is null and default_selected order by order_no;
 end if;
 select coalesce(max(revision_no),0)+1 into v_revision from public.bom_revisions where job_id=p_job;
 insert into public.bom_revisions(job_id,revision_no,snapshot,reason,created_by) select p_job,v_revision,coalesce(jsonb_agg(to_jsonb(i) order by i.category,i.serial_no),'[]'::jsonb),btrim(p_reason),auth.uid() from public.bom_items i where job_id=p_job and archived_at is null;
 return v_old.id;
end $$;
