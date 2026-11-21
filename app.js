/* =========================================================
   LIFEDROP - COMPLETE APP.JS
   HTML + CSS + JavaScript + Supabase
   Replace the entire old app.js with this file.
========================================================= */

'use strict';

/* -------------------- CONFIGURATION -------------------- */

const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const SUPABASE_URL = window.LIFEDROP_SUPABASE_URL || '';
const SUPABASE_KEY = window.LIFEDROP_SUPABASE_ANON_KEY || '';

const ready = !!(
  window.supabase &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_KEY
);

const db = ready
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

let session = null;
let me = null;
let myProfile = null;
let page = 'Dashboard';
let appStarted = false;

const $ = id => document.getElementById(id);

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

function showError(error, context = 'LifeDrop') {
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

/* -------------------- AUTHENTICATION -------------------- */

function authMode(mode) {
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === mode);
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
  if ($('header-user')) $('header-user').textContent = '';
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
    throw new Error('Supabase is not configured. Check config.js.');
  }

  const { data: sessionData, error: sessionError } =
    await db.auth.getSession();

  if (sessionError) throw sessionError;

  session = sessionData.session;

  if (!session) {
    me = null;
    myProfile = null;
    showAuth();
    return;
  }

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (profileError) throw profileError;

  if (!profile) {
    throw new Error('Your profile was not found. Please contact the admin.');
  }

  me = profile;
  myProfile = profile;
  showApp();
}

async function loginSubmit(event) {
  event.preventDefault();

  if (!db) {
    toast('Check your Supabase config.js file.');
    return;
  }

  const form = new FormData(event.currentTarget);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');

  try {
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await boot();
  } catch (error) {
    showError(error, 'Login error');
  }
}

