/* =========================================================
   BLOODDROP - COMPLETE APP.JS
   HTML + CSS + JavaScript + Supabase

   FEATURES:
   - Authentication
   - Admin, User and Donor dashboards
   - Blood donor search
   - Send blood requests
   - Admin donor connection
   - Connected profiles
   - Complete donation
   - Notifications
   - Profile management
   - Donor management
   - Donation history

   FIX:
   - Completed requests excluded from pending count
   - Unique requests counted once
   - Dashboard refresh after request and completion
========================================================= */

'use strict';

/* -------------------- CONFIGURATION -------------------- */

const groups = [
  'A+', 'A-', 'B+', 'B-',
  'AB+', 'AB-', 'O+', 'O-'
];

const SUPABASE_URL =
  window.LIFEDROP_SUPABASE_URL || '';

const SUPABASE_KEY =
  window.LIFEDROP_SUPABASE_ANON_KEY || '';

const ready = !!(
  window.supabase &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_KEY
);

const db = ready
  ? window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    )
  : null;

let session = null;
let me = null;
let myProfile = null;
let page = 'Dashboard';
let appStarted = false;

const $ = id => document.getElementById(id);

/* -------------------- COMMON HELPERS -------------------- */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function toast(message) {
  const element = $('toast');

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add('show');

  window.setTimeout(() => {
    element.classList.remove('show');
  }, 3200);
}

function showError(error, context = 'BloodDrop') {
  console.error(context, error);
  toast(error?.message || 'Something went wrong.');
}

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase();
}

function groupOptions(selected = '') {
  return `
    <option value="">Select blood group</option>
    ${groups.map(group => `
      <option value="${group}" ${group === selected ? 'selected' : ''}>
        ${group}
      </option>
    `).join('')}
  `;
}

/* -------------------- AUTHENTICATION -------------------- */

function authMode(mode) {
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.tab === mode
    );
  });

  if ($('login-form')) {
    $('login-form').classList.toggle('hidden', mode !== 'login');
  }

  if ($('signup-form')) {
    $('signup-form').classList.toggle('hidden', mode !== 'signup');
  }
}

function showAuth() {
  if ($('app-view')) $('app-view').classList.add('hidden');
  if ($('config-view')) $('config-view').classList.add('hidden');
  if ($('auth-view')) $('auth-view').classList.remove('hidden');

  if ($('header-user')) {
    $('header-user').textContent = '';
  }
}

async function logout() {
  if (!db) return;

  const { error } = await db.auth.signOut();

  if (error) throw error;

  session = null;
  me = null;
  myProfile = null;
  page = 'Dashboard';

  showAuth();
}

async function boot() {
  if (!db) {
    throw new Error(
      'Supabase is not configured. Check config.js.'
    );
  }

  const {
    data: sessionData,
    error: sessionError
  } = await db.auth.getSession();

  if (sessionError) throw sessionError;

  session = sessionData.session;

  if (!session) {
    me = null;
    myProfile = null;
    showAuth();
    return;
  }

  const {
    data: profile,
    error: profileError
  } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile) {
    throw new Error(
      'Your profile was not found. Please contact the admin.'
    );
  }

  // New registrations are donors. Sync the required signup details from
  // Auth metadata after email confirmation or the first successful login.
  const signupMeta = session.user.user_metadata || {};
  if (signupMeta.lifedrop_account_type === 'donor' && profile.role !== 'admin') {
    const needsSync =
      profile.role !== 'donor' ||
      !profile.blood_group ||
      !profile.last_donation_date;
    if (needsSync) {
      const { error: syncError } = await db.rpc('complete_lifedrop_donor_signup', {
        p_blood_group: signupMeta.blood_group,
        p_last_donation_date: signupMeta.last_donation_date
      });
      if (syncError) {
        console.warn('Donor profile sync needs attention:', syncError);
      } else {
        const { data: syncedProfile, error: reloadError } = await db
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!reloadError && syncedProfile) profile = syncedProfile;
      }
    }
  }

  me = profile;
  myProfile = profile;

  showApp();
}

async function loginSubmit(event) {
  event.preventDefault();

  if (!db) {
    return toast('Check your Supabase config.js file.');
  }

  const form = new FormData(event.currentTarget);

  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await boot();

  } catch (error) {
    showError(error, 'Login error');
  }
}

async function signupSubmit(event) {
  event.preventDefault();

  if (!db) {
    return toast('Check your Supabase config.js file.');
  }

  const form = new FormData(event.currentTarget);

  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const fullName = String(form.get('name') || '').trim();
  const bloodGroup = String(form.get('blood_group') || '').trim();
  const lastDonationDate = String(form.get('last_donation_date') || '').trim();
  const today = new Date();
  const todayText = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0')
  ].join('-');

  if (!fullName) return toast('Please enter your full name.');
  if (!groups.includes(bloodGroup)) return toast('Please select your blood group.');
  if (!lastDonationDate) return toast('Please enter your last donation date.');
  if (lastDonationDate > todayText) return toast('Last donation date cannot be in the future.');

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role: 'donor',
          lifedrop_account_type: 'donor',
          blood_group: bloodGroup,
          last_donation_date: lastDonationDate
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      await boot();
    } else {
      toast(
        'Account created. Please confirm your email, then log in.'
      );
    }

  } catch (error) {
    showError(error, 'Signup error');
  }
}

