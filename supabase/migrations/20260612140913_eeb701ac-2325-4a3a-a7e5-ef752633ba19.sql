grant execute on function public.is_super_admin(uuid) to authenticated, anon;
grant execute on function public.get_user_role(uuid) to authenticated, anon;
grant execute on function public.get_user_agency_id(uuid) to authenticated, anon;

update public.profiles set role = 'super_admin'
where id = 'b66ab240-a63b-43e2-897c-bd3f09bd8a1d';