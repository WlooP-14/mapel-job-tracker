-- Only the server's Auth Admin API can set the application metadata marker.
create function app_private.create_self_registered_profile() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.raw_app_meta_data->>'mjt_self_registration' = 'true' then
  insert into public.users(id,name,phone,role,active)
  values(new.id,new.raw_user_meta_data->>'full_name','+'||ltrim(new.phone,'+'),'viewer',false);
 end if;
 return new;
end $$;
revoke all on function app_private.create_self_registered_profile() from public,anon,authenticated;
create trigger create_self_registered_profile after insert on auth.users
for each row execute function app_private.create_self_registered_profile();
