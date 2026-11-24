-- LifeDrop OPTIONAL ADD-ON MIGRATION
-- This script is additive: it does not drop or replace existing LifeDrop tables,
-- policies, triggers, RPC functions, user accounts, or donor data.
-- Run only if you want the new blood-group dashboard counts and Support Chat.

-- 1) Aggregate donor counts by blood group.
-- Only aggregate totals are exposed; private profile information is not returned.
create or replace function public.get_lifedrop_blood_group_counts()
returns table(blood_group text, donor_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.blood_group, count(*)::bigint
  from public.profiles p
  where p.role = 'donor'
    and p.blood_group is not null
  group by p.blood_group;
$$;
revoke all on function public.get_lifedrop_blood_group_counts() from public;
grant execute on function public.get_lifedrop_blood_group_counts() to authenticated;

-- 2) Support conversations.
create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null default 'LifeDrop support',
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 3000),
  created_at timestamptz not null default now()
);

create index if not exists idx_support_conversations_user_updated
  on public.support_conversations(user_id, updated_at desc);
create index if not exists idx_support_messages_conversation_created
  on public.support_messages(conversation_id, created_at);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- Users can view their own conversations; admins can view all.
drop policy if exists lifedrop_support_conversations_select on public.support_conversations;
create policy lifedrop_support_conversations_select
on public.support_conversations for select to authenticated
using (user_id = auth.uid() or public.is_lifedrop_admin());

-- Users can create a conversation only for themselves.
drop policy if exists lifedrop_support_conversations_insert on public.support_conversations;
create policy lifedrop_support_conversations_insert
on public.support_conversations for insert to authenticated
with check (user_id = auth.uid());

-- Conversation owner may update its timestamp; only admin may change status.
-- The app uses this update for updated_at after a new message.
drop policy if exists lifedrop_support_conversations_update_owner on public.support_conversations;
create policy lifedrop_support_conversations_update_owner
on public.support_conversations for update to authenticated
using (user_id = auth.uid() or public.is_lifedrop_admin())
with check (user_id = auth.uid() or public.is_lifedrop_admin());

-- Messages are visible only to the conversation owner and admins.
drop policy if exists lifedrop_support_messages_select on public.support_messages;
create policy lifedrop_support_messages_select
on public.support_messages for select to authenticated
using (
  public.is_lifedrop_admin() or exists (
    select 1 from public.support_conversations c
    where c.id = support_messages.conversation_id and c.user_id = auth.uid()
  )
);

-- A user can send a message only as themselves into their own conversation.
-- Admins can reply to any conversation as themselves.
drop policy if exists lifedrop_support_messages_insert on public.support_messages;
create policy lifedrop_support_messages_insert
on public.support_messages for insert to authenticated
with check (
  sender_id = auth.uid() and (
    public.is_lifedrop_admin() or exists (
      select 1 from public.support_conversations c
      where c.id = support_messages.conversation_id and c.user_id = auth.uid()
    )
  )
);

grant usage on schema public to authenticated;
grant select, insert, update on public.support_conversations to authenticated;
grant select, insert on public.support_messages to authenticated;

-- Enable Supabase Realtime for chat tables if the publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
    ) then
      alter publication supabase_realtime add table public.support_messages;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_conversations'
    ) then
      alter publication supabase_realtime add table public.support_conversations;
    end if;
  end if;
end $$;

-- IMPORTANT:
-- Your current app.js continues to use your existing RPC functions and storage bucket.
-- This add-on does not modify those functions or the profile-photo bucket.

-- Restrict ordinary users to timestamp updates only. Admin status changes use
-- the security-definer RPC below.
revoke update on public.support_conversations from authenticated;
grant update (updated_at) on public.support_conversations to authenticated;

create or replace function public.admin_set_lifedrop_support_status(
  p_conversation_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lifedrop_admin() then
    raise exception 'Only an Admin can change support conversation status.';
  end if;
  if p_status not in ('open','resolved') then
    raise exception 'Invalid support status.';
  end if;
  update public.support_conversations
  set status = p_status, updated_at = now()
  where id = p_conversation_id;
  if not found then raise exception 'Support conversation not found.'; end if;
end;
$$;
revoke all on function public.admin_set_lifedrop_support_status(uuid,text) from public;
grant execute on function public.admin_set_lifedrop_support_status(uuid,text) to authenticated;

-- 3) Add fields and admin management permissions used by the existing app UI.
alter table public.profiles add column if not exists medical_condition text;

drop policy if exists lifedrop_admin_update_profiles on public.profiles;
create policy lifedrop_admin_update_profiles
on public.profiles for update to authenticated
using (public.is_lifedrop_admin())
with check (public.is_lifedrop_admin());

