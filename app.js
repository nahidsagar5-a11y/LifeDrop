
/* ==========================================
   LIFEDROP - ONLINE BLOOD DONATION SYSTEM
   PART 1: 

const groups = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

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
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

let session = null;
let me = null;
let page = 'Dashboard';
let myProfile = null;

const $ = id => document.getElementById(id);


let session = null;
let me = null;
let page = 'Dashboard';
let myProfile = null;

const $ = id => document.getElementById(id);

const esc = value =>
  String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const initials = name =>
  (name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(x => x[0])
    .join('')
    .toUpperCase();

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

function fail(error) {
  console.error('LifeDrop Error:', error);

  toast(
    error?.message ||
    'Something went wrong. Please try again.'
  );
}

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

/* LOGIN AND SIGNUP TABS */

document.querySelectorAll('.tab').forEach(button => {
  button.onclick = () => authMode(button.dataset.tab);
});

/* LOGIN */

$('login-form').onsubmit = async event => {
  event.preventDefault();

  if (!db) {
    toast('Supabase connection is missing. Check config.js.');
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

/* CREATE ACCOUNT */

$('signup-form').onsubmit = async event => {
  event.preventDefault();

  if (!db) {
    toast('Supabase connection is missing. Check config.js.');
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
        'Account created. Please check your email and confirm your account.'
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

/* SHOW LOGIN PAGE */

function showAuth() {
  $('app-view').classList.add('hidden');
  $('auth-view').classList.remove('hidden');
  $('header-user').textContent = '';
}

/* LOAD USER PROFILE */

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
      'Your profile was not found. Please contact the LifeDrop admin.'
    );
  }

  me = data;
  myProfile = data;

  showApp();
}

/* INITIALIZE APPLICATION */

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
   PART 2: DASHBOARD AND NAVIGATION
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
    'New Blood Request',
    'My Requests',
    'Connected Profiles',
    'Notifications',
    'My Profile',
    ...(me?.role === 'donor' ? ['My Donations'] : [])
  ];
}

/* SHOW APPLICATION */

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

/* LOAD SELECTED PAGE */

