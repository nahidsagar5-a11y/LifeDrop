-- BloodDrop OPTIONAL ADD-ON MIGRATION
-- This script is additive: it does not drop or replace existing BloodDrop tables,
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
  subject text not null default 'BloodDrop support',
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



-- BloodDrop safe add-on: donor detail cards and admin history controls.
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
         'BloodDrop Project Admin — helping people connect with blood donors safely.'
  from public.profiles p
  where p.role = 'admin'
  order by p.created_at asc
  limit 1;
$$;
revoke all on function public.get_lifedrop_public_admin_profile() from public;
grant execute on function public.get_lifedrop_public_admin_profile() to anon, authenticated;


-- Public homepage can display ONLY the photo_path saved on the Admin profile.
-- This does not make the whole profile-photos bucket or donor photos public.
create or replace function public.lifedrop_is_public_admin_photo(p_object_name text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.role = 'admin' and p.photo_path = p_object_name
  );
$$;
revoke all on function public.lifedrop_is_public_admin_photo(text) from public;
grant execute on function public.lifedrop_is_public_admin_photo(text) to anon, authenticated;

drop policy if exists lifedrop_public_read_admin_profile_photo on storage.objects;
create policy lifedrop_public_read_admin_profile_photo
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'profile-photos'
  and public.lifedrop_is_public_admin_photo(name)
);


-- BloodDrop fix (2026-11-24): completed donations are represented by completed
-- rows in public.matches. The Admin history UI reads those rows directly.
-- This RPC deletes only the selected completed match; it leaves the blood request
-- and all other matches untouched.
create or replace function public.admin_delete_lifedrop_completed_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_lifedrop_admin() then
    raise exception 'Admin access required.';
  end if;

  delete from public.matches
  where id = p_match_id
    and lower(coalesce(status, '')) = 'completed';

  if not found then
    raise exception 'Completed donation record not found.';
  end if;
end;
$$;
revoke all on function public.admin_delete_lifedrop_completed_match(uuid) from public;
grant execute on function public.admin_delete_lifedrop_completed_match(uuid) to authenticated;

-- =========================================================
-- LIFEDROP COMMUNITY WORKFLOW (2026-11-24)
-- Donor confirmation, mutual private profiles, completion,
-- cancellation reasons, and public donor reviews.
-- Additive migration: does not drop existing tables or data.
-- =========================================================

alter table public.matches add column if not exists cancel_reason text;
alter table public.matches add column if not exists cancelled_by uuid references public.profiles(id) on delete set null;
alter table public.matches add column if not exists completed_at timestamptz;
alter table public.matches add column if not exists completed_by uuid references public.profiles(id) on delete set null;

-- Ensure each participant can read their own request and match records.
drop policy if exists lifedrop_match_participant_read on public.matches;
create policy lifedrop_match_participant_read on public.matches for select to authenticated
using (requester_id=auth.uid() or donor_id=auth.uid() or public.is_lifedrop_admin());
grant select on public.matches to authenticated;
drop policy if exists lifedrop_blood_request_participant_read on public.blood_requests;
create policy lifedrop_blood_request_participant_read on public.blood_requests for select to authenticated
using (requester_id=auth.uid() or public.is_lifedrop_admin() or exists (select 1 from public.matches m where m.request_id=blood_requests.id and m.donor_id=auth.uid()));
grant select on public.blood_requests to authenticated;

