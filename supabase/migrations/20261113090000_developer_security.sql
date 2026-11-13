-- Sensitive state stays outside PostgREST's exposed schema. All destructive gates
-- default off. No wipe, freeze, device enrollment or scheduling occurs on install.
create table app_private.developer_control(singleton boolean primary key default true check(singleton),frozen boolean not null default false,wipe_enabled boolean not null default false,worker_key_hash text,backup_public_key text,backup_receipt jsonb,wiped_at timestamptz,worker_seen_at timestamptz,notification_ready boolean not null default false);
insert into app_private.developer_control(singleton) values(true);
create table app_private.developer_sessions(user_id uuid primary key,session_id text,verified_at timestamptz,locked_until timestamptz);
create table app_private.developer_challenges(id uuid primary key default gen_random_uuid(),user_id uuid not null,session_id text not null,purpose text not null,challenge text not null,context jsonb not null,expires_at timestamptz not null,used_at timestamptz);
create table app_private.developer_tickets(id uuid primary key default gen_random_uuid(),user_id uuid not null,session_id text not null,purpose text not null,secret_hash text not null,credential_id uuid not null,context jsonb not null,created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,hold_at timestamptz,used_at timestamptz);
create table app_private.developer_execution(id uuid primary key,status text not null,phase text not null default 'files',snapshot jsonb not null,lease_hash text not null,lease_until timestamptz not null,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp());
create table app_private.developer_notifications(id uuid primary key default gen_random_uuid(),kind text not null,user_id uuid,request_id uuid,created_at timestamptz not null default clock_timestamp(),sent_at timestamptz);
do $$ declare tbl text;begin
 foreach tbl in array array['developer_control','developer_sessions','developer_challenges','developer_tickets','developer_execution','developer_notifications'] loop
  execute format('alter table app_private.%I enable row level security',tbl);
  execute format('revoke all on app_private.%I from public,anon,authenticated,service_role',tbl);
 end loop;
end $$;
alter table public.developer_credentials add column credential_id text unique;
alter table public.developer_credentials add column counter bigint not null default 0;
alter table public.developer_credentials add column rp_id text;
alter table public.developer_credentials add column transports jsonb not null default '[]';
alter table public.kill_requests drop constraint kill_requests_status_check;
alter table public.kill_requests add constraint kill_requests_status_check check(status in ('scheduled','cancelled','running','done','failed'));
alter table public.kill_requests add column proof jsonb;

create or replace function app_private.current_app_role() returns public.app_role language sql stable security definer set search_path='' as $$
 select u.role from public.users u where u.id=auth.uid() and u.active and u.archived_at is null
 and not exists(select 1 from app_private.developer_execution where status='running')
 and (u.role='developer' or not exists(select 1 from app_private.developer_control where frozen or wiped_at is not null));
$$;

create function public.system_security_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('frozen',frozen,'wipedAt',wiped_at,'wiping',exists(select 1 from app_private.developer_execution where status='running')) from app_private.developer_control where singleton;
$$;
revoke all on function public.system_security_status() from public;
grant execute on function public.system_security_status() to anon,authenticated,service_role;

-- Block direct Auth signups as well as application registration, including races
-- with a worker claim. Restoring accounts requires deliberately resetting freeze.
create function app_private.guard_auth_registration() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('mjt-developer-security'));
 if exists(select 1 from app_private.developer_control where frozen or wiped_at is not null) then raise exception 'SYSTEM_FROZEN';end if;
 return new;
end $$;
revoke all on function app_private.guard_auth_registration() from public,anon,authenticated,service_role;
create trigger guard_developer_freeze before insert on auth.users for each row execute function app_private.guard_auth_registration();

