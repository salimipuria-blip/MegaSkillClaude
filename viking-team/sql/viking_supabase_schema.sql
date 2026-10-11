-- VIKING team workspace baseline for a NEW Supabase project.
-- Review in a staging project before applying. This file is not proof that production is configured.
-- The browser uses only the publishable/anon key; authorization is enforced here with RLS.

create extension if not exists pgcrypto;

create table if not exists public.viking_team_members (
  email text primary key check (email = lower(trim(email))),
  role text not null default 'member' check (role in ('admin', 'member')),
  active boolean not null default true,
  added_at timestamptz not null default now()
);
create table if not exists public.viking_workspace_records (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('trip', 'task', 'experience', 'report')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  trip_id uuid references public.viking_workspace_records(id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.viking_trip_media (
  id uuid primary key,
  trip_id uuid not null references public.viking_workspace_records(id) on delete restrict,
  storage_path text not null unique,
  display_name text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp','image/heic')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 8388608),
  created_at timestamptz not null default now()
);

alter table public.viking_team_members enable row level security;
alter table public.viking_workspace_records enable row level security;
alter table public.viking_trip_media enable row level security;

create or replace function public.viking_is_active_member()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.viking_team_members m where m.email = lower(auth.jwt()->>'email') and m.active) $$;
create or replace function public.viking_is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.viking_team_members m where m.email = lower(auth.jwt()->>'email') and m.active and m.role = 'admin') $$;
revoke all on function public.viking_is_active_member() from public, anon;
revoke all on function public.viking_is_admin() from public, anon;
grant execute on function public.viking_is_active_member() to authenticated;
grant execute on function public.viking_is_admin() to authenticated;

-- Re-running this script converges policy definitions without deleting application data.
drop policy if exists "members read team" on public.viking_team_members;
create policy "members read team" on public.viking_team_members for select to authenticated using (public.viking_is_active_member());
drop policy if exists "admins add team" on public.viking_team_members;
create policy "admins add team" on public.viking_team_members for insert to authenticated with check (public.viking_is_admin());
drop policy if exists "admins update team" on public.viking_team_members;
create policy "admins update team" on public.viking_team_members for update to authenticated using (public.viking_is_admin()) with check (public.viking_is_admin());
drop policy if exists "admins delete team" on public.viking_team_members;
create policy "admins delete team" on public.viking_team_members for delete to authenticated using (public.viking_is_admin() and role <> 'admin');

drop policy if exists "members read records" on public.viking_workspace_records;
create policy "members read records" on public.viking_workspace_records for select to authenticated using (public.viking_is_active_member());
drop policy if exists "members add records" on public.viking_workspace_records;
create policy "members add records" on public.viking_workspace_records for insert to authenticated with check (public.viking_is_active_member());
drop policy if exists "members update records" on public.viking_workspace_records;
create policy "members update records" on public.viking_workspace_records for update to authenticated using (public.viking_is_active_member()) with check (public.viking_is_active_member());
drop policy if exists "members delete records" on public.viking_workspace_records;
create policy "members delete records" on public.viking_workspace_records for delete to authenticated using (public.viking_is_active_member());

drop policy if exists "members read media rows" on public.viking_trip_media;
create policy "members read media rows" on public.viking_trip_media for select to authenticated using (public.viking_is_active_member());
drop policy if exists "members add media rows" on public.viking_trip_media;
create policy "members add media rows" on public.viking_trip_media for insert to authenticated with check (public.viking_is_active_member());
drop policy if exists "members delete media rows" on public.viking_trip_media;
create policy "members delete media rows" on public.viking_trip_media for delete to authenticated using (public.viking_is_active_member());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('viking-private','viking-private',false,8388608,array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "members read private media" on storage.objects;
create policy "members read private media" on storage.objects for select to authenticated using (bucket_id='viking-private' and public.viking_is_active_member());
drop policy if exists "members upload private media" on storage.objects;
create policy "members upload private media" on storage.objects for insert to authenticated with check (bucket_id='viking-private' and public.viking_is_active_member() and (storage.foldername(name))[1]='trips');
drop policy if exists "members delete private media" on storage.objects;
create policy "members delete private media" on storage.objects for delete to authenticated using (bucket_id='viking-private' and public.viking_is_active_member());

-- Seed the first administrator manually in Supabase SQL Editor with their real email,
-- then apply sql/viking_limit_five_active_members.sql. Never commit member emails.