/* -------------------- APP NAVIGATION -------------------- */

function pages() {
  if (me?.role === 'admin') {
    return [
      'Dashboard',
      'Search Blood',
      'Requests & Matches',
      'Donors',
      'Notifications',
      'My Profile'
    ];
  }

  return [
    'Dashboard',
    'Search Blood',
    'My Requests',
    'Connected Profiles',
    'Notifications',
    'My Profile',
    ...(me?.role === 'donor' ? ['My Donations'] : [])
  ];
}

function showApp() {
  if ($('config-view')) {
    $('config-view').classList.add('hidden');
  }

  if ($('auth-view')) {
    $('auth-view').classList.add('hidden');
  }

  if ($('app-view')) {
    $('app-view').classList.remove('hidden');
  }

  if ($('header-user')) {
    $('header-user').textContent =
      `${me?.full_name || 'User'} • ${(me?.role || 'user').toUpperCase()}`;
  }

  if ($('welcome-title')) {
    $('welcome-title').textContent =
      `Hello, ${(me?.full_name || 'User').split(' ')[0]}`;
  }

  if (!pages().includes(page)) {
    page = 'Dashboard';
  }

  renderNav();
  renderPage();
}

function renderNav() {
  const nav = $('nav');

  if (!nav) return;

  nav.innerHTML = pages().map(item => `
    <button
      type="button"
      class="${item === page ? 'active' : ''}"
      data-page="${esc(item)}">
      ${esc(item)}
    </button>
  `).join('');
}

/* -------------------- PAGE RENDERING -------------------- */

async function renderPage() {
  const element = $('page-content');

  if (!element) return;

  element.innerHTML = '<div class="panel">Loading...</div>';

  const pageFunctions = {
    'Dashboard': dashboard,
    'Search Blood': searchBlood,
    'My Requests': myRequests,
    'Requests & Matches': adminRequests,
    'Donors': adminDonors,
    'Connected Profiles': connectedProfiles,
    'Notifications': notificationsPage,
    'My Profile': profilePage,
    'My Donations': myDonations
  };

  try {
    const html = await (pageFunctions[page] || dashboard)();

    element.innerHTML = html;

    bindPage();

  } catch (error) {
    console.error('Page load error:', error);

    element.innerHTML = `
      <div class="panel">
        <h2>Unable to load page</h2>
        <p>${esc(error.message || 'Unknown error')}</p>
      </div>
    `;
  }
}

/* -------------------- PAGE EVENT BINDING -------------------- */

