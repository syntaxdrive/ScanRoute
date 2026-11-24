-- ScanRoute Supabase PostgreSQL Schema
-- Run this once inside Supabase Dashboard -> SQL Editor

create extension if not exists "pgcrypto";

-- 1. User Profiles & Subscription Plans
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  business_name text not null default '',
  role text not null default 'client' check (role in ('admin', 'client')),
  plan text not null default 'starter' check (plan in ('starter', 'business', 'agency')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own business name"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Automatically create a profile row on Supabase Auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  is_first_user boolean;
begin
  select count(*) = 0 into is_first_user from public.profiles;
  insert into public.profiles (id, email, business_name, role, plan)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'business_name', ''),
    case when is_first_user then 'admin' else 'client' end,
    case when is_first_user then 'agency' else coalesce(new.raw_user_meta_data->>'plan', 'starter') end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Dynamic QR Routes
create table if not exists public.qr_routes (
  id text primary key,
  owner_id uuid references public.profiles(id) on delete cascade,
  slug text not null unique,
  title text not null,
  category text not null default 'Local Service',
  default_url text not null,
  ios_url text not null default '',
  android_url text not null default '',
  fallback_url text not null default '',
  expires_at timestamptz,
  active boolean not null default true,
  fg_color text not null default '#0f172a',
  bg_color text not null default '#ffffff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qr_routes_slug on public.qr_routes(slug);
create index if not exists idx_qr_routes_owner on public.qr_routes(owner_id);

alter table public.qr_routes enable row level security;

create policy "Owners can manage own routes"
  on public.qr_routes for all
  using (auth.uid() = owner_id);

-- 3. Scan Telemetry Events
create table if not exists public.scan_events (
  id uuid primary key default gen_random_uuid(),
  route_id text not null references public.qr_routes(id) on delete cascade,
  slug text not null,
  device text not null check (device in ('iOS', 'Android', 'Desktop')),
  referrer text not null default 'QR Camera',
  simulated boolean not null default false,
  scanned_at timestamptz not null default now()
);

create index if not exists idx_scan_events_route_time on public.scan_events(route_id, scanned_at desc);

alter table public.scan_events enable row level security;

create policy "Route owners can read own scan events"
  on public.scan_events for select
  using (
    exists (
      select 1 from public.qr_routes r
      where r.id = scan_events.route_id and r.owner_id = auth.uid()
    )
  );

-- 4. Public Website Client Onboarding Inquiries
create table if not exists public.client_inquiries (
  id text primary key,
  business_name text not null,
  email text not null,
  plan text not null,
  message text not null default '',
  status text not null default 'New' check (status in ('New', 'Contacted')),
  created_at timestamptz not null default now()
);

alter table public.client_inquiries enable row level security;
-- Inquiries are written/read via server-side service role endpoints.

-- Backfill profiles for any users who signed up before running this schema
insert into public.profiles (id, email, business_name, role, plan)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(u.raw_user_meta_data->>'business_name', ''),
  case when row_number() over (order by u.created_at asc) = 1 and not exists (select 1 from public.profiles) then 'admin' else 'client' end,
  case when row_number() over (order by u.created_at asc) = 1 and not exists (select 1 from public.profiles) then 'agency' else coalesce(u.raw_user_meta_data->>'plan', 'starter') end
from auth.users u
on conflict (id) do nothing;

