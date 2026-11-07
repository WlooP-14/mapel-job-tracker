create schema if not exists app_private;
revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
-- Keep RLS role lookup and trigger privilege outside the exposed public API schema.
alter function public.current_app_role() set schema app_private;
alter function public.audit_change() set schema app_private;
revoke all on function app_private.current_app_role() from public, anon, authenticated;
grant execute on function app_private.current_app_role() to authenticated;
revoke all on function app_private.audit_change() from public, anon, authenticated;
alter function public.no_delete() set search_path = '';
alter function public.append_only() set search_path = '';
-- No API role receives table-wide TRUNCATE rights, which would bypass row policies.
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- Compute request identity once per statement instead of once per row.
do $$ declare p record; u text; c text; begin
 for p in select * from pg_policies where schemaname in ('public','storage') loop
  u := replace(replace(p.qual,'auth.uid()','(select auth.uid())'),'app_private.current_app_role()','(select app_private.current_app_role())');
  c := replace(replace(p.with_check,'auth.uid()','(select auth.uid())'),'app_private.current_app_role()','(select app_private.current_app_role())');
  if u is distinct from p.qual or c is distinct from p.with_check then
   execute format('alter policy %I on %I.%I%s%s',p.policyname,p.schemaname,p.tablename,
    case when u is null then '' else ' using ('||u||')' end,
    case when c is null then '' else ' with check ('||c||')' end);
  end if;
 end loop;
end $$;

-- Index each single-column FK unless a covering index already exists.
do $$ declare f record; begin
 for f in select c.conrelid, t.relname, a.attname from pg_constraint c
 join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
 join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
 where c.contype='f' and n.nspname='public' and array_length(c.conkey,1)=1
 and not exists(select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid and i.indpred is null and i.indkey[0]=c.conkey[1])
 loop execute format('create index %I on public.%I (%I)',f.relname||'_'||f.attname||'_idx',f.relname,f.attname); end loop;
end $$;