function bindPage() {

  const searchForm = $('blood-search-form');

  if (searchForm) {
    searchForm.onsubmit = async event => {
      event.preventDefault();

      const form = new FormData(searchForm);

      const bloodGroup = String(
        form.get('blood_group') || ''
      );

      const location = String(
        form.get('location') || ''
      );

      if (!groups.includes(bloodGroup)) {
        return toast('Please select a valid blood group.');
      }

      await runDonorSearch(bloodGroup, location);
    };
  }

  document.querySelectorAll('[data-goto]').forEach(button => {
    button.onclick = async () => {
      page = button.dataset.goto;
      renderNav();
      await renderPage();
    };
  });

  document.querySelectorAll('[data-send-request]').forEach(button => {
    button.onclick = async () => {
      await sendDonorRequest(
        button.dataset.sendRequest,
        button.dataset.bloodGroup,
        button.dataset.donorName || '',
        button.dataset.donorLocation || ''
      );
    };
  });

  document.querySelectorAll('[data-admin-connect]').forEach(button => {
    button.onclick = async () => {
      await adminConnectMatch(
        button.dataset.adminConnect
      );
    };
  });

  document.querySelectorAll('[data-complete-match]').forEach(button => {
    button.onclick = async () => {
      await completeMatch(
        button.dataset.completeMatch
      );
    };
  });

  document.querySelectorAll('[data-mark-read]').forEach(button => {
    button.onclick = async () => {
      const notificationId = button.dataset.markRead;

      button.disabled = true;

      try {
        const { error } = await db
          .from('notifications')
          .update({ is_read: true })
          .eq('id', notificationId)
          .eq('user_id', session.user.id);

        if (error) throw error;

        toast('Notification marked as read.');

        await renderPage();

      } catch (error) {
        button.disabled = false;
        showError(error, 'Mark as read error');
      }
    };
  });

  document.querySelectorAll('[data-delete-notification]').forEach(button => {
    button.onclick = async () => {
      const notificationId = button.dataset.deleteNotification;

      if (!confirm('Delete this notification?')) return;

      button.disabled = true;

      try {
        const { error } = await db
          .from('notifications')
          .delete()
          .eq('id', notificationId)
          .eq('user_id', session.user.id);

        if (error) throw error;

        toast('Notification deleted successfully.');

        await renderPage();

      } catch (error) {
        button.disabled = false;
        showError(error, 'Delete notification error');
      }
    };
  });

  const profileForm = $('profile-form');

  if (profileForm) {
    profileForm.onsubmit = async event => {
      event.preventDefault();

      const form = new FormData(profileForm);
      const file = form.get('photo');

      try {
        let photo_path = me.photo_path || null;

        if (file && file.size) {
          if (file.size > 3 * 1024 * 1024) {
            throw new Error('Choose a photo smaller than 3 MB.');
          }

          if (![
            'image/jpeg',
            'image/png',
            'image/webp'
          ].includes(file.type)) {
            throw new Error('Use JPG, PNG or WebP photo.');
          }

          const extension =
            file.type === 'image/png' ? 'png' :
            file.type === 'image/webp' ? 'webp' : 'jpg';

          const path = `${me.id}/profile.${extension}`;

          const { error: uploadError } = await db.storage
            .from('profile-photos')
            .upload(path, file, {
              upsert: true,
              contentType: file.type
            });

          if (uploadError) throw uploadError;

          photo_path = path;
        }

        const update = {
          full_name: String(form.get('full_name') || '').trim(),
          phone: String(form.get('phone') || '').trim(),
          blood_group: form.get('blood_group') || null,
          last_donation_date: form.get('last_donation_date') || null,
          location: String(form.get('location') || '').trim(),
          medical_condition: String(form.get('medical_condition') || '').trim() || null,
          photo_path
        };

        const {
          data,
          error
        } = await db
          .from('profiles')
          .update(update)
          .eq('id', session.user.id)
          .select()
          .single();

        if (error) throw error;

        me = data;
        myProfile = data;

        toast('Profile updated successfully.');

        await renderPage();

      } catch (error) {
        showError(error, 'Profile update error');
      }
    };
  }
}

/* -------------------- DATABASE HELPERS -------------------- */

async function countRows(table, filters = []) {
  let query = db
    .from(table)
    .select('id', {
      count: 'exact',
      head: true
    });

  for (const filter of filters) {
    query = query[filter.method](...filter.args);
  }

  const { count, error } = await query;

  if (error) throw error;

  return count || 0;
}

/* -------------------- ACTIVE REQUEST COUNT -------------------- */

async function countActiveRequests() {
  let requestQuery = db
    .from('blood_requests')
    .select('id');

  if (me?.role !== 'admin') {
    requestQuery = requestQuery.eq(
      'requester_id',
      session.user.id
    );
  }

  const {
    data: requests,
    error: requestError
  } = await requestQuery;

  if (requestError) throw requestError;

  if (!requests?.length) return 0;

  const requestIds = requests.map(item => item.id);

  const {
    data: matches,
    error: matchError
  } = await db
    .from('matches')
    .select('request_id, status')
    .in('request_id', requestIds);

  if (matchError) throw matchError;

  const matchesByRequest = new Map();

  for (const match of matches || []) {
    if (!matchesByRequest.has(match.request_id)) {
      matchesByRequest.set(match.request_id, []);
    }

    matchesByRequest.get(match.request_id).push(match);
  }

  let activeCount = 0;

  for (const request of requests) {
    const requestMatches =
      matchesByRequest.get(request.id) || [];

    // Request without a match is still pending.
    if (requestMatches.length === 0) {
      activeCount++;
      continue;
    }

    // Count request only if it has at least one
    // non-completed match.
    const hasActiveMatch = requestMatches.some(
      match =>
        String(match.status || '').toLowerCase() !== 'completed'
    );

    if (hasActiveMatch) {
      activeCount++;
    }
  }

  return activeCount;
}

/* -------------------- DASHBOARD -------------------- */

async function getRegisteredDonorCount() {
  const { data, error } = await db.rpc(
    'get_lifedrop_donor_count'
  );

  if (error) throw error;

  return Number(data || 0);
}

