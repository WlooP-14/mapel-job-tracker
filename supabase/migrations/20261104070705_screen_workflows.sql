alter table public.material_routes add column category public.category not null default 'turn';
alter table public.material_routes add constraint material_routes_no_hardware check(category<>'hardware');
create function public.save_material_route(p_category public.category,p_material text,p_steps text[]) returns void
language plpgsql security invoker set search_path='' as $$
declare v_role public.app_role; s text; i integer:=0;
begin
 v_role:=app_private.current_app_role();
 if v_role is null or v_role not in ('developer','admin') then raise exception 'Operation not permitted'; end if;
 if p_category='hardware' or nullif(btrim(p_material),'') is null or length(p_material)>80 or coalesce(array_length(p_steps,1),0)=0 then raise exception 'Invalid route'; end if;
 if (select count(distinct value) from unnest(p_steps) value)<>array_length(p_steps,1) then raise exception 'Duplicate steps'; end if;
 foreach s in array p_steps loop
  if not exists(select 1 from public.step_templates where category=p_category and step_name=s and step_name<>'Received' and active and archived_at is null) then raise exception 'Unknown processing step'; end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_category::text||lower(btrim(p_material)),0));
 update public.material_routes set archived_at=now() where category=p_category and lower(material)=lower(btrim(p_material)) and archived_at is null;
 foreach s in array p_steps loop
  i:=i+1;insert into public.material_routes(category,material,step_name,order_no) values(p_category,btrim(p_material),s,i);
 end loop;
end $$;
revoke all on function public.save_material_route(public.category,text,text[]) from public,anon;
grant execute on function public.save_material_route(public.category,text,text[]) to authenticated;
