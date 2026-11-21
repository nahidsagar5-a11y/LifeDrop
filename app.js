
/* ==========================================
   LIFEDROP - PART 1
   AUTHENTICATION & SUPABASE
========================================== */

const groups = [
  'A+', 'A-', 'B+', 'B-',
  'AB+', 'AB-', 'O+', 'O-'
];

const SUPABASE_URL = window.LIFEDROP_SUPABASE_URL;
const SUPABASE_KEY = window.LIFEDROP_SUPABASE_ANON_KEY;

const ready = !!(
  window.supabase &&
  SUPABASE_URL &&
  SUPABASE_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  SUPABASE_KEY.startsWith('sb_publishable_')
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

const $ = id => document.getElementById(id);

/* SAFE HTML */

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

/* INITIALS */

const initials = name =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase();

/* TOAST */

function toast(message) {
  const el = $('toast');

  if (!el) {
    alert(message);
    return;
  }

  el.textContent = message;
  el.classList.add('show');

  setTimeout(() => {
    el.classList.remove('show');
  }, 3200);
}

/* ERROR */

function fail(error) {
  console.error('LifeDrop Error:', error);
  toast(error?.message || 'Something went wrong.');
}

/* AUTH TABS */

function authMode(mode) {
  document.querySelectorAll('.tab').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.tab === mode
    );
  });

  $('login-form').classList.toggle(
    'hidden',
    mode !== 'login'
  );

  $('signup-form').classList.toggle(
    'hidden',
    mode !== 'signup'
  );
}

document.querySelectorAll('.tab').forEach(button => {
  button.onclick = () => authMode(button.dataset.tab);
});

/* LOGIN */

$('login-form').onsubmit = async event => {
  event.preventDefault();

  if (!db) {
    toast('Check your Supabase config.js file.');
    return;
  }

  const form = new FormData(event.target);

  try {
    const { error } = await db.auth.signInWithPassword({
      email: form.get('email').trim(),
      password: form.get('password')
    });

    if (error) throw error;

    await boot();

  } catch (error) {
    fail(error);
  }
};

/* SIGNUP */

$('signup-form').onsubmit = async event => {
  event.preventDefault();

  if (!db) {
    toast('Check your Supabase config.js file.');
    return;
  }

  const form = new FormData(event.target);

  try {
    const { data, error } = await db.auth.signUp({
      email: form.get('email').trim(),
      password: form.get('password'),

      options: {
        data: {
          full_name: form.get('name').trim(),
          role: form.get('role')
        }
      }
    });

    if (error) throw error;

    if (data.session) {
      await boot();
    } else {
      toast(
        'Account created. Please confirm your email.'
      );
    }

  } catch (error) {
    fail(error);
  }
};

/* LOGOUT */

$('logout-btn').onclick = async () => {
  if (!db) return;

  try {
    const { error } = await db.auth.signOut();

    if (error) throw error;

    session = null;
    me = null;
    myProfile = null;

    showAuth();

  } catch (error) {
    fail(error);
  }
};

/* SHOW LOGIN */

function showAuth() {
  $('app-view').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
  $('header-user').textContent = '';
}

/* LOAD PROFILE */

async function boot() {
  const {
    data: { session: currentSession },
    error: sessionError
  } = await db.auth.getSession();

  if (sessionError) throw sessionError;

  session = currentSession;

  if (!session) {
    showAuth();
    return;
  }

  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error(
      'Profile not found. Contact LifeDrop admin.'
    );
  }

  me = data;
  myProfile = data;

  showApp();
}

/* INITIALIZE */

async function init() {
  if (!ready) {
    $('auth-view').classList.add('hidden');
    $('config-view').classList.remove('hidden');
    return;
  }

  try {
    await boot();

    db.auth.onAuthStateChange((event, currentSession) => {
      session = currentSession;

      setTimeout(() => {
        if (currentSession) {
          boot().catch(fail);
        } else {
          me = null;
          myProfile = null;
          showAuth();
        }
      }, 0);
    });

  } catch (error) {
    fail(error);
    showAuth();
  }
}

/* ==========================================
   LIFEDROP - PART 2
   DASHBOARD & SEARCH BLOOD
========================================== */

/* AVAILABLE PAGES */

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

/* SHOW APP */

