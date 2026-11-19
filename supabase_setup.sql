-- LifeDrop Supabase setup. Run the complete script in Supabase Dashboard > SQL Editor.
-- This schema keeps profiles private until an Admin-approved connection exists.
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
  status text not null default 'Searching' check (status in ('Searching','Matched','Completed','Cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.blood_requests(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'candidate' check (status in ('candidate','connected','rejected')),
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

-- A safe helper: role is read from the database, not from browser-supplied metadata.
create or replace function public.is_lifedrop_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='admin'); $$;
revoke all on function public.is_lifedrop_admin() from public;
grant execute on function public.is_lifedrop_admin() to authenticated;

-- Create a profile automatically when a user signs up. Users cannot self-register as admin.
create or replace function public.handle_new_lifedrop_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,full_name,email,role)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','New User'),new.email,
    case when new.raw_user_meta_data->>'role'='donor' then 'donor' else 'user' end)
  on conflict(id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_lifedrop on auth.users;
create trigger on_auth_user_created_lifedrop after insert on auth.users
for each row execute procedure public.handle_new_lifedrop_user();

-- Donor -> recipient red-cell compatibility lookup (suggestions only; clinician must confirm).
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

-- Automatically create candidate matches when a blood request is submitted.
create or replace function public.find_lifedrop_donor_matches()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.matches(request_id,requester_id,donor_id)
  select new.id,new.requester_id,p.id
  from public.profiles p
  where p.role='donor'
    and p.id<>new.requester_id
    and p.blood_group is not null
    and public.is_compatible_donor(p.blood_group,new.blood_group)
    and (p.last_donation_date is null or p.last_donation_date <= current_date - 90)
    and (coalesce(trim(p.location),'')='' or coalesce(trim(new.location),'')='' or p.location ilike '%'||new.location||'%' or new.location ilike '%'||p.location||'%')
  on conflict(request_id,donor_id) do nothing;
  return new;
end; $$;
drop trigger if exists lifedrop_auto_match_after_request on public.blood_requests;
create trigger lifedrop_auto_match_after_request after insert on public.blood_requests
for each row execute procedure public.find_lifedrop_donor_matches();

-- Admin approves one candidate. Both sides receive in-app notifications.
create or replace function public.admin_connect_match(p_match_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare m public.matches%rowtype; req public.blood_requests%rowtype; donor_name text;
begin
  if not public.is_lifedrop_admin() then raise exception 'Only an Admin can connect a match.'; end if;
  select * into m from public.matches where id=p_match_id for update;
  if not found then raise exception 'Match not found.'; end if;
  if m.status<>'candidate' then raise exception 'This match is not awaiting approval.'; end if;
  select * into req from public.blood_requests where id=m.request_id;
  select full_name into donor_name from public.profiles where id=m.donor_id;
  update public.matches set status='connected',connected_at=now() where id=m.id;
  update public.matches set status='rejected' where request_id=m.request_id and id<>m.id and status='candidate';
  update public.blood_requests set status='Matched' where id=m.request_id;
  insert into public.notifications(user_id,title,message) values
    (m.requester_id,'Donor connected', 'Admin connected a donor ('||coalesce(donor_name,'Donor')||') to your blood request. Open Connected Profiles to view the shared profile.'),
    (m.donor_id,'Blood request match', 'Admin connected you to a blood request. Open Connected Profiles to view the requester profile.');
end; $$;
revoke all on function public.admin_connect_match(uuid) from public;
grant execute on function public.admin_connect_match(uuid) to authenticated;

-- Enable Row Level Security on all application tables.
alter table public.profiles enable row level security;
alter table public.blood_requests enable row level security;
alter table public.matches enable row level security;
alter table public.notifications enable row level security;
alter table public.donations enable row level security;

drop policy if exists profiles_select_private on public.profiles;
create policy profiles_select_private on public.profiles for select to authenticated
using (id=auth.uid() or public.is_lifedrop_admin() or exists(
  select 1 from public.matches m where m.status='connected' and
  ((m.donor_id=auth.uid() and m.requester_id=profiles.id) or (m.requester_id=auth.uid() and m.donor_id=profiles.id))));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and role in ('user','donor'));

drop policy if exists requests_insert_self on public.blood_requests;
create policy requests_insert_self on public.blood_requests for insert to authenticated with check(requester_id=auth.uid());
drop policy if exists requests_select_related on public.blood_requests;
create policy requests_select_related on public.blood_requests for select to authenticated using(
 requester_id=auth.uid() or public.is_lifedrop_admin() or exists(select 1 from public.matches m where m.request_id=blood_requests.id and m.donor_id=auth.uid() and m.status='connected'));
drop policy if exists requests_update_admin on public.blood_requests;
create policy requests_update_admin on public.blood_requests for update to authenticated using(public.is_lifedrop_admin()) with check(public.is_lifedrop_admin());

drop policy if exists matches_select_related on public.matches;
create policy matches_select_related on public.matches for select to authenticated using(requester_id=auth.uid() or donor_id=auth.uid() or public.is_lifedrop_admin());

drop policy if exists notifications_select_self on public.notifications;
create policy notifications_select_self on public.notifications for select to authenticated using(user_id=auth.uid());
drop policy if exists notifications_update_self on public.notifications;
create policy notifications_update_self on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

drop policy if exists donations_select_self_admin on public.donations;
create policy donations_select_self_admin on public.donations for select to authenticated using(donor_id=auth.uid() or public.is_lifedrop_admin());
drop policy if exists donations_insert_self on public.donations;
create policy donations_insert_self on public.donations for insert to authenticated with check(donor_id=auth.uid());

-- Private profile-photo bucket. Files must be stored as <auth-user-uuid>/profile.jpg
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',false,3145728,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=3145728,allowed_mime_types=array['image/jpeg','image/png','image/webp'];

drop policy if exists lifedrop_avatar_upload_own on storage.objects;
create policy lifedrop_avatar_upload_own on storage.objects for insert to authenticated
with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists lifedrop_avatar_update_own on storage.objects;
create policy lifedrop_avatar_update_own on storage.objects for update to authenticated
using(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id='avatars' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists lifedrop_avatar_read_connected on storage.objects;
create policy lifedrop_avatar_read_connected on storage.objects for select to authenticated using(
 bucket_id='avatars' and (
  (storage.foldername(name))[1]=auth.uid()::text or public.is_lifedrop_admin() or exists(
   select 1 from public.matches m where m.status='connected' and
    (((m.donor_id=auth.uid()) and (storage.foldername(name))[1]=m.requester_id::text) or
     ((m.requester_id=auth.uid()) and (storage.foldername(name))[1]=m.donor_id::text))
  )
 ));

-- Ensure authenticated users have the minimum SQL grants; RLS policies still restrict rows.
grant usage on schema public to authenticated;
grant select,update on public.profiles to authenticated;
grant select,insert,update on public.blood_requests to authenticated;
grant select on public.matches to authenticated;
grant select,update on public.notifications to authenticated;
grant select,insert on public.donations to authenticated;
