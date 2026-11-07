-- Private source files. Object names are <job uuid>/<unique filename>.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('bom-sources', 'bom-sources', false, 10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create function public.storage_job_exists(object_name text) returns boolean
language sql stable security invoker set search_path = public
as $$ select exists(select 1 from public.jobs where id::text = split_part(object_name,'/',1) and archived_at is null) $$;
revoke all on function public.storage_job_exists(text) from public;
grant execute on function public.storage_job_exists(text) to authenticated;
create policy read_bom_sources on storage.objects for select to authenticated
using (bucket_id = 'bom-sources' and public.current_app_role() is not null and public.storage_job_exists(name));
create policy add_bom_sources on storage.objects for insert to authenticated
with check (bucket_id = 'bom-sources' and public.current_app_role() in ('developer','admin','operator') and public.storage_job_exists(name));
-- No update or delete policies: original uploads are preserved; revisions use new keys.

-- Client registration of public keys is disabled until WebAuthn challenges are verified server-side.
drop policy developer_credentials_only on public.developer_credentials;
create policy developer_credentials_read on public.developer_credentials for select to authenticated
using (public.current_app_role()='developer' and user_id=auth.uid());

create function public.validate_part_step() returns trigger
language plpgsql set search_path = public as $$
declare item_job uuid; batch_job uuid; item_category public.category;
begin
  select job_id,category into item_job,item_category from public.bom_items where id=new.bom_item_id;
  if new.batch_id is not null then
    select job_id into batch_job from public.dispatch_batches where id=new.batch_id;
    if batch_job is distinct from item_job then raise exception 'Batch and part must belong to the same mould'; end if;
  end if;
  if item_category='hardware' and (new.mode is not null or new.vendor_id is not null or new.batch_id is not null) then
    raise exception 'Hardware does not use planning or vendor allotment';
  end if;
  return new;
end $$;
create trigger check_part_step before insert or update on public.part_steps
for each row execute function public.validate_part_step();

create function public.validate_batch_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.bom_items i join public.dispatch_batches b on b.job_id=i.job_id
    where i.id=new.bom_item_id and b.id=new.batch_id and i.category<>'hardware') then
    raise exception 'Only processing parts from the same mould can be allotted';
  end if;
  return new;
end $$;
create trigger check_batch_item before insert or update on public.batch_items
for each row execute function public.validate_batch_item();

insert into public.step_templates(category,step_name,order_no,default_days)
values ('hardware','Received',1,null),('hardware','Verified',2,null),('hardware','Issued',3,null);

-- Unplanned parts count as waiting. Parts explicitly marked all-not-applicable do not count.
create or replace view public.readiness with (security_invoker=true) as
select j.id as job_id,
 count(i.id) filter (where not exists(select 1 from public.part_steps s where s.bom_item_id=i.id and s.archived_at is null)
   or exists(select 1 from public.part_steps s where s.bom_item_id=i.id and s.archived_at is null and s.status<>'NOT APPLICABLE')) as parts_total,
 count(i.id) filter (where exists(select 1 from public.part_steps s where s.bom_item_id=i.id and s.archived_at is null and s.status<>'NOT APPLICABLE')
   and not exists(select 1 from public.part_steps s where s.bom_item_id=i.id and s.archived_at is null and s.status not in ('DONE','NOT APPLICABLE'))) as parts_ready
from public.jobs j left join public.bom_items i on i.job_id=j.id and i.archived_at is null
where j.archived_at is null group by j.id;

-- Explicit privileges keep access independent of a project's default grants. RLS narrows these.
grant usage on schema public to authenticated;
grant select,insert,update on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke insert,update,delete on public.audit_log from authenticated;
revoke update,delete on public.remarks,public.bom_revisions,public.job_date_history from authenticated;
revoke insert,update,delete on public.developer_credentials,public.kill_requests from authenticated;