function showApp() {
  $('auth-view').classList.add('hidden');
  $('config-view').classList.add('hidden');
  $('app-view').classList.remove('hidden');

  $('header-user').textContent =
    `${me.full_name} • ${me.role.toUpperCase()}`;

  $('welcome-title').textContent =
    `Hello, ${(me.full_name || 'User').split(' ')[0]}`;

  renderNav();
  renderPage();
}

/* NAVIGATION */

function renderNav() {
  $('nav').innerHTML = pages().map(p => `
    <button
      type="button"
      class="${p === page ? 'active' : ''}"
      data-page="${esc(p)}">
      ${esc(p)}
    </button>
  `).join('');

  document.querySelectorAll('[data-page]').forEach(button => {
    button.onclick = () => {
      page = button.dataset.page;
      renderNav();
      renderPage();
    };
  });
}

/* LOAD PAGE */

async function renderPage() {
  const element = $('page-content');

  element.innerHTML =
    '<div class="panel">Loading...</div>';

  try {
    const pageFunctions = {
      'Dashboard': dashboard,
      'Search Blood': searchBlood,
      'My Requests': myRequests,
      'Requests & Matches': adminRequests,
      'Donors': adminDonors,
      'Connected Profiles': connectedProfiles,
      'Notifications': notifications,
      'My Profile': profilePage,
      'My Donations': donationsPage
    };

    const selectedPage =
      pageFunctions[page] || dashboard;

    element.innerHTML = await selectedPage();

    bindPage();

  } catch (error) {
    element.innerHTML = `
      <div class="panel">
        <h2>Unable to load page</h2>
        <p>${esc(error.message)}</p>
      </div>
    `;

    fail(error);
  }
}

/* DATABASE COUNT */

async function count(table, query) {
  let request = db
    .from(table)
    .select('id', {
      count: 'exact',
      head: true
    });

  if (query) {
    request = query(request);
  }

  const { count: total, error } = await request;

  if (error) throw error;

  return total || 0;
}

/* DASHBOARD */

async function dashboard() {
  const [donors, requests, matches, notes] =
    await Promise.all([
      count('profiles', q =>
        q.eq('role', 'donor')
      ),

      count('blood_requests'),

      count('matches', q =>
        q.eq('status', 'connected')
      ),

      count('notifications', q =>
        q.eq('user_id', me.id)
         .eq('is_read', false)
      )
    ]);

  return `
    <div class="stats">

      <div class="stat-card">
        <span>Registered Donors</span>
        <b>${donors}</b>
      </div>

      <div class="stat-card">
        <span>Blood Requests</span>
        <b>${requests}</b>
      </div>

      <div class="stat-card">
        <span>Connected Matches</span>
        <b>${matches}</b>
      </div>

      <div class="stat-card">
        <span>Unread Notifications</span>
        <b>${notes}</b>
      </div>

    </div>

    <div class="panel">

      <h2>Welcome to LifeDrop</h2>

      <p class="muted">
        Give blood. Give life.
        Find compatible blood donors easily.
      </p>

      <div class="actions">

        ${
          me.role !== 'admin'
          ? `
            <button
              class="btn primary"
              data-goto="Search Blood">
              Search Blood
            </button>
          `
          : `
            <button
              class="btn primary"
              data-goto="Requests & Matches">
              Manage Requests
            </button>
          `
        }

        <button
          class="btn outline"
          data-goto="My Profile">
          My Profile
        </button>

      </div>

    </div>

    <div class="note">
      Donor eligibility and blood compatibility
      must be confirmed by a qualified medical
      professional before transfusion.
    </div>
  `;
}

/* BLOOD GROUP OPTIONS */

function groupOptions(selected = '') {
  return `
    <option value="">Select blood group</option>

    ${groups.map(group => `
      <option
        value="${group}"
        ${group === selected ? 'selected' : ''}>
        ${group}
      </option>
    `).join('')}
  `;
}

/* SEARCH BLOOD PAGE */

async function searchBlood() {
  if (me.role === 'admin') {
    return `
      <div class="panel">
        <h2>Blood Search</h2>
        <p>Use the Admin Dashboard to manage donor requests.</p>
      </div>
    `;
  }

  return `
    <div class="panel">

      <h2>Search Blood Donors</h2>

      <p class="muted">
        Select the required blood group.
        Location is optional.
      </p>

      <form id="blood-search-form" class="form-grid">

        <label>
          Required Blood Group

          <select name="blood_group" required>
            ${groupOptions()}
          </select>
        </label>

        <label>
          Location (Optional)

          <input
            name="location"
            type="text"
            placeholder="Enter area or city">
        </label>

        <div class="wide">
          <button
            type="submit"
            class="btn primary">
            Search Donors
          </button>
        </div>

      </form>

    </div>

    <div id="donor-search-results"></div>
  `;
}

