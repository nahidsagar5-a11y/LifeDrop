LIFEDROP - SUPABASE CONNECTED EDITION
====================================

WHAT IS IMPLEMENTED
- Supabase email/password registration and login.
- User and Donor profiles stored in Supabase Postgres.
- Profile photos uploaded to a PRIVATE Supabase Storage bucket.
- Blood requests stored online and shared between devices.
- Automatic donor suggestions based on red-cell blood-group compatibility,
  location text match, and a simple 90-day reminder filter.
- Admin review of auto matches; Admin clicks Connect to approve one donor.
- After approval, only the requester and connected donor (plus Admin) can
  read each other's permitted profile fields and private profile photos.
- In-app notifications are sent to BOTH the requester and donor.
- Donor donation history.
- Row Level Security (RLS) policies for database and Storage.

IMPORTANT
- Auto match is a suggestion only. It does NOT medically certify compatibility
  or donor eligibility. A qualified medical professional/blood bank must verify.
- The 90-day filter is only an example reminder rule, not medical clearance.
- Notifications are in-app only. Email/SMS notifications need a separate provider.
- This is a front-end academic project. Have the SQL and security policies reviewed
  before using real patient data in production.

SETUP STEP 1 - CREATE SUPABASE PROJECT
1. Visit https://supabase.com and create a project.
2. Open SQL Editor > New query.
3. Copy all text from supabase_setup.sql, paste it, and click Run.
4. Open Project Settings > API. Copy Project URL and the Publishable key
   (or legacy anon key). Never copy the service_role/secret key into this website.

SETUP STEP 2 - ADD YOUR SUPABASE KEYS
1. Open config.js.
2. Replace PASTE_YOUR_SUPABASE_PROJECT_URL with your Project URL.
3. Replace PASTE_YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY with the publishable/anon key.
4. Save config.js.

SETUP STEP 3 - CREATE THE ADMIN ACCOUNT
1. Open the website and create an account using the email you want as Admin.
2. Confirm the email if Supabase asks you to.
3. In Supabase Dashboard > SQL Editor, run this command, replacing the email:

   update public.profiles set role='admin' where email='admin@lifedrop.com';

4. Log out and log in again. Admin menu will appear.
5. Do NOT give admin access to ordinary users. Do not put service_role keys in config.js.

SETUP STEP 4 - EMAIL AUTH SETTINGS
- For quick academic testing, Supabase Authentication > Providers > Email can
  have email confirmations disabled. For real deployment, keep verification on.
- Authentication > URL Configuration: add your GitHub Pages URL to Site URL
  and Redirect URLs, for example:
  https://YOUR-GITHUB-USERNAME.github.io/LifeDrop/

SETUP STEP 5 - GITHUB PAGES
1. Upload index.html, style.css, app.js, config.js, supabase_setup.sql and README.txt
   to the ROOT of your GitHub repository (not inside another nested folder).
2. Commit changes to the main branch.
3. GitHub repository > Settings > Pages > Deploy from a branch > main > /(root).
4. Wait for the Pages deployment to finish, then open the Pages URL.

TESTING
1. Create a donor account using one email/browser. Complete blood group, phone,
   location and profile photo in My Profile.
2. Create a requester account using another email/browser/device.
3. Submit a blood request with a compatible group and similar location.
4. Log in as Admin and open Requests & Matches. Click Connect on a candidate.
5. Log in as requester and donor. Both should see a notification and the other's
   profile in Connected Profiles. Before connection, profiles remain private.

TROUBLESHOOTING
- “Invalid API key”: check config.js values; use Project URL + Publishable/anon key.
- No donors found: donor must set blood group and location in My Profile; verify
  the donor group is compatible and donation date is not within the last 90 days.
- No Admin menu: run the admin SQL update using the exact registered email, then log out/in.
- Email confirmation issue: check spam and Supabase Auth URL configuration.