async function signupSubmit(event) {
  event.preventDefault();

  if (!db) {
    toast('Check your Supabase config.js file.');
    return;
  }

  const form = new FormData(event.currentTarget);
  const email = String(form.get('email') || '').trim();
  const password = String(form.get('password') || '');
  const fullName = String(form.get('name') || '').trim();
  const role = String(form.get('role') || 'user');

  try {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      await boot();
    } else {
      toast('Account created. Please confirm your email, then log in.');
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
  if ($('config-view')) $('config-view').classList.add('hidden');
  if ($('auth-view')) $('auth-view').classList.add('hidden');
  if ($('app-view')) $('app-view').classList.remove('hidden');

  if ($('header-user')) {
    $('header-user').textContent =
      `${me?.full_name || 'User'} • ${(me?.role || 'user').toUpperCase()}`;
  }

  if ($('welcome-title')) {
    $('welcome-title').textContent =
      `Hello, ${(me?.full_name || 'User').split(' ')[0]}`;
  }

  if (!pages().includes(page)) page = 'Dashboard';

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
    const pageFunction = pageFunctions[page] || dashboard;
    const html = await pageFunction();

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

function bindPage() {
  const searchForm = $('blood-search-form');

  if (searchForm) {
    searchForm.onsubmit = async event => {
      event.preventDefault();

      const form = new FormData(searchForm);
      const bloodGroup = String(form.get('blood_group') || '');
      const location = String(form.get('location') || '');

      if (!groups.includes(bloodGroup)) {
        toast('Please select a valid blood group.');
        return;
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
      await adminConnectMatch(button.dataset.adminConnect);
    };
  });

  document.querySelectorAll('[data-admin-view-profile]').forEach(button => {
    button.onclick = async () => {
      await adminViewProfile(button.dataset.adminViewProfile);
    };
  });

  document.querySelectorAll('[data-admin-edit-profile]').forEach(button => {
    button.onclick = async () => {
      await adminEditProfile(button.dataset.adminEditProfile);
    };
  });

  document.querySelectorAll('[data-complete-match]').forEach(button => {
    button.onclick = async () => {
      await completeMatch(button.dataset.completeMatch);
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

          if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('Use JPG, PNG or WebP photo.');
          }

          const extension = file.type === 'image/png'
            ? 'png'
            : file.type === 'image/webp' ? 'webp' : 'jpg';

          const path = `${me.id}/profile.${extension}`;

          const { error: uploadError } = await db.storage
            .from('profile-photos')
            .upload(path, file, { upsert: true, contentType: file.type });

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

        const { data, error } = await db.from('profiles')
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

/* -------------------- COMMON HELPERS -------------------- */

async function countRows(table, filters = []) {
  let query = db.from(table).select('id', { count: 'exact', head: true });

  for (const filter of filters) {
    query = query[filter.method](...filter.args);
  }

  const { count, error } = await query;
  if (error) throw error;

  return count || 0;
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

/* -------------------- DASHBOARD -------------------- */

async function dashboard() {
  const [donors, requests, connected, unread] = await Promise.all([
    countRows('profiles', [
      { method: 'eq', args: ['role', 'donor'] }
    ]),
    countRows('blood_requests'),
    countRows('matches', [
      { method: 'eq', args: ['status', 'connected'] }
    ]),
    countRows('notifications', [
      { method: 'eq', args: ['user_id', session.user.id] },
      { method: 'eq', args: ['is_read', false] }
    ])
  ]);

  return `
    <div class="stats">
      <div class="stat-card"><span>Registered Donors</span><b>${donors}</b></div>
      <div class="stat-card"><span>Blood Requests</span><b>${requests}</b></div>
      <div class="stat-card"><span>Connected Matches</span><b>${connected}</b></div>
      <div class="stat-card"><span>Unread Notifications</span><b>${unread}</b></div>
    </div>

    <div class="panel">
      <h2>Welcome to LifeDrop</h2>
      <p class="muted">Give blood. Give life. Find compatible blood donors easily.</p>
      <div class="actions">
        ${
          me.role === 'admin'
            ? `<button class="btn primary" data-goto="Requests & Matches">Manage Requests</button>`
            : `<button class="btn primary" data-goto="Search Blood">Search Blood</button>`
        }
        <button class="btn outline" data-goto="My Profile">My Profile</button>
      </div>
    </div>

    <div class="note">
      Blood compatibility and donor eligibility must be confirmed by qualified medical professionals.
    </div>
  `;
}

/* -------------------- SEARCH BLOOD -------------------- */

async function searchBlood() {
  if (me.role === 'admin') {
    return `
      <div class="panel">
        <h2>Search Blood</h2>
        <p>Use Requests & Matches to manage donor requests.</p>
      </div>
    `;
  }

  return `
    <div class="panel">
      <h2>Search Blood Donors</h2>
      <p class="muted">Select required blood group. Location is optional.</p>

      <form id="blood-search-form" class="form-grid">
        <label>
          Required Blood Group
          <select name="blood_group" required>
            ${groupOptions()}
          </select>
        </label>

        <label>
          Location (Optional)
          <input name="location" type="text" placeholder="Enter area or city">
        </label>

        <div class="wide">
          <button type="submit" class="btn primary">Search Donors</button>
        </div>
      </form>
    </div>

    <div id="donor-search-results"></div>
  `;
}

async function runDonorSearch(bloodGroup, location = '') {
  const results = $('donor-search-results');
  if (!results) return;

  results.innerHTML = '<div class="panel">Searching compatible donors...</div>';

  try {
    const { data, error } = await db.rpc('search_lifedrop_donors', {
      p_blood_group: bloodGroup,
      p_location: location.trim() || null
    });

    if (error) throw error;

    if (!data?.length) {
      results.innerHTML = `
        <div class="panel empty">
          No eligible matching donors found. Try another location or blood group.
        </div>
      `;
      return;
    }

    results.innerHTML = `
      <div class="panel">
        <h2>Matching Donors</h2>
        <p class="muted">${data.length} compatible donor(s) found.</p>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Donor Name</th>
                <th>Address / Location</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(donor => `
                <tr>
                  <td>${esc(donor.donor_name)}</td>
                  <td>${esc(donor.donor_location || 'Not provided')}</td>
                  <td>
                    <button
                      type="button"
                      class="btn primary"
                      data-send-request="${esc(donor.donor_id)}"
                      data-blood-group="${esc(bloodGroup)}"
                      data-donor-name="${esc(donor.donor_name)}"
                      data-donor-location="${esc(donor.donor_location || '')}">
                      Send Request
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    bindPage();
  } catch (error) {
    console.error('Donor search error:', error);
    results.innerHTML = `<div class="panel"><p>${esc(error.message)}</p></div>`;
  }
}

/* -------------------- SEND REQUEST -------------------- */

async function sendDonorRequest(donorId, bloodGroup, donorName = '', donorLocation = '') {
  if (!session || !myProfile) {
    toast('Please login first.');
    return;
  }

  if (!groups.includes(bloodGroup)) {
    toast('Blood group is missing. Please search again.');
    return;
  }

  const patientName = prompt('Enter patient name:');
  if (!patientName?.trim()) return;

  const unitsText = prompt('How many blood units are needed?', '1');
  if (unitsText === null) return;

  const units = Number(unitsText);
  if (!Number.isInteger(units) || units < 1 || units > 20) {
    toast('Enter a valid number of units (1–20).');
    return;
  }

  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('-');

  const neededDate = prompt('Required date (YYYY-MM-DD):', today);
  if (!neededDate) return;

  const location = prompt(
    'Enter hospital or blood requirement location:',
    donorLocation || ''
  );
  if (!location?.trim()) {
    toast('Hospital/location is required.');
    return;
  }

  const savedPhone = myProfile.contact_phone || myProfile.phone || '';
  const contactPhone = prompt('Enter your contact phone number:', savedPhone);
  if (!contactPhone?.trim()) return;

  const details = prompt('Additional details (optional):', '');

  try {
    const { data, error } = await db.rpc('send_lifedrop_donor_request', {
      p_donor_id: donorId,
      p_patient_name: patientName.trim(),
      p_blood_group: bloodGroup,
      p_units: units,
      p_needed_date: neededDate,
      p_location: location.trim(),
      p_contact_phone: contactPhone.trim(),
      p_details: details?.trim() || null
    });

    if (error) throw error;

    if (data?.success) {
      toast(`Request sent to ${donorName || 'selected donor'}.`);
      page = 'My Requests';
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
  const { data: requests, error } = await db
    .from('blood_requests')
    .select('*')
    .eq('requester_id', session.user.id)
    .order('created_at', { ascending: false });

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
    const { data: matches, error: matchError } = await db
      .from('matches')
      .select('status')
      .eq('request_id', request.id);

    if (matchError) throw matchError;

    const status = matches?.length
      ? matches.map(match => String(match.status || 'pending').toUpperCase()).join(', ')
      : 'PENDING';

    cards.push(`
      <div class="panel" style="margin-top:12px">
        <h3>${esc(request.patient_name || 'Patient')}</h3>
        <p><b>Blood Group:</b> ${esc(request.blood_group || '')}</p>
        <p><b>Units:</b> ${esc(request.units ?? '')}</p>
        <p><b>Needed Date:</b> ${esc(request.needed_date || '')}</p>
        <p><b>Location:</b> ${esc(request.location || '')}</p>
        <p><b>Status:</b> ${esc(status)}</p>
      </div>
    `);
  }

  return `<div class="panel"><h2>My Blood Requests</h2></div>${cards.join('')}`;
}

/* -------------------- ADMIN REQUESTS & MATCHES -------------------- */

async function adminRequests() {
  if (me?.role !== 'admin') {
    return '<div class="panel"><p>Admin access required.</p></div>';
  }

  const { data: matches, error } = await db
    .from('matches')
    .select('*')
    .order('created_at', { ascending: false });

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
    const { data: request, error: requestError } = await db
      .from('blood_requests')
      .select('*')
      .eq('id', match.request_id)
      .maybeSingle();

    if (requestError) throw requestError;
    if (!request) continue;

    const [donorResult, requesterResult] = await Promise.all([
      db.from('profiles')
        .select('full_name, blood_group, location')
        .eq('id', match.donor_id)
        .maybeSingle(),
      db.from('profiles')
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
        <h3>${esc(request.patient_name || 'Patient')}</h3>
        <p><b>Required Blood:</b> ${esc(request.blood_group || '')}</p>
        <p><b>Units:</b> ${esc(request.units ?? '')}</p>
        <p><b>Needed Date:</b> ${esc(request.needed_date || '')}</p>
        <p><b>Hospital:</b> ${esc(request.location || '')}</p>
        <hr>
        <p><b>Requester:</b> ${esc(requester?.full_name || 'User')}</p>
        <p><b>Donor:</b> ${esc(donor?.full_name || 'Donor')}</p>
        <p><b>Donor Blood Group:</b> ${esc(donor?.blood_group || '')}</p>
        <p><b>Donor Location:</b> ${esc(donor?.location || '')}</p>
        <p><b>Status:</b> ${esc(status.toUpperCase())}</p>

        ${
          status === 'candidate'
            ? `<button class="btn primary" type="button"
                 data-admin-connect="${esc(match.id)}">
                 Connect Donor
               </button>`
            : status === 'connected'
              ? '<p>Donor and requester are connected.</p>'
              : '<p>Donation completed.</p>'
        }
      </div>
    `);
  }

  return `<div class="panel"><h2>Requests & Matches</h2></div>${cards.join('')}`;
}

async function adminConnectMatch(matchId) {
  if (me?.role !== 'admin') {
    toast('Only admin can connect matches.');
    return;
  }

  if (!confirm('Connect this donor and requester?')) return;

  try {
    const { error } = await db.rpc('admin_connect_match', {
      p_match_id: matchId
    });

    if (error) throw error;

    toast('Donor connected. Notifications have been sent.');
    await renderPage();
  } catch (error) {
    showError(error, 'Admin connect error');
  }
}

/* -------------------- CONNECTED PROFILES -------------------- */

async function connectedProfiles() {
  const { data: matches, error } = await db
    .from('matches')
    .select('*')
    .eq('status', 'connected')
    .order('connected_at', { ascending: false });

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
    const otherId = match.requester_id === session.user.id
      ? match.donor_id
      : match.requester_id;

    const { data: profile, error: profileError } = await db
      .from('profiles')
      .select('*')
      .eq('id', otherId)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: request, error: requestError } = await db
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
        <h3>${esc(profile.full_name || 'Connected User')}</h3>
        <p><b>Blood Group:</b> ${esc(profile.blood_group || 'Not provided')}</p>
        <p><b>Location:</b> ${esc(profile.location || 'Not provided')}</p>
        <p><b>Phone:</b> ${esc(profile.contact_phone || profile.phone || 'Not provided')}</p>
        <p><b>Email:</b> ${esc(profile.email || 'Not provided')}</p>
        <hr>
        <p><b>Patient:</b> ${esc(request?.patient_name || '')}</p>
        <p><b>Required Blood:</b> ${esc(request?.blood_group || '')}</p>
        <p><b>Hospital:</b> ${esc(request?.location || '')}</p>
        <button class="btn primary" type="button"
          data-complete-match="${esc(match.id)}">
          Mark Donation Complete
        </button>
      </div>
    `);
  }

  return `<div class="panel"><h2>Connected Profiles</h2></div>${cards.join('')}`;
}

async function completeMatch(matchId) {
  if (!confirm('Confirm that this blood donation has been completed?')) return;

  try {
    const { error } = await db.rpc('complete_lifedrop_match', {
      p_match_id: matchId
    });

    if (error) throw error;

    toast('Donation marked complete. Private profile access is now closed.');
    await renderPage();
  } catch (error) {
    showError(error, 'Complete donation error');
  }
}

/* -------------------- NOTIFICATIONS -------------------- */

async function notificationsPage() {
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data?.length) {
    return `
      <div class="panel">
        <h2>Notifications</h2>
        <p>No notifications yet.</p>
      </div>
    `;
  }

  return `
    <div class="panel"><h2>Notifications</h2></div>
    ${data.map(item => `
      <div class="panel" style="margin-top:12px">
        <h3>${esc(item.title || 'LifeDrop Notification')}</h3>
        <p>${esc(item.message || '')}</p>
        <small>${esc(item.created_at ? new Date(item.created_at).toLocaleString() : '')}</small>
      </div>
    `).join('')}
  `;
}

/* -------------------- MY PROFILE -------------------- */

/* -------------------- MY PROFILE -------------------- */

async function photoUrl(path) {
  if (!path) return '';
  const { data, error } = await db.storage
    .from('profile-photos')
    .createSignedUrl(path, 900);

  if (error) {
    console.warn('Profile photo URL error:', error);
    return '';
  }
  return data.signedUrl;
}

async function profilePage() {
  const { data: profile, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;
  if (!profile) throw new Error('Profile not found.');

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
            : esc(initials(profile.full_name))}
        </div>
        <div>
          <b>${esc(profile.full_name || 'Your Name')}</b>
          <p class="muted">${esc(session.user.email || '')} • ${esc(profile.role || 'user')}</p>
        </div>
      </div>

      <form id="profile-form" class="form-grid">
        <label>
          Full Name
          <input name="full_name" value="${esc(profile.full_name || '')}" required>
        </label>

        <label>
          Phone Number
          <input name="phone" type="tel" value="${esc(profile.phone || profile.contact_phone || '')}" placeholder="01XXXXXXXXX">
        </label>

        <label>
          Blood Group
          <select name="blood_group">
            ${groupOptions(profile.blood_group || '')}
          </select>
        </label>

        <label>
          Last Donation Date
          <input name="last_donation_date" type="date" max="${today}" value="${esc(profile.last_donation_date || '')}">
        </label>

        <label class="wide">
          Address / Location
          <input name="location" value="${esc(profile.location || '')}" placeholder="Area, city, district">
        </label>

        <label class="wide">
          Medical Condition
          <textarea name="medical_condition" rows="3" placeholder="Mention any relevant medical condition (optional)">${esc(profile.medical_condition || '')}</textarea>
        </label>

        <label class="wide">
          Profile Photo (JPG, PNG or WebP; max 3 MB)
          <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
        </label>

        <div class="wide">
          <button type="submit" class="btn primary">Save Profile</button>
        </div>
      </form>

      <p class="note">Please provide accurate health information. Medical eligibility to donate must be confirmed by a qualified healthcare professional.</p>
    </div>
  `;
}

/* -------------------- ADMIN DONORS -------------------- */

async function adminDonors() {
  if (me?.role !== 'admin') {
    return '<div class="panel"><p>Admin access required.</p></div>';
  }

  // The profiles table uses phone, not contact_phone.
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .in('role', ['donor', 'user'])
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data?.length) {
    return `
      <div class="panel">
        <h2>Donors & Users Management</h2>
        <p>No donor or regular user accounts found.</p>
      </div>
    `;
  }

  const donors = data.filter(profile => profile.role === 'donor');
  const users = data.filter(profile => profile.role === 'user');

  return `
    <div class="panel">
      <h2>Donors & Users Management</h2>
      <p class="muted">Admin can view and edit donor and regular user profiles.</p>
      <div class="stats">
        <div class="stat-card"><span>Donor Accounts</span><b>${donors.length}</b></div>
        <div class="stat-card"><span>Regular User Accounts</span><b>${users.length}</b></div>
        <div class="stat-card"><span>Total Accounts</span><b>${data.length}</b></div>
      </div>
    </div>
    ${data.map(profile => `
      <div class="panel" style="margin-top:12px">
        <h3>${esc(profile.full_name || 'Unnamed Account')}</h3>
        <p><b>Account Type:</b> ${esc((profile.role || 'user').toUpperCase())}</p>
        <p><b>Blood Group:</b> ${esc(profile.blood_group || 'Not provided')}</p>
        <p><b>Location:</b> ${esc(profile.location || 'Not provided')}</p>
        <p><b>Phone:</b> ${esc(profile.phone || 'Not provided')}</p>
        <p><b>Last Donation:</b> ${esc(profile.last_donation_date || 'Not provided')}</p>
        <div class="actions">
          <button class="btn outline" type="button"
            data-admin-view-profile="${esc(profile.id)}">View Profile</button>
          <button class="btn primary" type="button"
            data-admin-edit-profile="${esc(profile.id)}">Edit Profile</button>
        </div>
      </div>
    `).join('')}
  `;
}

async function adminViewProfile(profileId) {
  if (me?.role !== 'admin') {
    toast('Admin access required.');
    return;
  }

  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();

    if (error) throw error;
    if (!profile) throw new Error('Profile not found or access denied.');

    alert([
      `Name: ${profile.full_name || 'Not provided'}`,
      `Account Type: ${profile.role || 'user'}`,
      `Phone: ${profile.phone || 'Not provided'}`,
      `Blood Group: ${profile.blood_group || 'Not provided'}`,
      `Location: ${profile.location || 'Not provided'}`,
      `Last Donation: ${profile.last_donation_date || 'Not provided'}`,
      `Medical Condition: ${profile.medical_condition || 'Not provided'}`,
      `Created: ${profile.created_at ? new Date(profile.created_at).toLocaleString() : 'Not available'}`
    ].join('\n'));
  } catch (error) {
    showError(error, 'View profile error');
  }
}

async function adminEditProfile(profileId) {
  if (me?.role !== 'admin') {
    toast('Admin access required.');
    return;
  }

  try {
    const { data: profile, error: loadError } = await db
      .from('profiles')
      .select('*')
      .eq('id', profileId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!profile) throw new Error('Profile not found or access denied.');

    const fullName = prompt('Full name:', profile.full_name || '');
    if (fullName === null) return;
    if (!fullName.trim()) {
      toast('Name cannot be empty.');
      return;
    }

    const phone = prompt('Phone number:', profile.phone || '');
    if (phone === null) return;

    const bloodGroupInput = prompt(
      'Blood group (A+, A-, B+, B-, AB+, AB-, O+, O-). Leave blank if not provided:',
      profile.blood_group || ''
    );
    if (bloodGroupInput === null) return;
    const bloodGroup = bloodGroupInput.trim().toUpperCase();
    if (bloodGroup && !groups.includes(bloodGroup)) {
      toast('Please enter a valid blood group.');
      return;
    }

    const location = prompt('Address / Location:', profile.location || '');
    if (location === null) return;

    const lastDonation = prompt(
      'Last donation date (YYYY-MM-DD). Leave blank if none:',
      profile.last_donation_date || ''
    );
    if (lastDonation === null) return;

    const medicalCondition = prompt(
      'Medical condition (optional):',
      profile.medical_condition || ''
    );
    if (medicalCondition === null) return;

    const update = {
      full_name: fullName.trim(),
      phone: phone.trim() || null,
      blood_group: bloodGroup || null,
      location: location.trim() || null,
      last_donation_date: lastDonation.trim() || null,
      medical_condition: medicalCondition.trim() || null
    };

    const { error: updateError } = await db
      .from('profiles')
      .update(update)
      .eq('id', profileId);

    if (updateError) throw updateError;

    toast('Profile updated successfully.');
    await renderPage();
  } catch (error) {
    showError(error, 'Edit profile error');
  }
}

/* -------------------- MY DONATIONS -------------------- */

async function myDonations() {
  const { data, error } = await db
    .from('donations')
    .select('*')
    .eq('donor_id', session.user.id)
    .order('created_at', { ascending: false });

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
    <div class="panel"><h2>My Donations</h2></div>
    ${data.map(item => `
      <div class="panel" style="margin-top:12px">
        <p><b>Units:</b> ${esc(item.units ?? 'Not provided')}</p>
        <p><b>Donation Date:</b> ${esc(item.donation_date || item.created_at || '')}</p>
        <p><b>Status:</b> ${esc(item.status || 'Completed')}</p>
      </div>
    `).join('')}
  `;
}

/* -------------------- APP START -------------------- */

async function init() {
  if (appStarted) return;
  appStarted = true;

  if (!ready) {
    if ($('auth-view')) $('auth-view').classList.add('hidden');
    if ($('config-view')) $('config-view').classList.remove('hidden');
    return;
  }

  try {
    await boot();

    db.auth.onAuthStateChange((_event, currentSession) => {
      session = currentSession;

      window.setTimeout(() => {
        if (currentSession) {
          boot().catch(error => showError(error, 'Auth state error'));
        } else {
          me = null;
          myProfile = null;
          showAuth();
        }
      }, 0);
    });
  } catch (error) {
    showError(error, 'Initialization error');
    showAuth();
  }
}

/* -------------------- EVENT LISTENERS -------------------- */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => authMode(button.dataset.tab));
  });

  if ($('login-form')) {
    $('login-form').addEventListener('submit', loginSubmit);
  }

  if ($('signup-form')) {
    $('signup-form').addEventListener('submit', signupSubmit);
  }

  if ($('logout-btn')) {
    $('logout-btn').addEventListener('click', () => {
      logout().catch(error => showError(error, 'Logout error'));
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
});

/* Handles pages where app.js loads after DOMContentLoaded. */
if (document.readyState !== 'loading') {
  document.querySelectorAll('.tab').forEach(button => {
    button.addEventListener('click', () => authMode(button.dataset.tab));
  });

  if ($('login-form')) $('login-form').addEventListener('submit', loginSubmit);
  if ($('signup-form')) $('signup-form').addEventListener('submit', signupSubmit);

  if ($('logout-btn')) {
    $('logout-btn').addEventListener('click', () => {
      logout().catch(error => showError(error, 'Logout error'));
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


/* Global compatibility alias for older navigation / inline handlers. */
var notifications = notificationsPage;
window.notifications = notificationsPage;