async function dashboard() {
  const [
    donors,
    requests,
    connected,
    reviews
  ] = await Promise.all([
    getRegisteredDonorCount(),
    countActiveRequests(),
    countRows('matches', [
      { method: 'eq', args: ['status', 'connected'] }
    ]),
    countRows('lifedrop_donor_reviews', [])
  ]);

  return `
    <div class="stats dashboard-stats">
      <button class="stat-card stat-donors" type="button" data-goto="${me.role === 'admin' ? 'Donors' : 'Search Blood'}">
        <span class="stat-icon">🩸</span>
        <span>Registered Donors</span>
        <b>${donors}</b>
        <small>Tap to view donors ↗</small>
      </button>

      <button class="stat-card stat-requests" type="button" data-goto="${me.role === 'admin' ? 'Requests & Matches' : 'My Requests'}">
        <span class="stat-icon">⏳</span>
        <span>Pending Blood Requests</span>
        <b>${requests}</b>
        <small>Tap to view requests ↗</small>
      </button>

      <button class="stat-card stat-matches" type="button" data-goto="Connected Profiles">
        <span class="stat-icon">🤝</span>
        <span>Connected Matches</span>
        <b>${connected}</b>
        <small>Tap to view connections ↗</small>
      </button>

      <button class="stat-card stat-reviews" type="button" data-goto="Donor Reviews">
        <span class="stat-icon">⭐</span>
        <span>Donor Reviews</span>
        <b>${reviews}</b>
        <small>Tap to read reviews ↗</small>
      </button>
    </div>

    <section class="panel dashboard-welcome">
      <p class="eyebrow">WELCOME TO THE COMMUNITY</p>
      <h2>Welcome to BloodDrop</h2>
      <p class="muted">Give blood. Give life. Find compatible blood donors easily.</p>
      <div class="actions">
        <button class="btn primary" data-goto="Search Blood" type="button">🩸 Search Blood</button>
        ${me.role === 'admin' ? `
          <button class="btn outline" data-goto="Requests & Matches" type="button">Manage Requests</button>
          <button class="btn outline" data-goto="Manage Reviews" type="button">Manage Reviews</button>
        ` : ''}
        <button class="btn outline" data-goto="My Profile" type="button">My Profile</button>
      </div>
    </section>

    <div class="note">
      Blood compatibility and donor eligibility must be confirmed by qualified medical professionals.
    </div>
  `;
}

/* -------------------- SEARCH BLOOD -------------------- */

async function searchBlood() {
  return `
    <section class="search-hero">
      <div class="search-hero-copy">
        <span class="search-kicker">🩸 FIND A LIFESAVER</span>
        <h2>Find the right blood donor</h2>
        <p>Search trusted community donors by blood group and location. A small connection can make a big difference.</p>
      </div>
      <div class="search-hero-icon" aria-hidden="true">❤</div>
    </section>

    <section class="panel search-panel">
      <div class="search-panel-heading">
        <div><span class="section-tag">DONOR SEARCH</span><h2>What blood do you need?</h2></div>
        <span class="search-step">01 <i>/ 02</i></span>
      </div>
      <p class="muted">Choose the required blood group. Add a location to narrow your results.</p>
      <form id="blood-search-form" class="form-grid search-form">
        <label><span>🩸 Required blood group</span><select name="blood_group" required>${groupOptions()}</select></label>
        <label><span>📍 Location <small>(optional)</small></span><input name="location" type="text" placeholder="e.g. Dhanmondi, Dhaka"></label>
        <div class="wide"><button type="submit" class="btn primary search-submit">🔎 Search available donors</button></div>
      </form>
      <div class="search-assurance"><span>✓</span> Donor contact requests are sent privately through BloodDrop.</div>
    </section>
    <div id="donor-search-results"></div>
  `;
}

/* -------------------- RUN DONOR SEARCH -------------------- */
async function runDonorSearch(bloodGroup, location = '') {
  const results = $('donor-search-results');
  if (!results) return;

  results.innerHTML = `<div class="panel search-loading"><span class="loading-pulse">🩸</span><strong>Finding compatible donors…</strong><p class="muted">Please wait while we check the donor list.</p></div>`;

  try {
    const { data, error } = await db.rpc('search_lifedrop_donors', {
      p_blood_group: bloodGroup,
      p_location: location.trim() || null
    });
    if (error) throw error;

    if (!data?.length) {
      results.innerHTML = `<div class="panel empty search-empty"><div class="empty-heart">♡</div><h3>No matching donors found</h3><p class="muted">Try another blood group or a nearby location. New donors may join the community soon.</p></div>`;
      return;
    }

    results.innerHTML = `
      <section class="search-results-section">
        <div class="results-heading"><div><span class="section-tag">YOUR MATCHES</span><h2>Matching donors</h2><p class="muted">People who match your blood group request.</p></div><span class="results-count">${data.length} ${data.length === 1 ? 'donor' : 'donors'} found</span></div>
        <div class="donor-search-grid">
          ${data.map((donor, index) => `
            <article class="donor-search-card donor-search-tone-${index % 4}">
              <div class="donor-search-top"><div class="donor-avatar">${esc((donor.donor_name || 'D').trim().charAt(0).toUpperCase())}</div><span class="match-chip">✓ Compatible match</span></div>
              <h3>${esc(donor.donor_name || 'BloodDrop Donor')}</h3>
              <div class="donor-search-location"><span>📍</span>${esc(donor.donor_location || 'Location not provided')}</div>
              <div class="donor-search-divider"></div>
              <div class="donor-search-bottom"><span class="private-note">🔒 Contact privately</span>
                <button type="button" class="btn primary donor-request-btn" data-send-request="${esc(donor.donor_id)}" data-blood-group="${esc(bloodGroup)}" data-donor-name="${esc(donor.donor_name || '')}" data-donor-location="${esc(donor.donor_location || '')}">Send request <span aria-hidden="true">→</span></button>
              </div>
            </article>
          `).join('')}
        </div>
      </section>`;
    bindPage();
  } catch (error) {
    console.error('Donor search error:', error);
    results.innerHTML = `<div class="panel search-error"><h3>Unable to search donors</h3><p>${esc(error.message)}</p></div>`;
  }
}

