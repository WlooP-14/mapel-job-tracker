-- Run in Supabase SQL Editor ONLY after manually applying the configurable-process
-- and admin-data-management migrations. This registers those already-applied changes.
-- No mould, part, user, Storage or audit records are changed.
begin;
do $$ declare item record;begin
 if to_regclass('supabase_migrations.schema_migrations') is null then raise exception 'Existing migration history is missing. Stop and review before registering migrations.';end if;
 if to_regprocedure('public.save_processing_step(uuid,public.category,text,integer,integer,boolean)') is null
 or to_regprocedure('public.admin_manage_record(text,text,text,jsonb,text,text)') is null
 or to_regclass('public.jobs_current_mould_code_key') is null
 or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='audit_log' and column_name='reason')
 then raise exception 'The final migrations are not fully applied yet. Apply the pending migration SQL before registering history.';end if;
 if position('__part' in pg_get_functiondef('app_private.admin_list_records(text,uuid,boolean,text,integer)'::regprocedure))=0 then raise exception 'The final management migration is not applied. Review the SQL version first.';end if;
 for item in select * from (values('20261112075423','configurable_processes'),('20261112160000','admin_data_management')) as expected(version,name) loop
  if exists(select 1 from supabase_migrations.schema_migrations where (version=item.version and name is distinct from item.name) or (name=item.name and version<>item.version)) then raise exception 'Migration history uses another version. Review before registering; nothing was changed.';end if;
  insert into supabase_migrations.schema_migrations(version,name,statements) values(item.version,item.name,array[]::text[]) on conflict(version) do nothing;
 end loop;
end $$;
commit;
