-- Phase 2: transactional mould creation and manual BOM entry. RLS remains enforced.
create function public.create_mould(p_code text, p_name text, p_trial date,
 p_priority text default 'normal', p_customer uuid default null, p_new_customer text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_role public.app_role; v_customer uuid := p_customer; v_job uuid;
begin
 v_role := app_private.current_app_role();
 if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted'; end if;
 if upper(btrim(p_code)) !~ '^[A-Z0-9][A-Z0-9_-]{1,59}$' or nullif(btrim(p_code),'') is null then raise exception 'Invalid mould code'; end if;
 if nullif(btrim(p_name),'') is null or length(btrim(p_name))>160 or p_trial is null then raise exception 'Name and trial date are required'; end if;
 if p_priority not in ('normal','high','urgent') or p_priority is null then raise exception 'Invalid priority'; end if;
 if nullif(btrim(p_new_customer),'') is not null then
  if v_role not in ('developer','admin') then raise exception 'Customer creation not permitted'; end if;
  if p_customer is not null or length(btrim(p_new_customer))>160 then raise exception 'Invalid customer'; end if;
  select id into v_customer from public.customers where lower(name)=lower(btrim(p_new_customer)) and archived_at is null order by id limit 1;
  if v_customer is null then insert into public.customers(name) values(btrim(p_new_customer)) returning id into v_customer; end if;
 end if;
 if v_customer is not null and not exists(select 1 from public.customers where id=v_customer and archived_at is null) then raise exception 'Customer is unavailable'; end if;
 insert into public.jobs(mould_code,name,customer_id,qr_code,trial_date_t0,priority,created_by)
 values(upper(btrim(p_code)),btrim(p_name),v_customer,upper(btrim(p_code)),p_trial,p_priority,auth.uid()) returning id into v_job;
 return v_job;
end $$;
revoke all on function public.create_mould(text,text,date,text,uuid,text) from public,anon;
grant execute on function public.create_mould(text,text,date,text,uuid,text) to authenticated;

-- Receiving is part of every route; existing duration settings are preserved.
insert into public.step_templates(category,step_name,order_no,default_days)
select c,'Received',0,null from unnest(array['base','child','turn']::public.category[]) c
where not exists(select 1 from public.step_templates t where t.category=c and t.step_name='Received' and t.archived_at is null);
create unique index bom_items_job_category_serial_active_idx on public.bom_items(job_id,category,serial_no) where archived_at is null;

create function public.add_bom_item(p_job uuid,p_item jsonb) returns uuid
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
 select v_id,step_name,'PENDING' from public.step_templates where category=v_category and active and archived_at is null order by order_no;
 select coalesce(max(revision_no),0)+1 into v_revision from public.bom_revisions where job_id=p_job;
 insert into public.bom_revisions(job_id,revision_no,snapshot,reason,created_by)
 select p_job,v_revision,coalesce(jsonb_agg(to_jsonb(i) order by i.category,i.serial_no),'[]'::jsonb),'manual_add',auth.uid()
 from public.bom_items i where i.job_id=p_job and i.archived_at is null;
 return v_id;
end $$;
revoke all on function public.add_bom_item(uuid,jsonb) from public,anon;
grant execute on function public.add_bom_item(uuid,jsonb) to authenticated;

-- Customer master data is admin-managed; operators select existing customers.
drop policy write_operational on public.customers;
drop policy update_operational on public.customers;
create policy insert_customer on public.customers for insert to authenticated with check ((select app_private.current_app_role()) in ('developer','admin'));
create policy update_customer on public.customers for update to authenticated using ((select app_private.current_app_role()) in ('developer','admin')) with check ((select app_private.current_app_role()) in ('developer','admin'));
-- Publish only operational mould data; row-level security still controls subscribers.
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['jobs','bom_items','part_steps','bom_revisions'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
    execute format('alter publication supabase_realtime add table public.%I',t);
   end if;
  end loop;
 end if;
end $$;
