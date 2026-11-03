-- Lithos — Supabase schema (RECONSTRUCTED, recovery copy).
--
-- The live project (aupkeramhsufnmhkbihl) was never exported to git. This file rebuilds the contract
-- that index.html and api/buffer-sync.js depend on: the four tables the dashboard reads, the
-- lithos_owners allowlist, owner-only RLS and the two RPCs the sync endpoint calls. Column names come
-- from the client code; types are the narrowest that fit it. Before applying it to a project that
-- already has Lithos tables, diff it against that project — never run it blind over live data.
--
-- Apply once in Supabase → SQL Editor on a fresh project, then add the owner:
--   insert into public.lithos_owners (user_id) select id from auth.users where email = '<owner email>';
-- Tested locally: bash lithos/supabase/tests/run.sh (needs a disposable PostgreSQL superuser URL).

create table public.lithos_owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Every policy and RPC goes through this one check. SECURITY DEFINER so it can read lithos_owners,
-- which itself is not readable by anyone but its own row.
create function public.lithos_is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lithos_owners o where o.user_id = auth.uid())
$$;

create table public.lithos_insight_snapshots (
  id bigint generated always as identity primary key,
  followers integer,
  reach integer,
  impressions integer,
  saves integer,
  shares integer,
  comments integer,
  engagement_rate numeric,
  avg_watch_time_seconds numeric,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);
create index lithos_insight_snapshots_captured_at on public.lithos_insight_snapshots (captured_at desc);

create table public.lithos_kpi_snapshots (
  id bigint generated always as identity primary key,
  qualified_leads integer,
  conversion_rate numeric,
  hot_leads integer,
  overdue_followups integer,
  revenue numeric,
  response_sla_minutes integer,
  captured_at timestamptz not null default now()
);
create index lithos_kpi_snapshots_captured_at on public.lithos_kpi_snapshots (captured_at desc);

create table public.lithos_leads (
  id bigint generated always as identity primary key,
  name text,
  source text,
  status text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.lithos_sync_state (
  source text primary key,
  status text not null check (status in ('connected', 'synced', 'error', 'disconnected')),
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.lithos_owners enable row level security;
alter table public.lithos_insight_snapshots enable row level security;
alter table public.lithos_kpi_snapshots enable row level security;
alter table public.lithos_leads enable row level security;
alter table public.lithos_sync_state enable row level security;

create policy owner_self on public.lithos_owners for select to authenticated using (user_id = auth.uid());
create policy owner_read on public.lithos_insight_snapshots for select to authenticated using (public.lithos_is_owner());
create policy owner_read on public.lithos_kpi_snapshots for select to authenticated using (public.lithos_is_owner());
create policy owner_all on public.lithos_leads for all to authenticated
  using (public.lithos_is_owner()) with check (public.lithos_is_owner());
create policy owner_read on public.lithos_sync_state for select to authenticated using (public.lithos_is_owner());

-- Snapshots and sync state are written only through the RPCs below, never directly by the browser.
revoke all on public.lithos_owners, public.lithos_insight_snapshots, public.lithos_kpi_snapshots,
  public.lithos_leads, public.lithos_sync_state from anon, authenticated;
grant select on public.lithos_owners, public.lithos_insight_snapshots, public.lithos_kpi_snapshots,
  public.lithos_sync_state to authenticated;
grant select, insert, update, delete on public.lithos_leads to authenticated;

-- Called by api/buffer-sync.js with the owner's own session. Stores the counts in columns and the
-- whole payload in metadata (followers_supported, channel ids), then marks the buffer source connected.
create function public.lithos_ingest_buffer_snapshot(p_payload jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not public.lithos_is_owner() then
    raise exception 'not a Lithos owner' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'payload must be a JSON object' using errcode = '22023';
  end if;
  insert into public.lithos_insight_snapshots
    (followers, reach, impressions, saves, shares, comments, engagement_rate, avg_watch_time_seconds, metadata, captured_at)
  values (
    (p_payload ->> 'followers')::integer, (p_payload ->> 'reach')::integer, (p_payload ->> 'impressions')::integer,
    (p_payload ->> 'saves')::integer, (p_payload ->> 'shares')::integer, (p_payload ->> 'comments')::integer,
    (p_payload ->> 'engagement_rate')::numeric, (p_payload ->> 'avg_watch_time_seconds')::numeric,
    p_payload, coalesce((p_payload ->> 'captured_at')::timestamptz, now()))
  returning id into v_id;
  insert into public.lithos_sync_state (source, status, last_error, updated_at)
  values ('buffer', 'connected', null, now())
  on conflict (source) do update set status = 'connected', last_error = null, updated_at = now();
  return v_id;
end $$;

create function public.lithos_set_buffer_sync_state(p_status text, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.lithos_is_owner() then
    raise exception 'not a Lithos owner' using errcode = '42501';
  end if;
  insert into public.lithos_sync_state (source, status, last_error, updated_at)
  values ('buffer', p_status, left(p_error, 500), now())
  on conflict (source) do update set status = excluded.status, last_error = excluded.last_error, updated_at = now();
end $$;

revoke all on function public.lithos_is_owner(), public.lithos_ingest_buffer_snapshot(jsonb),
  public.lithos_set_buffer_sync_state(text, text) from public;
grant execute on function public.lithos_is_owner(), public.lithos_ingest_buffer_snapshot(jsonb),
  public.lithos_set_buffer_sync_state(text, text) to authenticated;