/* RUN DONOR SEARCH */

async function runDonorSearch(bloodGroup, location = '') {
  const results = $('donor-search-results');

  if (!results) return;

  results.innerHTML = `
    <div class="panel">Searching compatible donors...</div>
  `;

  try {
    const { data, error } = await db.rpc(
      'search_lifedrop_donors',
      {
        p_blood_group: bloodGroup,
        p_location: location.trim() || null
      }
    );

    if (error) throw error;

    if (!data || !data.length) {
      results.innerHTML = `
        <div class="panel empty">
          No eligible matching donors found.
          <br><br>
          Try another location or blood group.
        </div>
      `;
      return;
    }

    results.innerHTML = `
      <div class="panel">

        <h2>Matching Donors</h2>

        <p class="muted">
          ${data.length} compatible donor(s) found.
          Only name and location are displayed
          before Admin approval.
        </p>

        <div class="table-wrap">
          <table>

            <tr>
              <th>Donor Name</th>
              <th>Address / Location</th>
              <th>Action</th>
            </tr>

            ${data.map(donor => `
              <tr>

                <td>
                  ${esc(donor.donor_name)}
                </td>

                <td>
                  ${esc(donor.donor_location || 'Not provided')}
                </td>

                <td>
                  <button
                    type="button"
                    class="btn primary"
                    data-send-request="${esc(donor.donor_id)}"
                    data-blood-group="${esc(bloodGroup)}">
                    Send Request
                  </button>
                </td>

              </tr>
            `).join('')}

          </table>
        </div>

      </div>
    `;

    results.querySelectorAll('[data-send-request]')
      .forEach(button => {
        button.onclick = () => {
          sendDonorRequest(
            button.dataset.sendRequest,
            button.dataset.bloodGroup
          );
        };
      });

  } catch (error) {
    results.innerHTML = `
      <div class="panel">
        <p>${esc(error.message)}</p>
      </div>
    `;

    fail(error);
  }
}

/* ==========================================
   LIFEDROP - PART 3
   SEND REQUEST TO SELECTED DONOR
========================================== */

async function sendDonorRequest(donorId, donorName, donorLocation) {
  try {
    if (!session || !myProfile) {
      toast('Please login first');
      return;
    }

    // Get selected blood group from Search Blood page
    const groupSelect = [...document.querySelectorAll('select')]
      .find(el => groups.includes(el.value));

    const bloodGroup = groupSelect?.value;

    if (!bloodGroup) {
      toast('Please select a blood group first');
      return;
    }

    const patientName = prompt('Enter patient name:');
    if (!patientName || !patientName.trim()) return;

    const unitsInput = prompt('How many blood units are needed?', '1');
    if (unitsInput === null) return;

    const units = Number(unitsInput);

    if (!Number.isInteger(units) || units < 1 || units > 20) {
      toast('Enter a valid number of units (1-20)');
      return;
    }

    const today = new Date();
    const defaultDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    const neededDate = prompt(
      'Enter required date (YYYY-MM-DD):',
      defaultDate
    );

    if (!neededDate) return;

    const location = prompt(
      'Enter hospital or blood requirement location:',
      donorLocation || ''
    );

    if (!location || !location.trim()) {
      toast('Hospital/location is required');
      return;
    }

    const profilePhone =
      myProfile.contact_phone ||
      myProfile.phone ||
      '';

    const contactPhone = prompt(
      'Enter your contact phone number:',
      profilePhone
    );

    if (!contactPhone || !contactPhone.trim()) return;

    const details = prompt(
      'Additional details (optional):',
      ''
    );

    const { data, error } = await db.rpc(
      'send_lifedrop_donor_request',
      {
        p_donor_id: donorId,
        p_patient_name: patientName.trim(),
        p_blood_group: bloodGroup,
        p_units: units,
        p_needed_date: neededDate,
        p_location: location.trim(),
        p_contact_phone: contactPhone.trim(),
        p_details: details || null
      }
    );

    if (error) throw error;

    if (data?.success) {
      toast(`Request sent to ${donorName || 'selected donor'} successfully!`);
      await renderPage();
    } else {
      toast('Could not send request');
    }

  } catch (error) {
    console.error('Send request error:', error);
    toast(error.message || 'Failed to send request');
  }
}