async function sendDonorRequest(
  donorId,
  bloodGroup,
  donorName = '',
  donorLocation = ''
) {
  if (!session || !myProfile) {
    return toast('Please login first.');
  }

  if (!groups.includes(bloodGroup)) {
    return toast('Blood group is missing. Please search again.');
  }

  const patientName = prompt('Enter patient name:');

  if (!patientName?.trim()) return;

  const unitsText = prompt(
    'How many blood units are needed?',
    '1'
  );

  if (unitsText === null) return;

  const units = Number(unitsText);

  if (
    !Number.isInteger(units) ||
    units < 1 ||
    units > 20
  ) {
    return toast('Enter a valid number of units (1–20).');
  }

  const now = new Date();

  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  const neededDate = prompt(
    'Required date (YYYY-MM-DD):',
    today
  );

  if (!neededDate) return;

  const location = prompt(
    'Enter hospital or blood requirement location:',
    donorLocation || ''
  );

  if (!location?.trim()) {
    return toast('Hospital/location is required.');
  }

  const contactPhone = prompt(
    'Enter your contact phone number:',
    myProfile.phone || ''
  );

  if (!contactPhone?.trim()) return;

  const details = prompt(
    'Additional details (optional):',
    ''
  );

  try {
    const { data, error } = await db.rpc(
      'send_lifedrop_donor_request_v2',
      {
        p_donor_id: donorId,
        p_patient_name: patientName.trim(),
        p_blood_group: bloodGroup,
        p_units: units,
        p_needed_date: neededDate,
        p_location: location.trim(),
        p_contact_phone: contactPhone.trim(),
        p_details: details?.trim() || null
      }
    );

    if (error) throw error;

    if (data?.success) {
      toast(
        `Request sent to ${donorName || 'selected donor'}.`
      );

      page = 'Dashboard';
      renderNav();
      await renderPage();

    } else {
      toast('Request could not be sent.');
    }

  } catch (error) {
    showError(error, 'Send request error');
  }
}

/* -------------------- MY REQUESTS -------------------- */

async function myRequests() {
  const {
    data: requests,
    error
  } = await db
    .from('blood_requests')
    .select('*')
    .eq('requester_id', session.user.id)
    .order('created_at', {
      ascending: false
    });

  if (error) throw error;

  if (!requests?.length) {
    return `
      <div class="panel">
        <h2>My Blood Requests</h2>
        <p>You have not submitted any blood requests yet.</p>
      </div>
    `;
  }

  const cards = [];

  for (const request of requests) {
    const {
      data: matches,
      error: matchError
    } = await db
      .from('matches')
      .select('status')
      .eq('request_id', request.id);

    if (matchError) throw matchError;

    const status = matches?.length
      ? matches.map(match =>
          String(match.status || 'pending').toUpperCase()
        ).join(', ')
      : 'PENDING';

    cards.push(`
      <div class="panel" style="margin-top:12px">

        <h3>
          ${esc(request.patient_name || 'Patient')}
        </h3>

        <p>
          <b>Blood Group:</b>
          ${esc(request.blood_group || '')}
        </p>

        <p>
          <b>Units:</b>
          ${esc(request.units ?? '')}
        </p>

        <p>
          <b>Needed Date:</b>
          ${esc(request.needed_date || '')}
        </p>

        <p>
          <b>Location:</b>
          ${esc(request.location || '')}
        </p>

        <p>
          <b>Status:</b>
          ${esc(status)}
        </p>

      </div>
    `);
  }

  return `
    <div class="panel">
      <h2>My Blood Requests</h2>
    </div>
    ${cards.join('')}
  `;
}

/* -------------------- ADMIN REQUESTS & MATCHES -------------------- */

