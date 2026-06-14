do $$
declare
  v_user_id uuid := 'b66ab240-a63b-43e2-897c-bd3f09bd8a1d';
  v_agency_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_user_id) then
    return;
  end if;
  select id into v_agency_id from public.agencies where owner_id = v_user_id limit 1;
  if v_agency_id is null then
    insert into public.agencies (name, owner_id, daily_audit_limit, monthly_token_budget, contact_email, contact_name)
    values ('Veritech Digital', v_user_id, 10, 2000000, 'info@veritechdigital.co.za', 'Ashlin Sami')
    returning id into v_agency_id;
  end if;
  insert into public.profiles (id, agency_id, full_name, role)
  values (v_user_id, v_agency_id, 'Ashlin Sami', 'agency_admin')
  on conflict (id) do update
    set agency_id = excluded.agency_id,
        full_name = coalesce(public.profiles.full_name, excluded.full_name),
        role = coalesce(public.profiles.role, excluded.role);
end $$;