/* ==========================================
   LIFEDROP - PART 4
   ADMIN REQUESTS, CONNECT & COMPLETION
========================================== */

async function adminRequests() {
  const area = $('page-content');

  area.innerHTML = `
    <section class="panel">
      <h2>Requests & Matches</h2>
      <p>Review donor requests and connect suitable donors.</p>
      <div id="admin-match-list">Loading requests...</div>
    </section>
  `;

  const list = $('admin-match-list');

  try {
    if (myProfile?.role !== 'admin') {
      list.innerHTML = '<p>Admin access required.</p>';
      return;
    }

    const { data: matches, error } = await db
      .from('matches')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!matches || matches.length === 0) {
      list.innerHTML = '<p>No requests found.</p>';
      return;
    }

    let html = '';

    for (const match of matches) {
      const { data: request, error: requestError } = await db
        .from('blood_requests')
        .select('*')
        .eq('id', match.request_id)
        .maybeSingle();

      if (requestError) throw requestError;
      if (!request) continue;

      const { data: donor } = await db
        .from('profiles')
        .select('full_name, blood_group, location')
        .eq('id', match.donor_id)
        .maybeSingle();

      const { data: requester } = await db
        .from('profiles')
        .select('full_name')
        .eq('id', match.requester_id)
        .maybeSingle();

      const status = match.status || 'candidate';

      html += `
        <div class="panel" style="margin-top:14px">
          <h3>${esc(request.patient_name || 'Patient')}</h3>

          <p><b>Blood Group:</b> ${esc(request.blood_group || '')}</p>
          <p><b>Units:</b> ${esc(request.units ?? '')}</p>
          <p><b>Needed Date:</b> ${esc(request.needed_date || '')}</p>
          <p><b>Hospital/Location:</b> ${esc(request.location || '')}</p>

          <hr>

          <p><b>Requester:</b> ${esc(requester?.full_name || 'User')}</p>
          <p><b>Donor:</b> ${esc(donor?.full_name || 'Donor')}</p>
          <p><b>Donor Blood Group:</b> ${esc(donor?.blood_group || '')}</p>
          <p><b>Donor Location:</b> ${esc(donor?.location || '')}</p>

          <p><b>Status:</b> ${esc(status.toUpperCase())}</p>

          ${
            status === 'candidate'
              ? `<button class="btn" data-action="admin-connect"
                   data-id="${esc(match.id)}">
                   Connect Donor
                 </button>`
              : status === 'connected'
                ? '<p>Donor and requester are connected.</p>'
                : '<p>Donation process completed.</p>'
          }
        </div>
      `;
    }

    list.innerHTML = html || '<p>No requests found.</p>';

  } catch (error) {
    console.error(error);
    list.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}


async function adminConnectMatch(matchId) {
  try {
    if (myProfile?.role !== 'admin') {
      toast('Only admin can connect matches');
      return;
    }

    const confirmed = confirm(
      'Are you sure you want to connect this donor and requester?'
    );

    if (!confirmed) return;

    const { data, error } = await db.rpc(
      'admin_connect_match',
      { p_match_id: matchId }
    );

    if (error) throw error;

    toast('Donor connected successfully!');

    await renderPage();

  } catch (error) {
    console.error('Admin connect error:', error);
    toast(error.message || 'Could not connect donor');
  }
}


/* ==========================================
   CONNECTED PROFILES
========================================== */