async function adminRequests() {
  if (me?.role !== 'admin') {
    return `
      <div class="panel">
        <p>Admin access required.</p>
      </div>
    `;
  }

  const {
    data: matches,
    error
  } = await db
    .from('matches')
    .select('*')
    .order('created_at', {
      ascending: false
    });

  if (error) throw error;

  if (!matches?.length) {
    return `
      <div class="panel">
        <h2>Requests & Matches</h2>
        <p>No donor requests found.</p>
      </div>
    `;
  }

  const cards = [];

  for (const match of matches) {
    const {
      data: request,
      error: requestError
    } = await db
      .from('blood_requests')
      .select('*')
      .eq('id', match.request_id)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!request) continue;

    const [
      donorResult,
      requesterResult
    ] = await Promise.all([

      db
        .from('profiles')
        .select('full_name, blood_group, location')
        .eq('id', match.donor_id)
        .maybeSingle(),

      db
        .from('profiles')
        .select('full_name')
        .eq('id', match.requester_id)
        .maybeSingle()

    ]);

    if (donorResult.error) throw donorResult.error;
    if (requesterResult.error) throw requesterResult.error;

    const donor = donorResult.data;
    const requester = requesterResult.data;
    const status = match.status || 'candidate';

    cards.push(`
      <div class="panel" style="margin-top:14px">

        <h3>
          ${esc(request.patient_name || 'Patient')}
        </h3>

        <p>
          <b>Required Blood:</b>
          ${esc(request.blood_group || '')}
        </p>

        <p>
          <b>Units:</b>
          ${esc(request.units ?? '')}
        </p>

        <p>
          <b>Needed Date:</b>
          ${esc(request.needed_date || '')}
        </p>

        <p>
          <b>Hospital:</b>
          ${esc(request.location || '')}
        </p>

        <hr>

        <p>
          <b>Requester:</b>
          ${esc(requester?.full_name || 'User')}
        </p>

        <p>
          <b>Donor:</b>
          ${esc(donor?.full_name || 'Donor')}
        </p>

        <p>
          <b>Donor Blood Group:</b>
          ${esc(donor?.blood_group || '')}
        </p>

        <p>
          <b>Donor Location:</b>
          ${esc(donor?.location || '')}
        </p>

        <p>
          <b>Status:</b>
          ${esc(status.toUpperCase())}
        </p>

        ${status === 'candidate' || status === 'pending_donor'
          ? '<p>Waiting for the donor to confirm or decline this request.</p>'
          : status === 'connected'
            ? '<p>Donor and requester are connected. Both can manage completion or cancellation.</p>'
            : status === 'cancelled'
              ? `<p>Cancelled. Reason: ${esc(match.cancel_reason || 'Not provided')}</p>`
              : '<p>Donation completed.</p>'
        }

      </div>
    `);
  }

  return `
    <div class="panel">
      <h2>Requests & Matches</h2>
    </div>

    ${cards.join('')}
  `;
}

/* -------------------- ADMIN CONNECT MATCH -------------------- */

async function adminConnectMatch(matchId) {
  if (me?.role !== 'admin') {
    return toast('Only admin can connect matches.');
  }

  if (!confirm('Connect this donor and requester?')) return;

  try {
    const { error } = await db.rpc(
      'admin_connect_match',
      {
        p_match_id: matchId
      }
    );

    if (error) throw error;

    toast('Donor connected. Notifications have been sent.');

    await renderPage();

  } catch (error) {
    showError(error, 'Admin connect error');
  }
}

/* -------------------- CONNECTED PROFILES -------------------- */

async function connectedProfiles() {
  const {
    data: matches,
    error
  } = await db
    .from('matches')
    .select('*')
    .eq('status', 'connected')
    .order('connected_at', {
      ascending: false
    });

  if (error) throw error;

  const mine = (matches || []).filter(match =>
    match.requester_id === session.user.id ||
    match.donor_id === session.user.id
  );

  if (!mine.length) {
    return `
      <div class="panel">
        <h2>Connected Profiles</h2>
        <p>No connected profiles yet.</p>
      </div>
    `;
  }

  const cards = [];

  for (const match of mine) {
    const otherId =
      match.requester_id === session.user.id
        ? match.donor_id
        : match.requester_id;

    const {
      data: profile,
      error: profileError
    } = await db
      .from('profiles')
      .select('*')
      .eq('id', otherId)
      .maybeSingle();

    if (profileError) throw profileError;

    const {
      data: request,
      error: requestError
    } = await db
      .from('blood_requests')
      .select('patient_name, blood_group, location')
      .eq('id', match.request_id)
      .maybeSingle();

    if (requestError) throw requestError;

    if (!profile) {
      cards.push(`
        <div class="panel">
          <p>Connected profile is not available.</p>
        </div>
      `);
      continue;
    }

    cards.push(`
      <div class="panel" style="margin-top:14px">

        <h3>
          ${esc(profile.full_name || 'Connected User')}
        </h3>

        <p>
          <b>Blood Group:</b>
          ${esc(profile.blood_group || 'Not provided')}
        </p>

        <p>
          <b>Location:</b>
          ${esc(profile.location || 'Not provided')}
        </p>

        <p>
          <b>Phone:</b>
          ${esc(profile.phone || 'Not provided')}
        </p>

        <p>
          <b>Email:</b>
          ${esc(profile.email || 'Not provided')}
        </p>

        <hr>

        <p>
          <b>Patient:</b>
          ${esc(request?.patient_name || '')}
        </p>

        <p>
          <b>Required Blood:</b>
          ${esc(request?.blood_group || '')}
        </p>

        <p>
          <b>Hospital:</b>
          ${esc(request?.location || '')}
        </p>

        <button
          class="btn primary"
          type="button"
          data-complete-match="${esc(match.id)}">
          Mark Donation Complete
        </button>

      </div>
    `);
  }

  return `
    <div class="panel">
      <h2>Connected Profiles</h2>
    </div>

    ${cards.join('')}
  `;
}