create table if not exists public.lifedrop_donor_reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete cascade,
  donor_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review_text text not null check (length(trim(review_text)) between 5 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_lifedrop_reviews_donor_created on public.lifedrop_donor_reviews(donor_id, created_at desc);
alter table public.lifedrop_donor_reviews enable row level security;
drop policy if exists lifedrop_reviews_public_read on public.lifedrop_donor_reviews;
create policy lifedrop_reviews_public_read on public.lifedrop_donor_reviews for select to anon, authenticated using (true);
grant select on public.lifedrop_donor_reviews to anon, authenticated;

-- A new request is immediately delivered to the selected donor; Admin does not
-- need to manually connect the match. The donor must explicitly confirm.
create or replace function public.send_lifedrop_donor_request_v2(
  p_donor_id uuid, p_patient_name text, p_blood_group text, p_units integer,
  p_needed_date date, p_location text, p_contact_phone text, p_details text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth
as $$
declare v_request_id uuid; v_match_id uuid; v_donor public.profiles%rowtype; v_requester public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Please login first.'; end if;
  select * into v_requester from public.profiles where id=auth.uid();
  if not found then raise exception 'Your profile was not found.'; end if;
  if p_donor_id=auth.uid() then raise exception 'You cannot send a request to yourself.'; end if;
  select * into v_donor from public.profiles where id=p_donor_id and role='donor';
  if not found then raise exception 'Selected donor is not available.'; end if;
  if not public.is_compatible_donor(v_donor.blood_group,p_blood_group) then raise exception 'This donor is not compatible with the requested blood group.'; end if;
  if nullif(trim(p_patient_name),'') is null or nullif(trim(p_location),'') is null or nullif(trim(p_contact_phone),'') is null then raise exception 'Please complete all required fields.'; end if;
  if p_units not between 1 and 20 or p_needed_date < current_date then raise exception 'Invalid units or required date.'; end if;
  insert into public.blood_requests(requester_id,patient_name,blood_group,units,needed_date,location,contact_phone,details,status)
  values(auth.uid(),trim(p_patient_name),p_blood_group,p_units,p_needed_date,trim(p_location),trim(p_contact_phone),nullif(trim(p_details),''),'Searching') returning id into v_request_id;
  insert into public.matches(request_id,requester_id,donor_id,status)
  values(v_request_id,auth.uid(),p_donor_id,'pending_donor') returning id into v_match_id;
  insert into public.notifications(user_id,title,message) values
  (p_donor_id,'New blood donation request',v_requester.full_name||' sent you a request for '||p_blood_group||' blood. Please confirm or decline in Donor Requests.'),
  (auth.uid(),'Request sent','Your blood request was sent to '||v_donor.full_name||'. You will be notified when the donor responds.');
  return jsonb_build_object('success',true,'request_id',v_request_id,'match_id',v_match_id);
end; $$;
revoke all on function public.send_lifedrop_donor_request_v2(uuid,text,text,integer,date,text,text,text) from public;
grant execute on function public.send_lifedrop_donor_request_v2(uuid,text,text,integer,date,text,text,text) to authenticated;

-- Donor confirms/declines a new request, or either connected member cancels.
-- A reason is mandatory for every decline/cancellation.
create or replace function public.donor_respond_lifedrop_match(p_match_id uuid,p_accept boolean,p_reason text default null)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_match public.matches%rowtype; v_actor_name text; v_other uuid;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if auth.uid() not in (v_match.donor_id,v_match.requester_id) then raise exception 'You are not part of this request.'; end if;
  select full_name into v_actor_name from public.profiles where id=auth.uid();
  v_other := case when auth.uid()=v_match.donor_id then v_match.requester_id else v_match.donor_id end;
  if p_accept then
    if auth.uid()<>v_match.donor_id then raise exception 'Only the donor can confirm a request.'; end if;
    if v_match.status not in ('pending_donor','candidate') then raise exception 'This request is no longer waiting for donor confirmation.'; end if;
    update public.matches set status='connected',connected_at=now(),cancel_reason=null,cancelled_by=null where id=p_match_id;
    update public.blood_requests set status='Connected' where id=v_match.request_id;
    insert into public.notifications(user_id,title,message) values
      (v_match.requester_id,'Donor confirmed your request',coalesce(v_actor_name,'Your donor')||' accepted your blood request. You can now view each other’s contact profiles.'),
      (v_match.donor_id,'Connection confirmed','You are connected with the blood requester. You can now view each other’s contact profiles.');
  else
    if nullif(trim(p_reason),'') is null or length(trim(p_reason))<5 then raise exception 'Please provide a reason (at least 5 characters).'; end if;
    if v_match.status not in ('pending_donor','candidate','connected') then raise exception 'This request cannot be cancelled now.'; end if;
    if v_match.status='pending_donor' or v_match.status='candidate' then
      if auth.uid()<>v_match.donor_id then raise exception 'Only the donor can decline a pending request.'; end if;
    end if;
    update public.matches set status='cancelled',cancel_reason=trim(p_reason),cancelled_by=auth.uid() where id=p_match_id;
    insert into public.notifications(user_id,title,message) values
      (v_other,'Donation request cancelled',coalesce(v_actor_name,'A member')||' cancelled the donation request. Reason: '||trim(p_reason)),
      (auth.uid(),'Cancellation recorded','Your cancellation reason was sent to the other member.');
  end if;
end; $$;
revoke all on function public.donor_respond_lifedrop_match(uuid,boolean,text) from public;
grant execute on function public.donor_respond_lifedrop_match(uuid,boolean,text) to authenticated;

-- Contact details are revealed only to the two members of an accepted match.
create or replace function public.get_lifedrop_connected_profile(p_match_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,auth
as $$
declare v_match public.matches%rowtype; v_other uuid; v_profile public.profiles%rowtype;
begin
  select * into v_match from public.matches where id=p_match_id;
  if not found or v_match.status not in ('connected','completed') then return null; end if;
  if auth.uid()=v_match.requester_id then v_other:=v_match.donor_id;
  elsif auth.uid()=v_match.donor_id then v_other:=v_match.requester_id;
  else return null; end if;
  select * into v_profile from public.profiles where id=v_other;
  if not found then return null; end if;
  return jsonb_build_object('id',v_profile.id,'full_name',v_profile.full_name,'email',v_profile.email,'phone',v_profile.phone,'blood_group',v_profile.blood_group,'location',v_profile.location,'photo_path',v_profile.photo_path,'last_donation_date',v_profile.last_donation_date);
end; $$;
revoke all on function public.get_lifedrop_connected_profile(uuid) from public;
grant execute on function public.get_lifedrop_connected_profile(uuid) to authenticated;

-- Complete by either connected member; update the donor's eligibility date.
create or replace function public.complete_lifedrop_match_v2(p_match_id uuid)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_match public.matches%rowtype; v_place text; v_donor_name text;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  if not found then raise exception 'Connected donation was not found.'; end if;
  if auth.uid() not in (v_match.requester_id,v_match.donor_id) then raise exception 'You are not part of this donation.'; end if;
  if v_match.status<>'connected' then raise exception 'Only a connected donation can be completed.'; end if;
  select location into v_place from public.blood_requests where id=v_match.request_id;
  select full_name into v_donor_name from public.profiles where id=v_match.donor_id;
  update public.matches set status='completed',completed_at=now(),completed_by=auth.uid() where id=p_match_id;
  update public.profiles set last_donation_date=current_date where id=v_match.donor_id;
  insert into public.donations(donor_id,donation_date,place) values(v_match.donor_id,current_date,coalesce(v_place,'BloodDrop donation'));
  update public.blood_requests set status='Completed' where id=v_match.request_id;
  insert into public.notifications(user_id,title,message) values
    (v_match.requester_id,'Donation completed','The donation with '||coalesce(v_donor_name,'your donor')||' was marked completed.'),
    (v_match.donor_id,'Donation completed','Your last donation date has been updated to '||current_date::text||'.');
end; $$;
revoke all on function public.complete_lifedrop_match_v2(uuid) from public;
grant execute on function public.complete_lifedrop_match_v2(uuid) to authenticated;

create or replace function public.submit_lifedrop_donor_review(p_match_id uuid,p_rating integer,p_review_text text)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_match public.matches%rowtype;
begin
  select * into v_match from public.matches where id=p_match_id;
  if not found or v_match.status<>'completed' then raise exception 'Only completed donations can be reviewed.'; end if;
  if auth.uid()<>v_match.requester_id then raise exception 'Only the blood requester can review this donor.'; end if;
  if p_rating not between 1 and 5 or length(trim(coalesce(p_review_text,''))) not between 5 and 1000 then raise exception 'Please provide a rating and a review of 5–1000 characters.'; end if;
  insert into public.lifedrop_donor_reviews(match_id,donor_id,reviewer_id,rating,review_text)
  values(p_match_id,v_match.donor_id,auth.uid(),p_rating,trim(p_review_text));
end; $$;
revoke all on function public.submit_lifedrop_donor_review(uuid,integer,text) from public;
grant execute on function public.submit_lifedrop_donor_review(uuid,integer,text) to authenticated;

drop function if exists public.get_lifedrop_public_donor_reviews(integer);
create or replace function public.get_lifedrop_public_donor_reviews(p_limit integer default 50)
returns table(review_id uuid,donor_id uuid,reviewer_id uuid,donor_name text,reviewer_name text,rating integer,review_text text,created_at timestamptz)
language sql stable security definer set search_path=public
as $$
  select r.id,r.donor_id,r.reviewer_id,d.full_name,rv.full_name,r.rating,r.review_text,r.created_at
  from public.lifedrop_donor_reviews r
  join public.profiles d on d.id=r.donor_id
  join public.profiles rv on rv.id=r.reviewer_id
  order by r.created_at desc limit greatest(1,least(coalesce(p_limit,50),200));
$$;
revoke all on function public.get_lifedrop_public_donor_reviews(integer) from public;
grant execute on function public.get_lifedrop_public_donor_reviews(integer) to anon,authenticated;

-- Public aggregate rating for each donor: average star score and total review count.
create or replace function public.get_lifedrop_donor_ratings()
returns table(donor_id uuid,review_count bigint,average_rating numeric)
language sql stable security definer set search_path=public
as $$
  select r.donor_id,count(*)::bigint,round(avg(r.rating)::numeric,1)
  from public.lifedrop_donor_reviews r
  group by r.donor_id;
$$;
revoke all on function public.get_lifedrop_donor_ratings() from public;
grant execute on function public.get_lifedrop_donor_ratings() to anon,authenticated;

-- Admin-only review editing and deletion. The original requester and donor remain unchanged.
create or replace function public.admin_update_lifedrop_donor_review(p_review_id uuid,p_rating integer,p_review_text text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_lifedrop_admin() then raise exception 'Admin access required.'; end if;
  if p_rating not between 1 and 5 or length(trim(coalesce(p_review_text,''))) not between 5 and 1000 then
    raise exception 'Rating must be 1–5 and review text 5–1000 characters.';
  end if;
  update public.lifedrop_donor_reviews
    set rating=p_rating,review_text=trim(p_review_text)
    where id=p_review_id;
  if not found then raise exception 'Review not found.'; end if;
end; $$;
revoke all on function public.admin_update_lifedrop_donor_review(uuid,integer,text) from public;
grant execute on function public.admin_update_lifedrop_donor_review(uuid,integer,text) to authenticated;

create or replace function public.admin_delete_lifedrop_donor_review(p_review_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_lifedrop_admin() then raise exception 'Admin access required.'; end if;
  delete from public.lifedrop_donor_reviews where id=p_review_id;
  if not found then raise exception 'Review not found.'; end if;
end; $$;
revoke all on function public.admin_delete_lifedrop_donor_review(uuid) from public;
grant execute on function public.admin_delete_lifedrop_donor_review(uuid) to authenticated;


-- 2026-11-24: Complete donor registration safely after email confirmation.
-- The caller can update only their own profile, and cannot choose another role.
create or replace function public.complete_lifedrop_donor_signup(
  p_blood_group text,
  p_last_donation_date date
) returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Please log in to complete donor registration.';
  end if;
  if p_blood_group not in ('A+','A-','B+','B-','AB+','AB-','O+','O-') then
    raise exception 'Please select a valid blood group.';
  end if;
  if p_last_donation_date is null or p_last_donation_date > current_date then
    raise exception 'Please enter a valid last donation date.';
  end if;

  update public.profiles
  set role = 'donor',
      blood_group = p_blood_group,
      last_donation_date = p_last_donation_date
  where id = auth.uid()
    and role <> 'admin';

  if not found then
    raise exception 'Your donor profile could not be updated.';
  end if;
end;
$$;
revoke all on function public.complete_lifedrop_donor_signup(text,date) from public;
grant execute on function public.complete_lifedrop_donor_signup(text,date) to authenticated;


-- =========================================================
-- LIFEDROP REQUEST ELIGIBILITY / CANCELLATION / ADMIN CLEANUP
-- 2026-11-24. Keep donor reviews independent from match history.
-- =========================================================
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.lifedrop_donor_reviews'::regclass and contype='f'
      and pg_get_constraintdef(oid) ilike '%(match_id)%'
  loop execute format('alter table public.lifedrop_donor_reviews drop constraint %I',c.conname); end loop;
end $$;
alter table public.lifedrop_donor_reviews alter column match_id drop not null;
alter table public.lifedrop_donor_reviews add constraint lifedrop_donor_reviews_match_id_fkey
  foreign key(match_id) references public.matches(id) on delete set null;

create or replace function public.cancel_lifedrop_blood_request(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public,auth
as $$
declare v_request public.blood_requests%rowtype; v_actor text; v_match record;
begin
  if auth.uid() is null then raise exception 'Please log in first.'; end if;
  select * into v_request from public.blood_requests where id=p_request_id for update;
  if not found then raise exception 'Blood request not found.'; end if;
  if v_request.requester_id<>auth.uid() and not public.is_lifedrop_admin() then raise exception 'Only the requester or Admin can cancel this blood request.'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null or length(trim(p_reason))<5 then raise exception 'Please provide a cancellation reason of at least 5 characters.'; end if;
  if lower(coalesce(v_request.status,'')) in ('completed','cancelled') then raise exception 'This request is already completed or cancelled.'; end if;
  select full_name into v_actor from public.profiles where id=auth.uid();
  for v_match in update public.matches set status='cancelled',cancel_reason=trim(p_reason),cancelled_by=auth.uid()
    where request_id=p_request_id and status in ('pending_donor','candidate','connected') returning donor_id
  loop
    insert into public.notifications(user_id,title,message) values(v_match.donor_id,'Blood request cancelled',coalesce(v_actor,'Requester/Admin')||' cancelled the blood request. Reason: '||trim(p_reason));
  end loop;
  update public.blood_requests set status='Cancelled' where id=p_request_id;
  insert into public.notifications(user_id,title,message) values(v_request.requester_id,'Blood request cancelled','Your blood request has been cancelled.');
end;
$$;
revoke all on function public.cancel_lifedrop_blood_request(uuid,text) from public;
grant execute on function public.cancel_lifedrop_blood_request(uuid,text) to authenticated;

create or replace function public.admin_delete_lifedrop_blood_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_status text;
begin
  if not public.is_lifedrop_admin() then raise exception 'Admin access required.'; end if;
  select status into v_status from public.blood_requests where id=p_request_id for update;
  if not found then raise exception 'Blood request not found.'; end if;
  if lower(coalesce(v_status,''))='completed' or exists(select 1 from public.matches where request_id=p_request_id and lower(coalesce(status,''))='completed') then
    raise exception 'Completed donation records cannot be deleted from Pending Request Management.';
  end if;
  delete from public.matches where request_id=p_request_id;
  delete from public.blood_requests where id=p_request_id;
  if not found then raise exception 'Blood request could not be deleted.'; end if;
end;
$$;
revoke all on function public.admin_delete_lifedrop_blood_request(uuid) from public;
grant execute on function public.admin_delete_lifedrop_blood_request(uuid) to authenticated;