async function connectedProfiles() {
  const area = $('page-content');

  area.innerHTML = `
    <section class="panel">
      <h2>Connected Profiles</h2>
      <div id="connected-list">Loading...</div>
    </section>
  `;

  const list = $('connected-list');

  try {
    const { data: matches, error } = await db
      .from('matches')
      .select('*')
      .eq('status', 'connected')
      .order('connected_at', { ascending: false });

    if (error) throw error;

    const myMatches = (matches || []).filter(match =>
      match.requester_id === session.user.id ||
      match.donor_id === session.user.id
    );

    if (myMatches.length === 0) {
      list.innerHTML = '<p>No connected profiles yet.</p>';
      return;
    }

    let html = '';

    for (const match of myMatches) {
      const otherUserId =
        match.requester_id === session.user.id
          ? match.donor_id
          : match.requester_id;

      const { data: profile, error: profileError } = await db
        .from('profiles')
        .select('*')
        .eq('id', otherUserId)
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        html += `
          <div class="panel">
            <p>Connected profile is not available.</p>
          </div>
        `;
        continue;
      }

      const { data: request } = await db
        .from('blood_requests')
        .select('patient_name, blood_group, location')
        .eq('id', match.request_id)
        .maybeSingle();

      html += `
        <div class="panel" style="margin-top:14px">
          <h3>${esc(profile.full_name || 'Connected User')}</h3>

          <p><b>Blood Group:</b> ${esc(profile.blood_group || 'Not provided')}</p>
          <p><b>Location:</b> ${esc(profile.location || 'Not provided')}</p>
          <p><b>Phone:</b> ${esc(profile.contact_phone || profile.phone || 'Not provided')}</p>
          <p><b>Email:</b> ${esc(profile.email || 'Not provided')}</p>

          <hr>

          <p><b>Request:</b> ${esc(request?.patient_name || '')}</p>
          <p><b>Required Blood:</b> ${esc(request?.blood_group || '')}</p>
          <p><b>Hospital:</b> ${esc(request?.location || '')}</p>

          <button class="btn"
            data-action="complete-match"
            data-id="${esc(match.id)}">
            Mark Donation Complete
          </button>
        </div>
      `;
    }

    list.innerHTML = html;

  } catch (error) {
    console.error(error);
    list.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}


/* ==========================================
   COMPLETE DONATION
========================================== */

async function completeMatch(matchId) {
  try {
    const confirmed = confirm(
      'Confirm that the blood donation has been completed?'
    );

    if (!confirmed) return;

    const { data, error } = await db.rpc(
      'complete_lifedrop_match',
      { p_match_id: matchId }
    );

    if (error) throw error;

    toast('Donation completed successfully!');

    await renderPage();

  } catch (error) {
    console.error('Complete donation error:', error);
    toast(error.message || 'Could not complete donation');
  }
}

/* ==========================================
   LIFEDROP - PART 5
   NOTIFICATIONS, PROFILE, DONORS, HISTORY
========================================== */


/* ==========================================
   NOTIFICATIONS
========================================== */

async function notificationsPage() {
  const area = $('page-content');

  area.innerHTML = `
    <section class="panel">
      <h2>Notifications</h2>
      <div id="notification-list">Loading...</div>
    </section>
  `;

  const list = $('notification-list');

  try {
    const { data, error } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<p>No notifications yet.</p>';
      return;
    }

    list.innerHTML = data.map(item => `
      <div class="panel" style="margin-top:12px">
        <h3>${esc(item.title || 'LifeDrop Notification')}</h3>
        <p>${esc(item.message || '')}</p>
        <small>${esc(item.created_at ? new Date(item.created_at).toLocaleString() : '')}</small>
      </div>
    `).join('');

  } catch (error) {
    console.error(error);
    list.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}


/* ==========================================
   MY PROFILE
========================================== */

