-- Admins can promote viewers and operators, and developers retain oversight of admins.
alter policy update_users on public.users
 with check ((select app_private.current_app_role())='developer' or ((select app_private.current_app_role())='admin' and role in ('viewer','operator','admin')));
