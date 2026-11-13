-- Run only AFTER applying 20261113090000_developer_security.sql manually.
-- Records existing migration history; does not freeze, activate or wipe anything.
begin;
do $$ begin
 if to_regclass('supabase_migrations.schema_migrations') is null then raise exception 'Migration history is missing. Stop and review.';end if;
 if to_regprocedure('public.developer_security_op(uuid,text,jsonb)') is null
 or to_regprocedure('public.developer_worker_op(text,text,jsonb)') is null
 or not exists(select 1 from pg_trigger where tgname='guard_developer_freeze' and tgrelid='auth.users'::regclass)
 then raise exception 'Apply the complete developer-security migration first.';end if;
 if exists(select 1 from supabase_migrations.schema_migrations where (version='20261113090000' and name is distinct from 'developer_security') or (name='developer_security' and version<>'20261113090000')) then raise exception 'Conflicting migration history. Review before proceeding.';end if;
 insert into supabase_migrations.schema_migrations(version,name,statements) values('20261113090000','developer_security',array[]::text[]) on conflict(version) do nothing;
end $$;
commit;