-- The supplied app.js uploads profile photos to `profile-photos`.
-- Create this private bucket if it is not already present; do not alter `avatars`.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists lifedrop_profile_photos_upload_own on storage.objects;
create policy lifedrop_profile_photos_upload_own
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists lifedrop_profile_photos_update_own on storage.objects;
create policy lifedrop_profile_photos_update_own
on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists lifedrop_profile_photos_read_connected on storage.objects;
create policy lifedrop_profile_photos_read_connected
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_lifedrop_admin()
    or exists (
      select 1 from public.matches m
      where m.status = 'connected'
        and (
          (m.donor_id = auth.uid() and (storage.foldername(name))[1] = m.requester_id::text)
          or (m.requester_id = auth.uid() and (storage.foldername(name))[1] = m.donor_id::text)
        )
    )
  )
);

-- Admin-only account deletion. Uses auth.users so the profile and dependent
-- rows are removed through the existing ON DELETE CASCADE relationships.
create or replace function public.admin_delete_lifedrop_user(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_lifedrop_admin() then
    raise exception 'Only an Admin can delete an account.';
  end if;
  if p_user_id = auth.uid() then
    return jsonb_build_object('success', false, 'message', 'You cannot delete your own admin account.');
  end if;
  delete from auth.users where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'message', 'User account was not found.');
  end if;
  return jsonb_build_object('success', true, 'message', 'User account deleted.');
end;
$$;
revoke all on function public.admin_delete_lifedrop_user(uuid) from public;
grant execute on function public.admin_delete_lifedrop_user(uuid) to authenticated;


-- Existing notifications are private; this adds the missing self-delete policy
-- used by the app's Delete Notification action.
drop policy if exists lifedrop_notifications_delete_self on public.notifications;
create policy lifedrop_notifications_delete_self
on public.notifications for delete to authenticated
using (user_id = auth.uid());

-- Include notification changes in Supabase Realtime for the header unread badge.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
    ) then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;



-- LifeDrop safe add-on: donor detail cards and admin history controls.
-- Run this AFTER reviewing; it does not drop existing tables or functions.

create or replace function public.get_lifedrop_donor_cards(p_blood_group text, p_location text default null)
returns table(
  donor_id uuid, donor_name text, donor_location text, donor_phone text,
  blood_group text, last_donation_date date, photo_path text
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.full_name, p.location, p.phone, p.blood_group,
         p.last_donation_date, p.photo_path
  from public.profiles p
  where p.role = 'donor'
    and p.blood_group = p_blood_group
    and (p_location is null or p.location ilike '%' || p_location || '%')
  order by p.full_name;
$$;
revoke all on function public.get_lifedrop_donor_cards(text,text) from public;
grant execute on function public.get_lifedrop_donor_cards(text,text) to authenticated;

-- Allow signed-in members to view donor profile photos shown in donor cards.
-- This policy is limited to the existing private profile-photos bucket.
drop policy if exists lifedrop_profile_photos_read_members on storage.objects;
create policy lifedrop_profile_photos_read_members
on storage.objects for select to authenticated
using (bucket_id = 'profile-photos');

create or replace function public.admin_delete_lifedrop_support_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_lifedrop_admin() then raise exception 'Admin access required.'; end if;
  delete from public.support_conversations where id = p_conversation_id;
  if not found then raise exception 'Conversation not found.'; end if;
end;
$$;
revoke all on function public.admin_delete_lifedrop_support_conversation(uuid) from public;
grant execute on function public.admin_delete_lifedrop_support_conversation(uuid) to authenticated;

create or replace function public.admin_delete_lifedrop_donation(p_donation_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_lifedrop_admin() then raise exception 'Admin access required.'; end if;
  delete from public.donations where id = p_donation_id;
  if not found then raise exception 'Donation record not found.'; end if;
end;
$$;
revoke all on function public.admin_delete_lifedrop_donation(uuid) from public;
grant execute on function public.admin_delete_lifedrop_donation(uuid) to authenticated;

-- Admin can delete any notification; members retain their existing own-delete policy.
drop policy if exists lifedrop_admin_delete_notifications on public.notifications;
create policy lifedrop_admin_delete_notifications
on public.notifications for delete to authenticated
using (public.is_lifedrop_admin());

-- Public homepage admin card. Only the single admin profile's contact card is exposed.
create or replace function public.get_lifedrop_public_admin_profile()
returns table(full_name text, email text, phone text, photo_path text, about text)
language sql stable security definer set search_path = public
as $$
  select p.full_name, p.email, p.phone, p.photo_path,
         'LifeDrop Project Admin — helping people connect with blood donors safely.'
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at asc
  limit 1;
$$;
revoke all on function public.get_lifedrop_public_admin_profile() from public;
grant execute on function public.get_lifedrop_public_admin_profile() to anon, authenticated;
