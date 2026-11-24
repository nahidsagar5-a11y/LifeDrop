-- LifeDrop database setup starter.
-- This file contains the schema objects included in the supplied project excerpt.
-- Run in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  role text not null default 'user' check (role in ('user','donor','admin')),
  phone text,
  blood_group text check (blood_group is null or blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  location text,
  last_donation_date date,
  photo_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  patient_name text not null,
  blood_group text not null check (blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  units integer not null check (units between 1 and 20),
  needed_date date not null,
  location text not null,
  contact_phone text not null,
  details text,
  status text not null default 'Searching',
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'candidate',
  created_at timestamptz not null default now(),
  connected_at timestamptz,
  unique(request_id, donor_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid not null references public.profiles(id) on delete cascade,
  donation_date date not null,
  place text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role_group on public.profiles(role,blood_group);
create index if not exists idx_requests_requester on public.blood_requests(requester_id,created_at desc);
create index if not exists idx_matches_donor on public.matches(donor_id,status);
create index if not exists idx_matches_requester on public.matches(requester_id,status);
create index if not exists idx_notifications_user on public.notifications(user_id,created_at desc);

create or replace function public.is_compatible_donor(donor_group text, recipient_group text)
returns boolean language sql immutable as $$
 select case recipient_group
  when 'O-' then donor_group='O-'
  when 'O+' then donor_group in ('O-','O+')
  when 'A-' then donor_group in ('O-','A-')
  when 'A+' then donor_group in ('O-','O+','A-','A+')
  when 'B-' then donor_group in ('O-','B-')
  when 'B+' then donor_group in ('O-','O+','B-','B+')
  when 'AB-' then donor_group in ('O-','A-','B-','AB-')
  when 'AB+' then donor_group in ('O-','O+','A-','A+','B-','B+','AB-','AB+')
  else false end;
$$;

alter table public.profiles enable row level security;
alter table public.blood_requests enable row level security;
alter table public.matches enable row level security;
alter table public.notifications enable row level security;
alter table public.donations enable row level security;

-- NOTE: Add the complete policies and RPC function definitions from your
-- reviewed Supabase SQL migration before using this app with real users.
