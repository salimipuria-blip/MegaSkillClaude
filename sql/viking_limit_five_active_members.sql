-- Applied to the existing Viking tables in Supabase.
-- Idempotent, non-destructive: restricts ACTIVE team membership to five.
-- Team membership and authorization policies remain the source of truth.
create or replace function public.viking_enforce_five_active_members()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare active_other_members integer;
begin
  if new.active then
    perform pg_catalog.pg_advisory_xact_lock(2026, 5);
    select count(*) into active_other_members
    from public.viking_team_members
    where active is true and email <> new.email;
    if active_other_members >= 5 then
      raise exception 'Viking team is limited to five active members' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.viking_enforce_five_active_members() from public, anon, authenticated;
drop trigger if exists viking_five_active_members on public.viking_team_members;
create trigger viking_five_active_members
before insert or update of active, email on public.viking_team_members
for each row execute function public.viking_enforce_five_active_members();