/* -------------------- COMPLETE DONATION -------------------- */

async function completeMatch(matchId) {
  if (!confirm(
    'Confirm that this blood donation has been completed?'
  )) return;

  try {
    const { error } = await db.rpc(
      'complete_lifedrop_match',
      {
        p_match_id: matchId
      }
    );

    if (error) throw error;

    toast(
      'Donation marked complete successfully!'
    );

    // Refresh dashboard after successful completion.
    page = 'Dashboard';

    renderNav();

    await renderPage();

  } catch (error) {
    showError(error, 'Complete donation error');
  }
}

/* -------------------- NOTIFICATIONS -------------------- */

async function notificationsPage() {
  const {
    data,
    error
  } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', {
      ascending: false
    });

  if (error) throw error;

  if (!data?.length) {
    return `
      <div class="panel">
        <h2>Notifications</h2>
        <p>No notifications yet.</p>
      </div>
    `;
  }

  const unread = data.filter(
    item => item.is_read !== true
  ).length;

  return `
    <div class="panel">

      <h2>Notifications</h2>

      <p class="muted">
        ${unread} unread notification(s)
      </p>

    </div>

    ${data.map(item => `
      <div class="panel" style="margin-top:12px">

        <h3>
          ${esc(item.title || 'BloodDrop Notification')}

          <span class="pill">
            ${item.is_read === true ? 'Read' : 'Unread'}
          </span>
        </h3>

        <p>
          ${esc(item.message || '')}
        </p>

        <small>
          ${esc(
            item.created_at
              ? new Date(item.created_at).toLocaleString()
              : ''
          )}
        </small>

        <div class="actions" style="margin-top:12px">

          <button
            class="btn primary"
            type="button"
            data-mark-read="${esc(item.id)}"
            ${item.is_read === true ? 'disabled' : ''}>
            ${item.is_read === true ? 'Already Read' : 'Mark as Read'}
          </button>

          <button
            class="btn danger"
            type="button"
            data-delete-notification="${esc(item.id)}">
            Delete
          </button>

        </div>

      </div>
    `).join('')}
  `;
}

/* -------------------- PROFILE PHOTO -------------------- */

async function photoUrl(path) {
  if (!path) return '';

  const {
    data,
    error
  } = await db.storage
    .from('profile-photos')
    .createSignedUrl(path, 900);

  if (error) {
    console.warn('Profile photo URL error:', error);
    return '';
  }

  return data.signedUrl;
}

/* -------------------- MY PROFILE -------------------- */

async function profilePage() {
  const {
    data: profile,
    error
  } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    throw new Error('Profile not found.');
  }

  me = profile;
  myProfile = profile;

  const photo = await photoUrl(profile.photo_path);

  const today = new Date().toISOString().slice(0, 10);

  return `
    <div class="panel">

      <h2>My Profile</h2>

      <div class="profile">

        <div class="avatar">

          ${photo
            ? `<img src="${esc(photo)}" alt="Profile photo">`
            : esc(initials(profile.full_name))
          }

        </div>

        <div>

          <b>
            ${esc(profile.full_name || 'Your Name')}
          </b>

          <p class="muted">
            ${esc(session.user.email || '')}
            •
            ${esc(profile.role || 'user')}
          </p>

        </div>

      </div>

      <form id="profile-form" class="form-grid">

        <label>
          Full Name

          <input
            name="full_name"
            value="${esc(profile.full_name || '')}"
            required>
        </label>

        <label>
          Phone Number

          <input
            name="phone"
            type="tel"
            value="${esc(profile.phone || '')}"
            placeholder="01XXXXXXXXX">
        </label>

        <label>
          Blood Group

          <select name="blood_group">
            ${groupOptions(profile.blood_group || '')}
          </select>
        </label>

        <label>
          Last Donation Date

          <input
            name="last_donation_date"
            type="date"
            max="${today}"
            value="${esc(profile.last_donation_date || '')}">
        </label>

        <label class="wide">
          Address / Location

          <input
            name="location"
            value="${esc(profile.location || '')}"
            placeholder="Area, city, district">
        </label>

        <label class="wide">
          Medical Condition

          <textarea
            name="medical_condition"
            rows="3"
            placeholder="Mention any relevant medical condition (optional)">${esc(profile.medical_condition || '')}</textarea>
        </label>

        <label class="wide">
          Profile Photo (JPG, PNG or WebP; max 3 MB)

          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp">
        </label>

        <div class="wide">

          <button
            type="submit"
            class="btn primary">
            Save Profile
          </button>

        </div>

      </form>

      <p class="note">
        Please provide accurate health information.
        Medical eligibility to donate must be confirmed
        by a qualified healthcare professional.
      </p>

    </div>
  `;
}