async function profilePage() {
  const area = $('page-content');

  area.innerHTML = `
    <section class="panel">
      <h2>My Profile</h2>
      <div id="profile-details">Loading profile...</div>
    </section>
  `;

  const details = $('profile-details');

  try {
    const { data: profile, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .maybeSingle();

    if (error) throw error;

    if (!profile) {
      details.innerHTML = '<p>Profile not found.</p>';
      return;
    }

    myProfile = profile;

    details.innerHTML = `
      <div class="profile-info">
        <p><b>Name:</b> ${esc(profile.full_name || '')}</p>
        <p><b>Email:</b> ${esc(session.user.email || '')}</p>
        <p><b>Phone:</b> ${esc(profile.contact_phone || profile.phone || 'Not provided')}</p>
        <p><b>Blood Group:</b> ${esc(profile.blood_group || 'Not provided')}</p>
        <p><b>Location:</b> ${esc(profile.location || 'Not provided')}</p>
        <p><b>Role:</b> ${esc(profile.role || 'user')}</p>
        <p><b>Last Donation:</b> ${esc(profile.last_donation_date || 'Not provided')}</p>
      </div>
    `;

  } catch (error) {
    console.error(error);
    details.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}


/* ==========================================
   ADMIN DONOR MANAGEMENT
========================================== */

async function adminDonors() {
  const area = $('page-content');

  area.innerHTML = `
    <section class="panel">
      <h2>Donor Management</h2>
      <div id="admin-donor-list">Loading donors...</div>
    </section>
  `;

  const list = $('admin-donor-list');

  try {
    if (myProfile?.role !== 'admin') {
      list.innerHTML = '<p>Admin access required.</p>';
      return;
    }

    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('role', 'donor')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      list.innerHTML = '<p>No donors registered.</p>';
      return;
    }

    list.innerHTML = data.map(donor => `
      <div class="panel" style="margin-top:12px">
        <h3>${esc(donor.full_name || 'Donor')}</h3>
        <p><b>Blood Group:</b> ${esc(donor.blood_group || '')}</p>
        <p><b>Location:</b> ${esc(donor.location || '')}</p>
        <p><b>Phone:</b> ${esc(donor.contact_phone || donor.phone || 'Not provided')}</p>
        <p><b>Last Donation:</b> ${esc(donor.last_donation_date || 'Not provided')}</p>
      </div>
    `).join('');

  } catch (error) {
    console.error(error);
    list.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}


/* ==========================================
   MY DONATION HISTORY
========================================== */

async function myDonations() {
  const area = $('page-content');

  area.innerHTML = `
    <section class="panel">
      <h2>My Donations</h2>
      <div id="donation-history">Loading donation history...</div>
    </section>
  `;

  const history = $('donation-history');

  try {
    const { data, error } = await db
      .from('donations')
      .select('*')
      .eq('donor_id', session.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      history.innerHTML = '<p>No donation history found.</p>';
      return;
    }

    history.innerHTML = data.map(item => `
      <div class="panel" style="margin-top:12px">
        <p><b>Units:</b> ${esc(item.units ?? 'Not provided')}</p>
        <p><b>Donation Date:</b> ${esc(item.donation_date || item.created_at || '')}</p>
        <p><b>Status:</b> ${esc(item.status || 'Completed')}</p>
      </div>
    `).join('');

  } catch (error) {
    console.error(error);
    history.innerHTML = `<p>${esc(error.message)}</p>`;
  }
}

/* ==========================================
   LIFEDROP - PART 6
   FINAL EVENT BINDING & APP START
========================================== */


/* ==========================================
   ALL BUTTON EVENTS
========================================== */

document.addEventListener('click', async function(event) {
  const button = event.target.closest('[data-action]');

  if (!button) return;

  const action = button.dataset.action;

  try {
    if (action === 'admin-connect') {
      await adminConnectMatch(button.dataset.id);
      return;
    }

    if (action === 'complete-match') {
      await completeMatch(button.dataset.id);
      return;
    }

    if (action === 'send-request') {
      await sendDonorRequest(
        button.dataset.donorId || button.dataset.id,
        button.dataset.donorName || '',
        button.dataset.donorLocation || ''
      );
      return;
    }

    if (action === 'search-donors') {
      const groupInput = document.querySelector(
        '#search-blood-group, [name="blood_group"]'
      );

      const locationInput = document.querySelector(
        '#search-blood-location, [name="location"]'
      );

      const bloodGroup = groupInput?.value;
      const location = locationInput?.value || '';

      if (!bloodGroup) {
        toast('Please select a blood group');
        return;
      }

      await runDonorSearch(bloodGroup, location);
      return;
    }

    if (action === 'logout') {
      await logout();
      return;
    }

  } catch (error) {
    console.error('LifeDrop button error:', error);
    toast(error.message || 'Something went wrong');
  }
});


/* ==========================================
   NAVIGATION EVENTS
========================================== */

document.addEventListener('click', async function(event) {
  const navButton = event.target.closest('[data-page]');

  if (!navButton) return;

  const selectedPage = navButton.dataset.page;

  if (!selectedPage) return;

  page = selectedPage;

  try {
    await renderPage();
  } catch (error) {
    console.error('Navigation error:', error);
    toast(error.message || 'Could not open page');
  }
});


/* ==========================================
   LOGOUT BUTTON
========================================== */

const logoutButton = $('logout-btn');

if (logoutButton) {
  logoutButton.addEventListener('click', async function() {
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      toast(error.message || 'Logout failed');
    }
  });
}


/* ==========================================
   START APPLICATION ONLY ONCE
========================================== */

let lifedropStarted = false;

function startLifeDrop() {
  if (lifedropStarted) return;

  lifedropStarted = true;

  init();
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    startLifeDrop,
    { once: true }
  );
} else {
  startLifeDrop();
}
