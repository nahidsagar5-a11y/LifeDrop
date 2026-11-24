BLOODDROP - UPDATED PROJECT PACKAGE
==================================

Files
-----
index.html                 Main page and script loading order
style.css                  Responsive visual design
config.js                  Supabase URL and publishable client key
app.js                     Your supplied existing application code
admin-management.js        Admin donor/user listing enhancement
lifedrop-enhancements.js   Dashboard counts, compatibility guide, donor cards,
                           request modals, confirmation modals, notifications,
                           and optional Support Chat interface
optional_features.sql      Additive SQL for blood-group count RPC and Support Chat

IMPORTANT DATABASE NOTES
------------------------
1. Your existing Supabase setup is treated as already working. Do not rerun or
   replace your existing database setup just to use the existing app.
2. The optional_features.sql file is separate and additive. Run it only if you
   want the new blood-group counts and Support Chat. It creates two support
   tables, aggregate-count and support-status RPCs, an admin account-delete RPC,
   admin profile-update permission, the missing medical_condition field, the
   app's private photo bucket if absent, notification delete policy, and Realtime
   publication entries. It does not drop existing data or replace your existing
   donor/request RPCs.
3. The Support page and Support Inbox require optional_features.sql.
4. The dashboard's eight blood-group cards show live counts after the optional
   count function has been installed. Until then, the cards show a dash and the
   existing dashboard continues to work.
5. Your supplied app.js uses the existing RPC functions:
   - get_lifedrop_donor_count
   - search_lifedrop_donors
   - send_lifedrop_donor_request
   - admin_connect_match
   - complete_lifedrop_match
   Keep the working definitions already present in your Supabase project.
6. Your supplied app.js uses the Storage bucket named `profile-photos`. This
   package intentionally does not rename or replace that bucket.
7. The config.js file contains the public/publishable Supabase key. Never put a
   service-role key in browser JavaScript.

RUN LOCALLY
-----------
Open this folder in VS Code. Use the Live Server extension and open index.html.
You can also serve the folder with any local static web server. Internet access is
needed for the Supabase JS library, Google Fonts, and Supabase connection.

MEDICAL NOTE
------------
The compatibility guide is an educational red-blood-cell reference only. A
qualified clinician must assess transfusions, including blood typing and
crossmatching. It is not a plasma or whole-blood compatibility guide.


FINAL UI UPDATE NOTES
- Dashboard blood-group cards are clickable and open exact-group donor results.
- Donor cards show name, blood group, location, phone and last donation date when profile data exists.
- Admin can manage all notifications, delete support conversations, and delete donation history records.
- Homepage admin contact card loads the existing Admin profile (Nahid Sagar) using a limited public RPC.
- Run the ADDITIONAL SQL at the bottom of optional_features.sql in Supabase SQL Editor. Do not replace your existing schema.
- Donor phone numbers and donor photos are available only to signed-in members through the authenticated donor-card RPC.
- JavaScript syntax was checked locally. Live Supabase behavior still depends on running the add-on SQL and your existing RPC/RLS setup.

FIX UPDATE (2026-11-24)
- Admin Donation History now has a working admin-only navigation route.
- Requests & Matches now includes Completed Donation History with a Delete History action.
- The homepage Admin card loads the photo_path saved in the existing Admin profile.
- The optional SQL includes a narrowly scoped Storage read policy for only that Admin profile photo; donor photos remain private to signed-in members.

IMPORTANT: Run the newly appended SQL section at the END of optional_features.sql in Supabase SQL Editor. This is an additive policy/function update; do not replace your existing schema. Then hard-refresh the website (Ctrl+Shift+R) or clear the browser cache.

ADMIN PHOTO DISPLAY FIX (2026-11-24)
----------------------------------
- The Admin profile photo is read from the existing Admin profile photo_path.
- Because profile-photos is a PRIVATE bucket, the homepage requests a temporary
  signed URL. It does not use getPublicUrl(), which cannot display private files.
- The limited Storage SELECT policy for the exact Admin photo object must be
  installed from the public-admin add-on SQL near the end of optional_features.sql.
- If the photo still does not appear, verify in Supabase Table Editor > profiles
  that the Admin row has a non-empty photo_path, and in Storage > profile-photos
  that an object exists at that exact path. The object name must match photo_path.


COMPLETED DONATION HISTORY FIX (2026-11-24)
-------------------------------------------
- Your app marks a match as COMPLETED in the matches table. It does not create
  a row in donations for this completion flow. The previous history panel read
  only the donations table, so it showed an empty message even when a completed
  match was visible in Requests & Matches.
- The history now reads completed rows from matches and displays patient,
  blood group, units, donor, location and date.
- Each completed row has its own Delete history button. Deletion removes only
  that completed match row; the original blood request is retained.
- The duplicate history panel is prevented.
- IMPORTANT: Run the newly added admin_delete_lifedrop_completed_match function
  at the bottom of optional_features.sql in Supabase SQL Editor. Then refresh
  the deployed website with a cache-busting refresh.

