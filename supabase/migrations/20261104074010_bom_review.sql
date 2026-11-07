-- Reviewed BOM imports are atomic and retry-safe; original files stay immutable.
alter table public.bom_sheets add column import_id uuid;
alter table public.bom_sheets add column import_digest text;
create unique index bom_sheets_import_section_idx on public.bom_sheets(import_id,section) where import_id is not null;
create function public.revise_bom_item(p_job uuid,p_item jsonb,p_reason text) returns uuid
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
  insert into public.part_steps(bom_item_id,step_name,status) select v_old.id,step_name,'PENDING' from public.step_templates where category=v_category and active and archived_at is null order by order_no;
 end if;
 select coalesce(max(revision_no),0)+1 into v_revision from public.bom_revisions where job_id=p_job;
 insert into public.bom_revisions(job_id,revision_no,snapshot,reason,created_by) select p_job,v_revision,coalesce(jsonb_agg(to_jsonb(i) order by i.category,i.serial_no),'[]'::jsonb),btrim(p_reason),auth.uid() from public.bom_items i where job_id=p_job and archived_at is null;
 return v_old.id;
end $$;
revoke all on function public.revise_bom_item(uuid,jsonb,text) from public,anon;
grant execute on function public.revise_bom_item(uuid,jsonb,text) to authenticated;
create function public.import_bom(p_job uuid,p_import uuid,p_rows jsonb,p_metadata jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_role public.app_role;v_job public.jobs;v_row jsonb;v_section public.category;v_digest text;v_old text;v_source text;v_revision integer;
begin
 v_role:=app_private.current_app_role();
 if v_role is null or v_role not in ('developer','admin','operator') then raise exception 'Operation not permitted';end if;
 select * into v_job from public.jobs where id=p_job and archived_at is null and status in ('active','on_hold') for update;
 if not found then raise exception 'Mould is not open for BOM changes';end if;
 if p_import is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 1000 or jsonb_typeof(p_metadata) is distinct from 'object' then raise exception 'Invalid reviewed BOM';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) group by value->>'id' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(p_rows) where nullif(value->>'update_id','') is not null group by value->>'update_id' having count(*)>1) then raise exception 'Duplicate reviewed row identifiers';end if;
 if upper(btrim(p_metadata->>'code')) is distinct from v_job.mould_code then raise exception 'Mould code mismatch';end if;
 v_source:=nullif(p_metadata->>'source','');
 if v_source is not null and split_part(v_source,'/',1)<>p_job::text then raise exception 'Source must belong to this mould';end if;
 v_digest:=md5(p_rows::text||p_metadata::text);
 select import_digest into v_old from public.bom_sheets where job_id=p_job and import_id=p_import limit 1;
 if found then if v_old=v_digest then return p_import;else raise exception 'Import identifier already used';end if;end if;
 for v_row in select value from jsonb_array_elements(p_rows) loop
  if nullif(v_row->>'id','') is null then raise exception 'Each reviewed row requires an identifier';end if;
  if nullif(v_row->>'update_id','') is null then perform public.add_bom_item(p_job,v_row);
  else perform public.revise_bom_item(p_job,v_row,p_metadata->>'reason');end if;
 end loop;
 select max(revision_no) into v_revision from public.bom_revisions where job_id=p_job;
 for v_section in select distinct (value->>'category')::public.category from jsonb_array_elements(p_rows) loop
  insert into public.bom_sheets(job_id,section,title,prepared_by,review_by,checked_by,order_by,received_by,sheet_date,source_image,revision_no,import_id,import_digest)
  values(p_job,v_section,v_job.mould_code||' '||v_job.name,p_metadata->>'prepared_by',p_metadata->>'review_by',p_metadata->>'checked_by',p_metadata->>'order_by',p_metadata->>'received_by',p_metadata->>'sheet_date',v_source,v_revision,p_import,v_digest);
 end loop;
 return p_import;
end $$;
revoke all on function public.import_bom(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.import_bom(uuid,uuid,jsonb,jsonb) to authenticated;