async function renderPage() {
  const element = $('page-content');

  element.innerHTML =
    '<div class="panel">Loading...</div>';

  try {
    const pageFunctions = {
      'Dashboard': dashboard,
      'New Blood Request': newRequest,
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

/* COUNT DATABASE RECORDS */

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
      count('profiles', q => q.eq('role', 'donor')),

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
        Your account and data are connected to Supabase.
      </p>

      <div class="actions">

        <button
          class="btn primary"
          data-goto="My Profile">
          Complete My Profile
        </button>

        ${
          me.role === 'user'
          ? `
            <button
              class="btn outline"
              data-goto="New Blood Request">
              Request Blood
            </button>
          `
          : ''
        }

      </div>
    </div>

    <div class="note">
      LifeDrop automatically suggests donors by blood
      group and location. A qualified medical
      professional must confirm donor eligibility
      and blood compatibility.
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

/* NEW BLOOD REQUEST FORM */

async function newRequest() {
  return `
    <div class="panel">

      <h2>Submit a Blood Request</h2>

      <form id="request-form" class="form-grid">

        <label>
          Patient Name
          <input
            name="patient_name"
            required>
        </label>

        <label>
          Blood Group Needed
          <select name="blood_group" required>
            ${groupOptions()}
          </select>
        </label>

        <label>
          Units Required
          <input
            name="units"
            type="number"
            min="1"
            max="20"
            value="1"
            required>
        </label>

        <label>
          Needed Date
          <input
            name="needed_date"
            type="date"
            min="${new Date().toISOString().slice(0, 10)}"
            required>
        </label>

        <label>
          Hospital / Location
          <input
            name="location"
            placeholder="Hospital, area, city"
            required>
        </label>

        <label>
          Contact Phone
          <input
            name="contact_phone"
            type="tel"
            required>
        </label>

        <label class="wide">
          Additional Details
          <textarea
            name="details"
            placeholder="Optional details">
          </textarea>
        </label>

        <div class="wide">
          <button class="btn primary">
            Submit Request & Find Donors
          </button>
        </div>

      </form>
    </div>
  `;
}

/* ==========================================
   PART 3: REQUESTS AND ADMIN MATCHING
========================================== */

/* MY BLOOD REQUESTS */

async function myRequests() {
  const { data, error } = await db
    .from('blood_requests')
    .select('*, matches(id,status,donor_id)')
    .eq('requester_id', me.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data.length) {
    return `
      <div class="panel empty">
        You have not submitted any blood requests.
      </div>
    `;
  }

  return `
    <div class="panel">

      <h2>My Blood Requests</h2>

      <div class="table-wrap">
        <table>

          <tr>
            <th>Patient</th>
            <th>Blood</th>
            <th>Units</th>
            <th>Needed</th>
            <th>Location</th>
            <th>Status</th>
            <th>Matches</th>
          </tr>

          ${data.map(request => `
            <tr>
              <td>${esc(request.patient_name)}</td>
              <td>${esc(request.blood_group)}</td>
              <td>${request.units}</td>
              <td>${esc(request.needed_date)}</td>
              <td>${esc(request.location)}</td>
              <td>${esc(request.status || 'Pending')}</td>
              <td>
                ${
                  (request.matches || [])
                    .filter(match => match.status === 'connected')
                    .length
                    ? 'Connected'
                    : 'Searching'
                }
              </td>
            </tr>
          `).join('')}

        </table>
      </div>

    </div>
  `;
}

/* ADMIN: REQUESTS AND MATCHES */

async function adminRequests() {
  const { data, error } = await db
    .from('matches')
    .select(`
      id,
      status,
      created_at,
      request_id,
      blood_requests(
        id,
        patient_name,
        blood_group,
        units,
        needed_date,
        location,
        requester_id
      ),
      profiles!matches_donor_id_fkey(
        id,
        full_name,
        email,
        phone,
        blood_group,
        location,
        photo_path
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = data.filter(match =>
    match.status !== 'rejected'
  );

  if (!rows.length) {
    return `
      <div class="panel empty">
        No automatic matches found yet.
      </div>
    `;
  }

  return `
    <div class="panel">

      <h2>Automatic Matching Results</h2>

      <p class="muted">
        Review the suggested donor and connect
        the donor with the requester.
      </p>

      <div class="table-wrap">
        <table>

          <tr>
            <th>Patient</th>
            <th>Blood</th>
            <th>Location</th>
            <th>Suggested Donor</th>
            <th>Status</th>
            <th>Action</th>
          </tr>

          ${rows.map(match => `
            <tr>

              <td>
                ${esc(match.blood_requests?.patient_name || '—')}
                <br>
                <small>
                  ${esc(match.blood_requests?.needed_date || '')}
                </small>
              </td>

              <td>
                ${esc(match.blood_requests?.blood_group || '')}
              </td>

              <td>
                ${esc(match.blood_requests?.location || '')}
              </td>

              <td>
                ${esc(match.profiles?.full_name || '')}
                <br>
                <small>
                  ${esc(match.profiles?.blood_group || '')}
                  •
                  ${esc(match.profiles?.location || '')}
                </small>
              </td>

              <td>${esc(match.status)}</td>

              <td>
                ${
                  match.status === 'candidate'
                  ? `
                    <button
                      class="btn primary"
                      data-connect="${match.id}">
                      Connect
                    </button>
                  `
                  : match.status === 'connected'
                    ? 'Connected'
                    : '—'
                }
              </td>

            </tr>
          `).join('')}

        </table>
      </div>

    </div>
  `;
}

/* ADMIN: DONOR LIST */

async function adminDonors() {
  const { data, error } = await db
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      phone,
      blood_group,
      location,
      photo_path
    `)
    .eq('role', 'donor')
    .order('full_name');

  if (error) throw error;

  return `
    <div class="panel">

      <h2>Registered Donors</h2>

      ${
        data.length
        ? `
          <div class="table-wrap">
            <table>

              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Blood Group</th>
                <th>Location</th>
              </tr>

              ${data.map(donor => `
                <tr>
                  <td>${esc(donor.full_name)}</td>
                  <td>${esc(donor.email)}</td>
                  <td>${esc(donor.phone || '')}</td>
                  <td>${esc(donor.blood_group || '')}</td>
                  <td>${esc(donor.location || '')}</td>
                </tr>
              `).join('')}

            </table>
          </div>
        `
        : `
          <div class="empty">
            No donors registered yet.
          </div>
        `
      }

    </div>
  `;
}

/* CONNECTED PROFILES */

async function connectedProfiles() {
  const { data, error } = await db
    .from('matches')
    .select(`
      id,
      created_at,
      requester_id,
      donor_id,
      blood_requests(
        patient_name,
        blood_group,
        location,
        requester_id
      ),
      profiles!matches_donor_id_fkey(
        id,
        full_name,
        phone,
        blood_group,
        location,
        photo_path
      )
    `)
    .eq('status', 'connected')
    .or(`donor_id.eq.${me.id},requester_id.eq.${me.id}`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  if (!data.length) {
    return `
      <div class="panel empty">
        No connected profiles yet.
        Admin approval is required first.
      </div>
    `;
  }

  let cards = '';

  for (const match of data) {
    const isRequester = match.requester_id === me.id;

    let person;

    if (isRequester) {
      person = match.profiles;
    } else {
      const { data: requester, error: profileError } =
        await db
          .from('profiles')
          .select(`
            id,
            full_name,
            phone,
            blood_group,
            location,
            photo_path
          `)
          .eq('id', match.requester_id)
          .single();

      if (profileError) throw profileError;

      person = requester;
    }

    const photo = await photoUrl(person?.photo_path);

    cards += `
      <div class="panel">

        <div class="profile">

          <div class="avatar">
            ${
              photo
              ? `<img src="${photo}" alt="Profile photo">`
              : esc(initials(person?.full_name))
            }
          </div>

          <div>
            <b>${esc(person?.full_name)}</b>

            <p class="muted">
              ${isRequester ? 'Matched Donor' : 'Blood Requester'}
              •
              ${esc(person?.blood_group || 'Not set')}
            </p>
          </div>

        </div>

        <p>
          <b>Phone:</b>
          ${esc(person?.phone || 'Not shared')}
        </p>

        <p>
          <b>Location:</b>
          ${esc(person?.location || 'Not shared')}
        </p>

        <p class="muted">
          Connected after Admin approval.
        </p>

      </div>
    `;
  }

  return `
    <h2>Connected Profiles</h2>

    <p class="muted">
      Only approved connected profiles are shown.
    </p>

    ${cards}
  `;
}

/* ==========================================
   PART 4: NOTIFICATIONS AND USER PROFILE
========================================== */

/* NOTIFICATIONS */

async function notifications() {
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('user_id', me.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return `
    <div class="panel">

      <h2>Notifications</h2>

      ${
        data.length
        ? data.map(notification => `
          <div style="padding:13px 0;border-bottom:1px solid var(--line)">

            <b>${esc(notification.title)}</b>

            <p class="muted">
              ${esc(notification.message)}
            </p>

            <small>
              ${notification.created_at
                ? new Date(notification.created_at).toLocaleString()
                : ''}
            </small>

            ${
              !notification.is_read
              ? `
                <button
                  class="btn outline"
                  data-read="${notification.id}">
                  Mark Read
                </button>
              `
              : '<span class="muted">Read</span>'
            }

          </div>
        `).join('')
        : `
          <div class="empty">
            No notifications yet.
          </div>
        `
      }

    </div>
  `;
}

/* PRIVATE PROFILE PHOTO URL */

async function photoUrl(path) {
  if (!path || !db) return '';

  const { data, error } = await db
    .storage
    .from('profile-photos')
    .createSignedUrl(path, 900);

  if (error) {
    console.warn('Photo loading error:', error);
    return '';
  }

  return data.signedUrl;
}

/* MY PROFILE */

async function profilePage() {
  const p = me;

  const photo = await photoUrl(p.photo_path);

  return `
    <div class="panel">

      <h2>My Profile</h2>

      <div class="profile">

        <div class="avatar">
          ${
            photo
            ? `<img src="${photo}" alt="Profile photo">`
            : esc(initials(p.full_name))
          }
        </div>

        <div>
          <b>${esc(p.full_name)}</b>

          <p class="muted">
            ${esc(p.email)} • ${esc(p.role)}
          </p>
        </div>

      </div>

      <form id="profile-form" class="form-grid">

        <label>
          Full Name
          <input
            name="full_name"
            value="${esc(p.full_name)}"
            required>
        </label>

        <label>
          Phone Number
          <input
            name="phone"
            type="tel"
            value="${esc(p.phone || '')}">
        </label>

        <label>
          Blood Group
          <select name="blood_group">
            ${groupOptions(p.blood_group || '')}
          </select>
        </label>

        <label>
          Last Donation Date
          <input
            name="last_donation_date"
            type="date"
            max="${new Date().toISOString().slice(0,10)}"
            value="${esc(p.last_donation_date || '')}">
        </label>

        <label class="wide">
          Location / Address
          <input
            name="location"
            value="${esc(p.location || '')}">
        </label>

        <label class="wide">
          Profile Photo
          <input
            name="photo"
            type="file"
            accept="image/png,image/jpeg,image/webp">
        </label>

        <div class="wide">
          <button class="btn primary">
            Save Profile
          </button>
        </div>

      </form>

      <p class="note">
        Your photo is stored in the private Supabase
        Storage bucket. Connected users can view
        permitted profile information.
      </p>

    </div>
  `;
}

/* MY DONATION HISTORY */

async function donationsPage() {
  const { data, error } = await db
    .from('donations')
    .select('*')
    .eq('donor_id', me.id)
    .order('donation_date', { ascending: false });

  if (error) throw error;

  return `
    <div class="panel">

      <h2>My Donation History</h2>

      <form id="donation-form" class="form-grid">

        <label>
          Donation Date
          <input
            name="donation_date"
            type="date"
            max="${new Date().toISOString().slice(0,10)}"
            required>
        </label>

        <label>
          Hospital / Centre
          <input name="place" required>
        </label>

        <div class="wide">
          <button class="btn primary">
            Add Donation Record
          </button>
        </div>

      </form>

      <hr>

      ${
        data.length
        ? data.map(donation => `
          <p>
            ${esc(donation.donation_date)}
            —
            ${esc(donation.place)}
          </p>
        `).join('')
        : '<p class="muted">No donation history yet.</p>'
      }

      <p class="note">
        Donation history does not confirm medical
        eligibility. A qualified professional must
        assess every donor.
      </p>

    </div>
  `;
}

/* ==========================================
   PART 5: DATABASE ACTIONS AND APPLICATION START
========================================== */

/* CONNECT MATCH - ADMIN */

async function connectMatch(matchId) {
  const confirmed = confirm(
    'Connect this donor and requester? Both will receive notifications.'
  );

  if (!confirmed) return;

  try {
    const { error } = await db.rpc(
      'admin_connect_match',
      { p_match_id: matchId }
    );

    if (error) throw error;

    toast('Donor connected successfully.');

    await renderPage();

  } catch (error) {
    fail(error);
  }
}

/* BIND ALL PAGE ACTIONS */

function bindPage() {

  /* NAVIGATION SHORTCUTS */

  document.querySelectorAll('[data-goto]').forEach(button => {
    button.onclick = () => {
      page = button.dataset.goto;
      renderNav();
      renderPage();
    };
  });

  /* NEW BLOOD REQUEST */

  const requestForm = $('request-form');

  if (requestForm) {
    requestForm.onsubmit = async event => {
      event.preventDefault();

      const form = new FormData(requestForm);

      try {
        const payload = {
          requester_id: me.id,
          patient_name: form.get('patient_name'),
          blood_group: form.get('blood_group'),
          units: Number(form.get('units')),
          needed_date: form.get('needed_date'),
          location: form.get('location'),
          contact_phone: form.get('contact_phone'),
          details: form.get('details')
        };

        const { error } = await db
          .from('blood_requests')
          .insert(payload);

        if (error) throw error;

        toast('Blood request submitted successfully.');

        page = 'My Requests';

        renderNav();
        renderPage();

      } catch (error) {
        fail(error);
      }
    };
  }

  /* UPDATE PROFILE AND UPLOAD PHOTO */

  const profileForm = $('profile-form');

  if (profileForm) {
    profileForm.onsubmit = async event => {
      event.preventDefault();

      const form = new FormData(profileForm);
      const file = form.get('photo');

      try {
        let photo_path = me.photo_path;

        if (file && file.size > 0) {

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

          const { error: uploadError } = await db
            .storage
            .from('profile-photos')
            .upload(path, file, {
              upsert: true,
              contentType: file.type
            });

          if (uploadError) throw uploadError;

          photo_path = path;
        }

        const update = {
          full_name: form.get('full_name').trim(),
          phone: form.get('phone').trim(),
          blood_group: form.get('blood_group') || null,
          last_donation_date:
            form.get('last_donation_date') || null,
          location: form.get('location').trim(),
          photo_path
        };

        const { data, error } = await db
          .from('profiles')
          .update(update)
          .eq('id', me.id)
          .select()
          .single();

        if (error) throw error;

        me = data;
        myProfile = data;

        toast('Profile updated successfully.');

        await renderPage();

      } catch (error) {
        fail(error);
      }
    };
  }

  /* ADMIN CONNECT BUTTON */

  document.querySelectorAll('[data-connect]').forEach(button => {
    button.onclick = () => connectMatch(button.dataset.connect);
  });

  /* MARK NOTIFICATION AS READ */

  document.querySelectorAll('[data-read]').forEach(button => {
    button.onclick = async () => {
      try {
        const { error } = await db
          .from('notifications')
          .update({ is_read: true })
          .eq('id', button.dataset.read);

        if (error) throw error;

        toast('Notification marked as read.');

        await renderPage();

      } catch (error) {
        fail(error);
      }
    };
  });

  /* ADD DONATION RECORD */

  const donationForm = $('donation-form');

  if (donationForm) {
    donationForm.onsubmit = async event => {
      event.preventDefault();

      const form = new FormData(donationForm);

      try {
        const donationDate = form.get('donation_date');

        const { error } = await db
          .from('donations')
          .insert({
            donor_id: me.id,
            donation_date: donationDate,
            place: form.get('place')
          });

        if (error) throw error;

        const { error: profileError } = await db
          .from('profiles')
          .update({
            last_donation_date: donationDate
          })
          .eq('id', me.id);

        if (profileError) throw profileError;

        const { data, error: reloadError } = await db
          .from('profiles')
          .select('*')
          .eq('id', me.id)
          .single();

        if (reloadError) throw reloadError;

        me = data;
        myProfile = data;

        toast('Donation record saved successfully.');

        await renderPage();

      } catch (error) {
        fail(error);
      }
    };
  }
}

/* START LIFEDROP */

init();