create function app_private.require_developer(p_user uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if p_user is null or not exists(select 1 from public.users where id=p_user and role='developer' and active and archived_at is null) then raise exception 'DEVELOPER_ONLY' using errcode='42501';end if;
end $$;
revoke all on function app_private.require_developer(uuid) from public,anon,authenticated,service_role;

create function public.developer_security_op(p_user uuid,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare s app_private.developer_sessions;c app_private.developer_control;q app_private.developer_challenges;t app_private.developer_tickets;cred public.developer_credentials;request public.kill_requests;v_id uuid;v_count integer;v_now timestamptz:=clock_timestamp();v_context jsonb;v_session text:=p_data->>'sessionId';
begin
 perform app_private.require_developer(p_user);
 if jsonb_typeof(p_data) is distinct from 'object' or length(p_data::text)>40000 then raise exception 'INVALID_SECURITY_REQUEST';end if;
 perform pg_advisory_xact_lock(hashtext('mjt-developer-security'));
 select * into c from app_private.developer_control where singleton for update;
 v_now:=clock_timestamp();
 insert into app_private.developer_sessions(user_id) values(p_user) on conflict do nothing;
 select * into s from app_private.developer_sessions where user_id=p_user for update;
 if p_action='state' then
  return jsonb_build_object('frozen',c.frozen,'lockedUntil',s.locked_until,'wipeEnabled',c.wipe_enabled,'workerConfigured',c.worker_key_hash is not null,'workerSeenAt',c.worker_seen_at,'notificationReady',c.notification_ready,'backupPublicKey',c.backup_public_key,'backup',c.backup_receipt,
   'devices',coalesce((select jsonb_agg(to_jsonb(d) order by d.registered_on) from public.developer_credentials d where user_id=p_user and archived_at is null and credential_id is not null),'[]'),
   'requests',coalesce((select jsonb_agg(to_jsonb(r)-'proof' order by r.created_at desc) from (select * from public.kill_requests where requested_by=p_user order by created_at desc limit 10) r),'[]'));
 elsif p_action='freeze' then
  if exists(select 1 from app_private.developer_execution where status='running') then raise exception 'ALREADY_EXECUTING';end if;
  if jsonb_typeof(p_data->'value') is distinct from 'boolean' then raise exception 'INVALID_SECURITY_REQUEST';end if;
  update app_private.developer_control set frozen=(p_data->>'value')::boolean where singleton;
  insert into app_private.developer_notifications(kind,user_id) values(case when (p_data->>'value')::boolean then 'frozen' else 'unfrozen' end,p_user);
  return jsonb_build_object('ok',true);
 elsif p_action='fail' then
  update app_private.developer_sessions set locked_until=v_now+interval '1 hour',verified_at=null where user_id=p_user;
  update app_private.developer_tickets set used_at=v_now where user_id=p_user and used_at is null;
  insert into app_private.developer_notifications(kind,user_id) values('security_lock',p_user);
  return jsonb_build_object('locked',true);
 end if;
 if s.locked_until>v_now then raise exception 'SECURITY_LOCKED';end if;
 if p_action='mfa_verified' then
  if nullif(v_session,'') is null then raise exception 'FRESH_MFA_REQUIRED';end if;
  update app_private.developer_sessions set session_id=v_session,verified_at=v_now where user_id=p_user;
  return jsonb_build_object('ok',true);
 end if;
 if s.verified_at is null or s.verified_at<v_now-interval '5 minutes' or s.session_id is distinct from v_session then raise exception 'FRESH_MFA_REQUIRED';end if;
 if p_action='challenge' then
  if p_data->>'purpose' not in ('register','wipe','cancel') or nullif(p_data->>'challenge','') is null then raise exception 'INVALID_SECURITY_REQUEST';end if;
  insert into app_private.developer_challenges(user_id,session_id,purpose,challenge,context,expires_at) values(p_user,v_session,p_data->>'purpose',p_data->>'challenge',coalesce(p_data->'context','{}'),v_now+interval '5 minutes') returning id into v_id;
  return jsonb_build_object('id',v_id);
 elsif p_action='take_challenge' then
  select * into q from app_private.developer_challenges where id=(p_data->>'id')::uuid and user_id=p_user and session_id=v_session for update;
  if not found or q.used_at is not null or q.expires_at<v_now then raise exception 'CHALLENGE_EXPIRED';end if;
  update app_private.developer_challenges set used_at=v_now where id=q.id;
  return to_jsonb(q);
 elsif p_action='register' then
  if nullif(btrim(p_data->>'name'),'') is null or length(p_data->>'name')>80 or nullif(p_data->>'credentialId','') is null or nullif(p_data->>'publicKey','') is null or nullif(p_data->>'rpId','') is null then raise exception 'INVALID_SECURITY_REQUEST';end if;
  insert into public.developer_credentials(user_id,device_name,public_key,credential_id,counter,rp_id,transports) values(p_user,btrim(p_data->>'name'),p_data->>'publicKey',p_data->>'credentialId',(p_data->>'counter')::bigint,p_data->>'rpId',coalesce(p_data->'transports','[]')) returning id into v_id;
  return jsonb_build_object('id',v_id);
 elsif p_action='remove_device' then
  if exists(select 1 from public.kill_requests where requested_by=p_user and status in ('scheduled','running')) then raise exception 'CANCEL_FIRST';end if;
  update public.developer_credentials set archived_at=v_now where id=(p_data->>'id')::uuid and user_id=p_user;
  return jsonb_build_object('ok',true);
 elsif p_action='authorize' then
  select * into cred from public.developer_credentials where id=(p_data->>'credential')::uuid and user_id=p_user and archived_at is null for update;
  if not found or cred.counter<>(p_data->>'previousCounter')::bigint or (cred.counter>0 and (p_data->>'counter')::bigint<=cred.counter) then raise exception 'PASSKEY_COUNTER';end if;
  if p_data->>'purpose' not in ('wipe','cancel') or length(p_data->>'secretHash')<>64 then raise exception 'INVALID_SECURITY_REQUEST';end if;
  update public.developer_credentials set counter=(p_data->>'counter')::bigint where id=cred.id;
  insert into app_private.developer_tickets(user_id,session_id,purpose,secret_hash,credential_id,context,expires_at) values(p_user,v_session,p_data->>'purpose',p_data->>'secretHash',cred.id,p_data->'context',v_now+interval '5 minutes') returning id into v_id;
  return jsonb_build_object('id',v_id);
 elsif p_action in ('hold','commit','cancel') then
  select * into t from app_private.developer_tickets where id=(p_data->>'id')::uuid and user_id=p_user for update;
  if not found or t.used_at is not null or t.expires_at<v_now or t.session_id<>v_session or t.secret_hash<>encode(sha256(convert_to(coalesce(p_data->>'secret',''),'UTF8')),'hex') then raise exception 'AUTHORIZATION_EXPIRED';end if;
  if not exists(select 1 from public.developer_credentials where id=t.credential_id and user_id=p_user and archived_at is null) then raise exception 'PASSKEY_REQUIRED';end if;
  if p_action='cancel' then
   if t.purpose<>'cancel' then raise exception 'INVALID_SECURITY_REQUEST';end if;
   update public.kill_requests set status='cancelled' where id=(t.context->>'requestId')::uuid and requested_by=p_user and status='scheduled';
   if not found then raise exception 'ALREADY_EXECUTING';end if;
   update app_private.developer_tickets set used_at=v_now where id=t.id;
   insert into app_private.developer_notifications(kind,user_id,request_id) values('cancelled',p_user,(t.context->>'requestId')::uuid);
   return jsonb_build_object('ok',true);
  end if;
  select count(*) into v_count from public.developer_credentials where user_id=p_user and archived_at is null and credential_id is not null and rp_id=(select rp_id from public.developer_credentials where id=t.credential_id);
  if t.purpose<>'wipe' or v_count<2 or not c.wipe_enabled or c.worker_key_hash is null or c.backup_receipt is null or not c.notification_ready or c.worker_seen_at is null or c.worker_seen_at<v_now-interval '15 minutes' then raise exception 'WIPE_NOT_READY';end if;
  if p_data->>'backupDigest' is distinct from c.backup_receipt->>'digest' then raise exception 'BACKUP_CHANGED';end if;
  if (c.backup_receipt->'payload'->>'completedAt')::timestamptz<v_now-interval '24 hours' then raise exception 'BACKUP_STALE';end if;
  if p_action='hold' then
   update app_private.developer_tickets set hold_at=v_now where id=t.id;
   return jsonb_build_object('holdSeconds',5);
  end if;
  if p_data->>'confirmation' is distinct from 'DELETE' or t.hold_at is null or v_now<t.hold_at+interval '5 seconds' or v_now>t.hold_at+interval '30 seconds' then raise exception 'HOLD_REQUIRED';end if;
  if exists(select 1 from public.kill_requests where status in ('scheduled','running')) then raise exception 'REQUEST_EXISTS';end if;
  insert into public.kill_requests(requested_by,scheduled_for,status,proof) values(p_user,v_now+case when coalesce((t.context->>'delay')::boolean,false) then interval '24 hours' else interval '0' end,'scheduled',jsonb_build_object('credential',t.credential_id,'mfaAt',s.verified_at,'authorizedAt',v_now,'backup',c.backup_receipt)) returning * into request;
  update app_private.developer_tickets set used_at=v_now where id=t.id;
  insert into app_private.developer_notifications(kind,user_id,request_id) values('scheduled',p_user,request.id);
  return to_jsonb(request)-'proof';
 elsif p_action='backup' then
  update app_private.developer_control set backup_receipt=p_data->'receipt' where singleton;
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'INVALID_SECURITY_REQUEST';
end $$;
revoke all on function public.developer_security_op(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.developer_security_op(uuid,text,jsonb) to service_role;

create function public.developer_worker_op(p_key text,p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c app_private.developer_control;e app_private.developer_execution;r public.kill_requests;lease text;tables text;v_now timestamptz:=clock_timestamp();
begin
 perform pg_advisory_xact_lock(hashtext('mjt-developer-security'));
 select * into c from app_private.developer_control where singleton for update;
 v_now:=clock_timestamp();
 if c.worker_key_hash is null or c.worker_key_hash<>encode(sha256(convert_to(coalesce(p_key,''),'UTF8')),'hex') then raise exception 'WORKER_ONLY' using errcode='42501';end if;
 update app_private.developer_control set worker_seen_at=v_now where singleton;
 if p_action='inspect' then
  update app_private.developer_control set notification_ready=coalesce((p_data->>'mailReady')::boolean,false) where singleton;
  select * into e from app_private.developer_execution where status='running' order by created_at limit 1;
  return jsonb_build_object('enabled',c.wipe_enabled,'backup',case when e.id is not null then e.snapshot->'executionBackup' else c.backup_receipt end,'phase',e.phase,'backupPublicKey',c.backup_public_key);
 elsif p_action='notifications' then
  return coalesce((select jsonb_agg(to_jsonb(n)) from (select * from app_private.developer_notifications where sent_at is null order by created_at limit 20) n),'[]');
 elsif p_action='notification_sent' then
  update app_private.developer_notifications set sent_at=v_now where id=(p_data->>'id')::uuid;return jsonb_build_object('ok',true);
 end if;
 if p_action='claim' then
  if not c.wipe_enabled then raise exception 'WIPE_NOT_READY';end if;
  select * into e from app_private.developer_execution where status='running' order by created_at limit 1 for update;
  if found then
   if e.lease_until>v_now then return null;end if;
  else
   select * into r from public.kill_requests where status='scheduled' and scheduled_for<=v_now order by scheduled_for limit 1 for update skip locked;
   if not found then return null;end if;
   if not c.notification_ready or c.backup_receipt is null or (c.backup_receipt->'payload'->>'completedAt')::timestamptz<v_now-interval '24 hours' then raise exception 'WIPE_NOT_READY';end if;
   perform app_private.require_developer(r.requested_by);
   if (select count(*) from public.developer_credentials where user_id=r.requested_by and archived_at is null and credential_id is not null and rp_id=(select rp_id from public.developer_credentials where id=(r.proof->>'credential')::uuid))<2 then raise exception 'PASSKEY_REQUIRED';end if;
   if exists(select 1 from app_private.developer_sessions where user_id=r.requested_by and locked_until>v_now) then raise exception 'SECURITY_LOCKED';end if;
   update public.kill_requests set status='running' where id=r.id;
   insert into app_private.developer_execution(id,status,snapshot,lease_hash,lease_until) values(r.id,'running',to_jsonb(r)||jsonb_build_object('executionBackup',c.backup_receipt),'',v_now) returning * into e;
   update app_private.developer_control set frozen=true where singleton;
  end if;
  lease:=gen_random_uuid()::text||gen_random_uuid()::text;
  update app_private.developer_execution set lease_hash=encode(sha256(convert_to(lease,'UTF8')),'hex'),lease_until=v_now+interval '15 minutes' where id=e.id;
  return jsonb_build_object('id',e.id,'phase',e.phase,'lease',lease,'backup',e.snapshot->'executionBackup','backupPublicKey',c.backup_public_key);
 end if;
 select * into e from app_private.developer_execution where id=(p_data->>'id')::uuid and status='running' for update;
 if not found or e.lease_until<v_now or e.lease_hash<>encode(sha256(convert_to(coalesce(p_data->>'lease',''),'UTF8')),'hex') then raise exception 'WORKER_LEASE_REQUIRED';end if;
 if p_action='heartbeat' then
  update app_private.developer_execution set lease_until=v_now+interval '15 minutes',updated_at=v_now where id=e.id;return jsonb_build_object('ok',true);
 elsif p_action='files_done' then
  if e.phase<>'files' then raise exception 'INVALID_WIPE_PHASE';end if;
  update app_private.developer_execution set phase='database',updated_at=v_now where id=e.id;
 elsif p_action='wipe_database' then
  if e.phase<>'database' or not c.wipe_enabled or e.snapshot->'executionBackup' is null or (e.snapshot->'executionBackup'->'payload'->>'completedAt')::timestamptz<v_now-interval '24 hours' or p_data->>'backupDigest' is distinct from e.snapshot->'executionBackup'->>'digest' then raise exception 'WIPE_NOT_READY';end if;
  -- No CASCADE: an unexpected dependency outside public makes this roll back.
  select string_agg(format('%I.%I',schemaname,tablename),',') into tables from pg_tables where schemaname='public';
  if tables is not null then execute 'truncate table '||tables||' restart identity';end if;
  truncate app_private.developer_sessions,app_private.developer_challenges,app_private.developer_tickets;
  update app_private.developer_execution set phase='auth',updated_at=v_now where id=e.id;
 elsif p_action='complete' then
  if e.phase<>'auth' then raise exception 'INVALID_WIPE_PHASE';end if;
  if exists(select 1 from auth.users) or exists(select 1 from storage.objects) or exists(select 1 from storage.buckets) then raise exception 'WIPE_INCOMPLETE';end if;
  update app_private.developer_execution set status='done',phase='done',updated_at=v_now where id=e.id;
  update app_private.developer_control set wiped_at=v_now,frozen=true,wipe_enabled=false where singleton;
  insert into app_private.developer_notifications(kind,user_id,request_id) values('wiped',(e.snapshot->>'requested_by')::uuid,e.id);
 else raise exception 'INVALID_SECURITY_REQUEST';end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.developer_worker_op(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.developer_worker_op(text,text,jsonb) to service_role;

-- Registration and privileged API work use this public boolean status too.
-- Scheduled alerts must not repopulate settings after the live data was wiped.
do $$ declare body text;begin
 body:=pg_get_functiondef('app_private.recalculate_stage_alerts(date)'::regprocedure);
 body:=replace(body,'begin',E'begin\n if exists(select 1 from app_private.developer_control where frozen or wiped_at is not null) then return jsonb_build_object(''skipped'',true);end if;');
 execute body;
end $$;