/* -------------------- ADMIN DONORS -------------------- */

async function adminDonors() {
  if (me?.role !== 'admin') {
    return `
      <div class="panel">
        <p>Admin access required.</p>
      </div>
    `;
  }

  const {
    data,
    error
  } = await db
    .from('profiles')
    .select('*')
    .eq('role', 'donor')
    .order('created_at', {
      ascending: false
    });

  if (error) throw error;

  if (!data?.length) {
    return `
      <div class="panel">
        <h2>Donor Management</h2>
        <p>No donors registered.</p>
      </div>
    `;
  }

  return `
    <div class="panel">
      <h2>Donor Management</h2>
    </div>

    ${data.map(donor => `
      <div class="panel" style="margin-top:12px">

        <h3>
          ${esc(donor.full_name || 'Donor')}
        </h3>

        <p>
          <b>Blood Group:</b>
          ${esc(donor.blood_group || '')}
        </p>

        <p>
          <b>Location:</b>
          ${esc(donor.location || '')}
        </p>

        <p>
          <b>Phone:</b>
          ${esc(donor.phone || 'Not provided')}
        </p>

        <p>
          <b>Last Donation:</b>
          ${esc(donor.last_donation_date || 'Not provided')}
        </p>

      </div>
    `).join('')}
  `;
}

/* -------------------- MY DONATIONS -------------------- */

async function myDonations() {
  const {
    data,
    error
  } = await db
    .from('donations')
    .select('*')
    .eq('donor_id', session.user.id)
    .order('created_at', {
      ascending: false
    });

  if (error) throw error;

  if (!data?.length) {
    return `
      <div class="panel">
        <h2>My Donations</h2>
        <p>No donation history found.</p>
      </div>
    `;
  }

  return `
    <div class="panel">
      <h2>My Donations</h2>
    </div>

    ${data.map(item => `
      <div class="panel" style="margin-top:12px">

        <p>
          <b>Units:</b>
          ${esc(item.units ?? 'Not provided')}
        </p>

        <p>
          <b>Donation Date:</b>
          ${esc(item.donation_date || item.created_at || '')}
        </p>

        <p>
          <b>Status:</b>
          ${esc(item.status || 'Completed')}
        </p>

      </div>
    `).join('')}
  `;
}

/* -------------------- APP START -------------------- */

async function init() {
  if (appStarted) return;

  appStarted = true;

  if (!ready) {
    if ($('auth-view')) {
      $('auth-view').classList.add('hidden');
    }

    if ($('config-view')) {
      $('config-view').classList.remove('hidden');
    }

    return;
  }

  try {
    await boot();

    db.auth.onAuthStateChange(
      (_event, currentSession) => {
        session = currentSession;

        window.setTimeout(() => {
          if (currentSession) {
            boot().catch(error => {
              showError(error, 'Auth state error');
            });
          } else {
            me = null;
            myProfile = null;
            showAuth();
          }
        }, 0);
      }
    );

  } catch (error) {
    showError(error, 'Initialization error');
    showAuth();
  }
}

/* -------------------- EVENT LISTENERS -------------------- */

function setupEventListeners() {

  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => {
      authMode(button.dataset.tab);
    });
  });

  if ($('login-form')) {
    $('login-form').addEventListener(
      'submit',
      loginSubmit
    );
  }

  if ($('signup-form')) {
    $('signup-form').addEventListener(
      'submit',
      signupSubmit
    );
  }

  if ($('logout-btn')) {
    $('logout-btn').addEventListener('click', () => {
      logout().catch(error => {
        showError(error, 'Logout error');
      });
    });
  }

  if ($('nav')) {
    $('nav').addEventListener('click', async event => {
      const button = event.target.closest('[data-page]');

      if (!button) return;

      page = button.dataset.page;

      renderNav();

      await renderPage();
    });
  }

  init();
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    setupEventListeners,
    { once: true }
  );
} else {
  setupEventListeners();
}

/* -------------------- GLOBAL COMPATIBILITY -------------------- */

var notifications = notificationsPage;

window.notifications = notificationsPage;