COMMUNITY WORKFLOW UPDATE (2026-11-24)
--------------------------------------
- Meet the Admin card is now also shown on every signed-in user/donor/admin Dashboard.
- Blood requests are sent directly to the selected donor. The donor receives a notification and sees the request under Donor Requests.
- Donor confirmation changes the match to CONNECTED. Only then can the requester and donor view each other's name, blood group, location, phone and email in Connected Profiles.
- Both connected members can mark the donation complete. Completion updates the donor profile last_donation_date and creates a donation-history row.
- Donor decline or either member's cancellation requires a reason. The other member receives a notification and the reason is saved with the match.
- After completion, the blood requester can rate and review the donor. Reviews are shown on all signed-in dashboards and the Donor Reviews page.

IMPORTANT SETUP
---------------
1. Open Supabase Dashboard > SQL Editor.
2. Run the complete updated optional_features.sql file. It is additive and does not replace the existing setup tables. It adds workflow columns, a reviews table, participant read policies, and the new v2 RPC functions.
3. Replace the website files with the contents of this ZIP and deploy the updated index.html, app.js, lifedrop-enhancements.js, lifedrop-community.js, style.css, and optional_features.sql.
4. Hard refresh the website / clear the mobile browser cache.
5. Test with two separate accounts: one requester account and one donor account. Send request as requester; confirm as donor; check Connected Profiles on both accounts; complete as either member; then submit a review from the requester account.

SAFETY / PRIVACY
----------------
- Contact details are returned by a protected RPC only to the requester and donor in an accepted/completed match.
- Public donor reviews expose donor name, reviewer name, rating, review text and date only; they do not expose phone, email or profile IDs in the review cards.
- Cancellation requires a reason and the reason is shown to the other participant.
- This is an academic demonstration workflow. Donor eligibility, compatibility and transfusion decisions must be confirmed by qualified medical staff.

The SQL and JavaScript were checked for basic syntax/package integrity. Live behavior still depends on the current Supabase project policies and testing with two accounts; do not use real patient data until the workflow is tested.


DONOR STAR RATINGS + ADMIN REVIEW CONTROL (2026-11-24)
- Requesters can submit a 1–5 star rating using red clickable stars after a donation is completed.
- Donor search results and Admin Donors & Users show the donor's average rating and review count.
- The red star fill is proportional to the donor's average rating; every new, edited, or deleted review recalculates automatically from all saved reviews.
- All users can read public donor reviews.
- Admin has a new Manage Reviews page to edit the star score and review text or delete a review.
- Run the updated optional_features.sql in Supabase SQL Editor before publishing the updated files.


DONOR SIGNUP + REQUEST FIX + COLOUR OUTLINE REDESIGN (2026-11-24)
-----------------------------------------------------------------
- Registration now has one account type only: every new account is a donor.
- Blood group and last donation date are required at signup.
- Donor signup details are safely synced to the signed-in user's own profile
  through complete_lifedrop_donor_signup after email confirmation/login.
- Dashboard replaces Unread Notifications with Donor Reviews; all four metric
  cards are touch/click navigation cards.
- Blood requests now call send_lifedrop_donor_request_v2, the v2 RPC included
  in optional_features.sql. The request status inserted by that RPC is now
  `Searching`, which matches the status constraint previously verified for
  this project; `Waiting for donor` was not an allowed status and caused the
  blood_requests_status_check error.
- Every major panel, form, donor/review card, blood group card, table and
  dashboard card has a coordinated coloured outline. Added readable text
  contrast, responsive touch states, and restrained page/card animations.

IMPORTANT: Run the updated optional_features.sql in Supabase SQL Editor before
publishing this package. It is additive and does not replace existing tables.
Then deploy all updated files from this ZIP and hard-refresh the website.


DONOR RATING DISPLAY FIX (2026-11-24)
-------------------------------------
- Donor search no longer fails to display donor cards if the rating aggregate
  RPC is missing. It falls back to calculating average ratings from the public
  lifedrop_donor_reviews table.
- The star row is visible beside every donor name; new donors show empty stars
  and “No reviews yet” until a requester submits the first post-completion review.
- The script URL was versioned to force browsers to load the updated JavaScript.
- Run the full updated optional_features.sql in Supabase SQL Editor, then deploy
  the updated files and hard-refresh/clear mobile browser cache.


NEW FIXES (2026-11-24)
- Blood Search cards show average donor stars and review counts.
- Donor cards show remaining days in the configured 90-day interval.
- Send Blood Request stays disabled until the date-based interval is reached.
- Requesters can cancel active requests from My Requests.
- Admin can cancel or delete pending requests from Requests & Matches.
- Donor reviews survive deletion of completed match-history rows.
INSTALL:
1. Replace website files with the files in this ZIP.
2. Run the COMPLETE optional_features.sql in Supabase SQL Editor.
3. Deploy and hard-refresh the website (Ctrl+Shift+R).
The 90-day rule is a project date-based guide only; clinical eligibility must be confirmed by a qualified healthcare professional.


LATEST UPDATE
- Signup opens the new account immediately when Supabase returns a session.
- If email confirmation is enabled and Supabase returns no session, the app
  attempts sign-in once; if confirmation is required, the user must confirm
  email first. For immediate automatic login, disable Confirm email in Supabase
  Authentication provider settings.
- Admin Donors & users now loads photo_path and generates signed URLs from the
  private profile-photos Storage bucket to display donor photos.
- If a photo is still missing, verify the object exists at the exact saved
  photo_path in profile-photos and that the admin session can read that bucket.
