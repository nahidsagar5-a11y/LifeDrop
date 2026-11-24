/* BloodDrop UI and feature enhancements.
   This file extends the existing app.js and keeps its current RPC workflow. */
(function () {
  'use strict';

  const originalDashboard = dashboard;
  const originalSearchBlood = searchBlood;
  const originalRunDonorSearch = runDonorSearch;
  const originalRenderPage = renderPage;
  const originalBindPage = bindPage;
  let supportConversationId = null;
  let supportChannel = null;
  let notificationChannel = null;

  const bloodGroups = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  const receive = {
    'O-':['O-'], 'O+':['O-','O+'], 'A-':['O-','A-'],
    'A+':['O-','O+','A-','A+'], 'B-':['O-','B-'],
    'B+':['O-','O+','B-','B+'], 'AB-':['O-','A-','B-','AB-'],
    'AB+':['O-','O+','A-','A+','B-','B+','AB-','AB+']
  };
  const donate = {
    'O-':['O-','O+','A-','A+','B-','B+','AB-','AB+'],
    'O+':['O+','A+','B+','AB+'], 'A-':['A-','A+','AB-','AB+'],
    'A+':['A+','AB+'], 'B-':['B-','B+','AB-','AB+'],
    'B+':['B+','AB+'], 'AB-':['AB-','AB+'], 'AB+':['AB+']
  };

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function modal(title, body, actions = '') {
    const root = document.getElementById('modal-root');
    if (!root) return;
    root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop><section class="modal-card" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" type="button" data-modal-close aria-label="Close">×</button></div>${body}${actions}</section></div>`;
    root.querySelector('[data-modal-close]')?.addEventListener('click', closeModal);
    root.querySelector('[data-modal-backdrop]')?.addEventListener('click', e => { if (e.target.matches('[data-modal-backdrop]')) closeModal(); });
    document.addEventListener('keydown', onModalEscape, { once: true });
  }
  function onModalEscape(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() { const root = document.getElementById('modal-root'); if (root) root.innerHTML = ''; }
  window.lifeDropModal = modal;
  window.lifeDropCloseModal = closeModal;
  window.lifeDropConfirm = confirmModal;

  function confirmModal(title, message, confirmText, callback, danger = false) {
    modal(title, `<p class="muted">${esc(message)}</p>`, `<div class="modal-actions"><button class="btn outline" type="button" data-modal-cancel>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-modal-confirm>${esc(confirmText)}</button></div>`);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
    document.querySelector('[data-modal-confirm]')?.addEventListener('click', async () => { closeModal(); await callback(); });
  }

  async function updateNotificationBell() {
    const button = document.getElementById('notification-bell');
    const badge = document.getElementById('notification-count');
    if (!button || !badge || !session?.user?.id || !db) return;
    try {
      const { count, error } = await db.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('is_read', false);
      if (error) throw error;
      badge.textContent = String(count || 0);
      badge.classList.toggle('hidden', !count);
      button.setAttribute('aria-label', `${count || 0} unread notifications`);
    } catch (e) { console.warn('Notification count unavailable:', e.message); }
  }

  function subscribeNotifications() {
    if (!db?.channel || !session?.user?.id) return;
    if (notificationChannel) db.removeChannel(notificationChannel).catch(() => {});
    notificationChannel = db.channel(`lifedrop-notifications-${session.user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => updateNotificationBell())
      .subscribe();
  }

  function addSupportLauncher() {
    if (!session?.user?.id || document.getElementById('support-fab')) return;
    const button = document.createElement('button');
    button.id = 'support-fab';
    button.type = 'button';
    button.className = 'support-fab';
    button.textContent = '✦ Live Support';
    button.addEventListener('click', async () => {
      page = me?.role === 'admin' ? 'Support Inbox' : 'Support';
      renderNav();
      await renderPage();
    });
    document.body.appendChild(button);
  }
  function removeSupportLauncher() { document.getElementById('support-fab')?.remove(); }

  async function bloodGroupCounts() {
    try {
      const { data, error } = await db.rpc('get_lifedrop_blood_group_counts');
      if (error) throw error;
      const counts = Object.fromEntries(bloodGroups.map(g => [g, 0]));
      (data || []).forEach(row => { if (counts[row.blood_group] !== undefined) counts[row.blood_group] = Number(row.donor_count || 0); });
      return { counts, available: true };
    } catch (error) {
      console.warn('Blood group count RPC is not installed yet:', error.message);
      return { counts: Object.fromEntries(bloodGroups.map(g => [g, null])), available: false };
    }
  }

  window.pages = function enhancedPages() {
    const list = me?.role === 'admin'
      ? ['Dashboard','Search Blood','Requests & Matches','Donors','Notifications','My Profile','Support Inbox']
      : ['Dashboard','Search Blood','My Requests','Connected Profiles','Notifications','My Profile',...(me?.role === 'donor' ? ['My Donations'] : []),'Support'];
    return list;
  };

  window.dashboard = async function enhancedDashboard() {
    const [base, groupResult] = await Promise.all([originalDashboard(), bloodGroupCounts()]);
    const cards = bloodGroups.map(group => `
      <article class="blood-group-card"><span class="blood-type">${group}</span><b>${groupResult.available ? groupResult.counts[group] : '—'}</b><small>Registered donors</small></article>
    `).join('');
    const guide = bloodGroups.map(group => `
      <article class="compat-card"><strong>${group}</strong><p><b>Can receive:</b> ${receive[group].join(', ')}</p><p><b>Can donate to:</b> ${donate[group].join(', ')}</p></article>
    `).join('');
    return `${base}
      <section class="panel"><div class="section-heading"><div><p class="eyebrow">LIVE COMMUNITY OVERVIEW</p><h2>Donors by blood group</h2><p class="muted">Counts are read from your Supabase donor profiles.</p></div><button class="btn outline" type="button" data-refresh-dashboard>Refresh</button></div>
      ${!groupResult.available ? '<p class="note">To show live counts for all eight groups, run the optional blood-group count function in optional_features.sql. Your existing donor data and current dashboard remain unchanged.</p>' : ''}
      <div class="blood-group-grid">${cards}</div></section>
      <section class="panel"><p class="eyebrow">RBC COMPATIBILITY GUIDE</p><h2>Blood group compatibility</h2><p class="muted">Educational reference for red blood cell (RBC) donation.</p><div class="compat-grid">${guide}</div><p class="note">This guide is educational only. A qualified clinician must assess every transfusion, including blood typing and crossmatching. These rules describe red blood cell compatibility only, not plasma or whole-blood compatibility.</p></section>`;
  };

  window.searchBlood = async function enhancedSearchBlood() {
    const html = await originalSearchBlood();
    return html.replace(/Select required blood group\. Location is optional\./, 'Choose the required blood group and optionally enter a city, area or hospital location.')
      .replace('</form>', '</form><p class="hint">Donor availability and eligibility must be confirmed before arranging a donation.</p>');
  };

  function donorEligibilityInfo(lastDonationDate) {
    if (!lastDonationDate) {
      return {
        eligible: false,
        label: 'Last donation date not provided',
        detail: 'Update the donor profile to calculate the waiting period.'
      };
    }
    const parts = String(lastDonationDate).slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) {
      return {
        eligible: false,
        label: 'Date unavailable',
        detail: 'Please update the donor profile.'
      };
    }
    const last = new Date(parts[0], parts[1] - 1, parts[2]);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const elapsed = Math.floor((today - last) / 86400000);
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      return {
        eligible: false,
        label: 'Check donation date',
        detail: 'The recorded date is in the future.'
      };
    }
    const remaining = Math.max(0, 90 - elapsed);
    return remaining === 0
      ? {
          eligible: true,
          label: '90-day interval reached',
          detail: 'Date-based interval reached; medical eligibility must still be confirmed.'
        }
      : {
          eligible: false,
          label: `${remaining} day${remaining === 1 ? '' : 's'} remaining`,
          detail: 'Until the 90-day interval is reached.'
        };
  }

  window.runDonorSearch = async function enhancedRunDonorSearch(group, location = '') {
    const results = document.getElementById('donor-search-results');
    if (!results) return originalRunDonorSearch(group, location);
    results.innerHTML = '<div class="panel loading-line">Finding compatible donors…</div>';
    try {
      // Fetch every donor in a compatible blood group, not only currently eligible
      // donors, so members can see the eligibility countdown on each donor card.
      const compatibleGroups = receive[group];
      if (!compatibleGroups?.length) throw new Error('Please choose a valid blood group.');
      const donorResults = await Promise.all(compatibleGroups.map(p_blood_group =>
        db.rpc('get_lifedrop_donor_cards', {
          p_blood_group,
          p_location: location.trim() || null
        })
      ));
      for (const result of donorResults) {
        if (result.error) throw result.error;
      }
      const donors = donorResults.flatMap(result => result.data || []);
      const uniqueDonors = [...new Map(donors.map(d => [d.donor_id, d])).values()];
      const { data: ratingRows, error: ratingError } = await db.rpc('get_lifedrop_donor_ratings');
      if (ratingError) throw ratingError;
      const ratings = new Map((ratingRows || []).map(r => [r.donor_id, r]));
      uniqueDonors.sort((a, b) => {
        const ea = donorEligibilityInfo(a.last_donation_date).eligible ? 0 : 1;
        const eb = donorEligibilityInfo(b.last_donation_date).eligible ? 0 : 1;
        return ea - eb || String(a.donor_name || '').localeCompare(String(b.donor_name || ''));
      });

      if (!uniqueDonors.length) {
        results.innerHTML = '<div class="panel empty-state"><h3>No compatible donors found</h3><p>Try another location or check again later.</p></div>';
        return;
      }

      results.innerHTML = `<section class="panel"><div class="section-heading"><div><p class="eyebrow">COMPATIBLE DONORS</p><h2>Matching donor list</h2><p class="muted">${uniqueDonors.length} compatible donor(s) found. Eligible-by-date donors appear first.</p></div><span class="soft-chip">${esc(group)} requested</span></div></section>
        <div class="donor-grid">${uniqueDonors.map(d => {
          const name = d.donor_name || 'BloodDrop Donor';
          const locationText = d.donor_location || 'Location not provided';
          const initialsText = name.trim().split(/\s+/).slice(0,2).map(x => x[0] || '').join('').toUpperCase();
          const rating = ratings.get(d.donor_id);
          const average = Number(rating?.average_rating || 0);
          const reviewCount = Number(rating?.review_count || 0);
          const ratingWidth = Math.max(0, Math.min(100, average / 5 * 100));
          const eligibility = donorEligibilityInfo(d.last_donation_date);
          const eligibilityClass = eligibility.eligible ? 'eligibility-ready' : 'eligibility-wait';
          const lastDonation = d.last_donation_date ? esc(String(d.last_donation_date).slice(0, 10)) : 'Not provided';
          return `<article class="donor-card donor-card-public">
            <div class="donor-card-head"><div class="avatar avatar-small">${esc(initialsText || 'LD')}</div><div class="donor-card-title"><div class="donor-name-rating"><h3>${esc(name)}</h3><div class="public-donor-rating" aria-label="${reviewCount ? `${average.toFixed(1)} out of 5, ${reviewCount} reviews` : 'No ratings yet'}">
              ${reviewCount ? `<span class="rating-stars"><span class="stars-base">★★★★★</span><span class="stars-value" style="width:${ratingWidth}%">★★★★★</span></span><small class="rating-caption">${average.toFixed(1)}/5 · ${reviewCount} review${reviewCount === 1 ? '' : 's'}</small>` : '<small class="rating-caption rating-unrated">☆ No ratings yet</small>'}
            </div></div><span class="soft-chip">${esc(d.blood_group || 'Blood group not set')}</span></div></div>
            <div class="donor-meta"><span>⌖ ${esc(locationText)}</span><span>♥ Requested group: ${esc(group)}</span></div>
            <div class="donor-eligibility ${eligibilityClass}">
              <strong>${eligibility.eligible ? '✓ ' : '◷ '}${esc(eligibility.label)}</strong>
              <small>${esc(eligibility.detail)}</small>
              <small>Last donation: ${lastDonation}</small>
            </div>
            <button type="button" class="btn primary" ${eligibility.eligible ? '' : 'disabled'} data-send-request="${esc(d.donor_id)}" data-blood-group="${esc(group)}" data-donor-name="${esc(name)}" data-donor-location="${esc(locationText)}">${eligibility.eligible ? 'Send Blood Request' : 'Not yet eligible'}</button>
          </article>`;
        }).join('')}</div>
        <p class="note">The 90-day countdown is a date-based guide only. It does not confirm medical fitness to donate. A qualified healthcare professional must confirm eligibility before donation.</p>`;
      bindPage();
    } catch (error) {
      console.error('Donor search error:', error);
      results.innerHTML = `<div class="panel"><h3>Unable to load donor cards</h3><p>${esc(error.message || 'Please try again.')}</p></div>`;
    }
  };

  window.sendDonorRequest = async function enhancedSendDonorRequest(donorId, bloodGroup, donorName = '', donorLocation = '') {
    if (!session || !myProfile) return toast('Please login first.');
    if (!bloodGroups.includes(bloodGroup)) return toast('Blood group is missing. Please search again.');
    const defaultLocation = donorLocation || myProfile.location || '';
    const body = `<form id="lifedrop-request-form" class="modal-form">
      <label>Patient name<input name="patient_name" required maxlength="100" placeholder="Patient full name"></label>
      <div class="form-grid"><label>Blood group<input value="${esc(bloodGroup)}" readonly></label><label>Units needed<input name="units" type="number" min="1" max="20" value="1" required></label></div>
      <label>Required date<input name="needed_date" type="date" min="${todayLocal()}" value="${todayLocal()}" required></label>
      <label>Hospital / location<input name="location" required maxlength="180" value="${esc(defaultLocation)}" placeholder="Hospital or area"></label>
      <label>Contact phone<input name="contact_phone" required maxlength="30" value="${esc(myProfile.phone || '')}" placeholder="Your phone number"></label>
      <label>Additional details<textarea name="details" maxlength="1000" placeholder="Optional details"></textarea></label>
      <p class="hint">Please confirm details before submitting. This request will be sent through your existing BloodDrop request workflow.</p>
      <div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Cancel</button><button type="submit" class="btn primary">Submit Request</button></div>
    </form>`;
    modal(`Request blood${donorName ? ` from ${donorName}` : ''}`, body);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
    document.getElementById('lifedrop-request-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const values = Object.fromEntries(form.entries());
      const units = Number(values.units);
      if (!Number.isInteger(units) || units < 1 || units > 20) return toast('Enter a valid number of units (1–20).');
      if (values.needed_date < todayLocal()) return toast('Required date cannot be in the past.');
      const submit = event.currentTarget.querySelector('[type="submit"]');
      submit.disabled = true; submit.textContent = 'Submitting…';
      try {
        const { data, error } = await db.rpc('send_lifedrop_donor_request_v2', {
          p_donor_id: donorId,
          p_patient_name: String(values.patient_name).trim(),
          p_blood_group: bloodGroup,
          p_units: units,
          p_needed_date: values.needed_date,
          p_location: String(values.location).trim(),
          p_contact_phone: String(values.contact_phone).trim(),
          p_details: String(values.details || '').trim() || null
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.message || 'Request could not be sent.');
        closeModal(); toast(`Request sent to ${donorName || 'the selected donor'}.`);
        page = 'My Requests'; renderNav(); await renderPage();
      } catch (error) { showError(error, 'Send request error'); submit.disabled = false; submit.textContent = 'Submit Request'; }
    });
  };

  window.adminConnectMatch = async function enhancedAdminConnect(matchId) {
    if (me?.role !== 'admin') return toast('Only admin can connect matches.');
    confirmModal('Connect donor?', 'This will approve this candidate match and notify both the donor and requester.', 'Connect donor', async () => {
      try { const { error } = await db.rpc('admin_connect_match', { p_match_id: matchId }); if (error) throw error; toast('Donor connected. Notifications have been sent.'); await renderPage(); }
      catch (error) { showError(error, 'Admin connect error'); }
    });
  };

  window.completeMatch = async function enhancedCompleteMatch(matchId) {
    confirmModal('Complete donation?', 'Confirm only after the blood donation has actually taken place.', 'Mark completed', async () => {
      try { const { error } = await db.rpc('complete_lifedrop_match', { p_match_id: matchId }); if (error) throw error; toast('Donation marked complete.'); page = 'Dashboard'; renderNav(); await renderPage(); }
      catch (error) { showError(error, 'Complete donation error'); }
    });
  };

  window.bindPage = function enhancedBindPage() {
    originalBindPage();
    document.querySelectorAll('[data-delete-notification]').forEach(button => {
      button.onclick = () => confirmModal('Delete notification?', 'This notification will be removed from your account.', 'Delete', async () => {
        try { const { error } = await db.from('notifications').delete().eq('id', button.dataset.deleteNotification).eq('user_id', session.user.id); if (error) throw error; toast('Notification deleted.'); await renderPage(); }
        catch (error) { showError(error, 'Delete notification error'); }
      }, true);
    });
    document.querySelectorAll('[data-refresh-dashboard]').forEach(button => button.onclick = () => renderPage());
  };

  // Support center: uses separate tables added by optional_features.sql.
  async function supportPage() {
    const { data: conversations, error } = await db.from('support_conversations').select('*').eq('user_id', session.user.id).order('updated_at', { ascending: false });
    if (error) throw error;
    const list = (conversations || []).map(c => `<button class="conversation-row" type="button" data-support-open="${esc(c.id)}"><span><b>${esc(c.subject || 'BloodDrop support')}</b><p>${esc(c.status || 'open')} · Updated ${esc(new Date(c.updated_at || c.created_at).toLocaleString())}</p></span><span class="soft-chip">Open chat →</span></button>`).join('');
    return `<section class="panel"><p class="eyebrow">WE ARE HERE TO HELP</p><h2>Help & Support</h2><p class="muted">Send a message to the BloodDrop admin team. Please do not share passwords or sensitive medical documents.</p><button class="btn primary" type="button" data-support-new>＋ Start a conversation</button></section><section class="panel"><h2>Your conversations</h2>${list || '<p class="empty-state">No support conversations yet. Start a new conversation when you need help.</p>'}</section>`;
  }

  async function supportInboxPage() {
    if (me?.role !== 'admin') return '<section class="panel"><p>Admin access required.</p></section>';
    const { data, error } = await db.from('support_conversations').select('id,user_id,subject,status,created_at,updated_at').order('updated_at', { ascending: false });
    if (error) throw error;
    const rows = await Promise.all((data || []).map(async c => {
      const { data: profile } = await db.from('profiles').select('full_name,email').eq('id', c.user_id).maybeSingle();
      return `<button class="conversation-row" type="button" data-support-open="${esc(c.id)}"><span><b>${esc(c.subject || 'Support conversation')}</b><p>${esc(profile?.full_name || profile?.email || 'User')} · ${esc(c.status || 'open')} · ${esc(new Date(c.updated_at || c.created_at).toLocaleString())}</p></span><span class="soft-chip">Open →</span></button>`;
    }));
    return `<section class="panel"><p class="eyebrow">ADMIN SUPPORT</p><h2>Support Inbox</h2><p class="muted">Review user conversations and reply to support requests.</p>${rows.join('') || '<p class="empty-state">No support conversations yet.</p>'}</section>`;
  }

  async function openSupportConversation(id) {
    supportConversationId = id;
    if (supportChannel) { await db.removeChannel(supportChannel); supportChannel = null; }
    let area = document.getElementById('support-thread-area');
    if (!area) { area = document.createElement('section'); area.id = 'support-thread-area'; area.className = 'panel'; document.getElementById('page-content')?.appendChild(area); }
    area.innerHTML = '<div class="loading-line">Loading conversation…</div>';
    await renderSupportThread();
  }

  async function renderSupportThread() {
    const area = document.getElementById('support-thread-area');
    if (!area || !supportConversationId) return;
    const { data: conversation, error: convError } = await db.from('support_conversations').select('*').eq('id', supportConversationId).maybeSingle();
    if (convError) throw convError;
    const { data: messages, error } = await db.from('support_messages').select('*').eq('conversation_id', supportConversationId).order('created_at', { ascending: true });
    if (error) throw error;
    area.innerHTML = `<div class="section-heading"><div><h2>${esc(conversation?.subject || 'Support conversation')}</h2><p class="muted">Status: ${esc(conversation?.status || 'open')}</p></div>${me?.role === 'admin' ? `<button class="btn outline" type="button" data-support-status>${conversation?.status === 'resolved' ? 'Reopen' : 'Mark resolved'}</button><button class="btn danger" type="button" data-support-delete-conversation="${esc(supportConversationId)}">Delete conversation</button>` : ''}</div>
      <div class="chat-thread" id="support-messages">${(messages || []).map(m => `<div class="chat-bubble ${m.sender_id === session.user.id ? 'mine' : ''}">${esc(m.message)}<small>${m.sender_id === session.user.id ? 'You' : 'Support'} · ${esc(new Date(m.created_at).toLocaleString())}</small></div>`).join('') || '<p class="empty-state">Send the first message to start this conversation.</p>'}</div>
      <form class="chat-compose" id="support-reply-form"><textarea name="message" required maxlength="3000" placeholder="Write your message…"></textarea><button class="btn primary" type="submit">Send</button></form>`;
    const thread = document.getElementById('support-messages'); if (thread) thread.scrollTop = thread.scrollHeight;
    document.getElementById('support-reply-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const form = new FormData(e.currentTarget); const message = String(form.get('message') || '').trim(); if (!message) return;
      const send = e.currentTarget.querySelector('button'); send.disabled = true;
      try { const { error: insertError } = await db.from('support_messages').insert({ conversation_id: supportConversationId, sender_id: session.user.id, message }); if (insertError) throw insertError; await db.from('support_conversations').update({ updated_at: new Date().toISOString() }).eq('id', supportConversationId); await renderSupportThread(); }
      catch (err) { showError(err, 'Support message error'); send.disabled = false; }
    });
    document.querySelector('[data-support-status]')?.addEventListener('click', async () => {
      const next = conversation.status === 'resolved' ? 'open' : 'resolved';
      try { const { error: updateError } = await db.rpc('admin_set_lifedrop_support_status', { p_conversation_id: supportConversationId, p_status: next }); if (updateError) throw updateError; toast(`Conversation ${next}.`); await renderSupportThread(); }
      catch (err) { showError(err, 'Support status error'); }
    });
    if (!supportChannel && db.channel) {
      supportChannel = db.channel(`support-${supportConversationId}-${Date.now()}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `conversation_id=eq.${supportConversationId}` }, () => renderSupportThread().catch(err => console.warn(err))).subscribe();
    }
  }

  function bindSupportPage() {
    document.querySelectorAll('[data-support-new]').forEach(button => button.onclick = () => {
      modal('Start a support conversation', `<form class="modal-form" id="support-new-form"><label>Subject<input name="subject" maxlength="120" required placeholder="What do you need help with?"></label><label>Message<textarea name="message" maxlength="3000" required placeholder="Describe your issue…"></textarea></label><div class="modal-actions"><button class="btn outline" type="button" data-modal-cancel>Cancel</button><button class="btn primary" type="submit">Create conversation</button></div></form>`);
      document.querySelector('[data-modal-cancel]')?.addEventListener('click', closeModal);
      document.getElementById('support-new-form')?.addEventListener('submit', async e => {
        e.preventDefault(); const f = new FormData(e.currentTarget); const subject = String(f.get('subject')).trim(); const message = String(f.get('message')).trim();
        try { const { data, error } = await db.from('support_conversations').insert({ user_id: session.user.id, subject }).select('id').single(); if (error) throw error; const { error: msgError } = await db.from('support_messages').insert({ conversation_id: data.id, sender_id: session.user.id, message }); if (msgError) throw msgError; closeModal(); toast('Support conversation created.'); await openSupportConversation(data.id); }
        catch (err) { showError(err, 'Create support conversation error'); }
      });
    });
    document.querySelectorAll('[data-support-open]').forEach(button => button.onclick = () => openSupportConversation(button.dataset.supportOpen).catch(err => showError(err, 'Open support conversation error')));
  }

  window.renderPage = async function enhancedRenderPage() {
    if (supportChannel) { await db.removeChannel(supportChannel); supportChannel = null; }
    const content = document.getElementById('page-content');
    if (page === 'Support' || page === 'Support Inbox') {
      if (!content) return;
      content.innerHTML = '<div class="panel loading-line">Loading support…</div>';
      try {
        content.innerHTML = page === 'Support' ? await supportPage() : await supportInboxPage();
        bindSupportPage();
        if (supportConversationId) {
          content.insertAdjacentHTML('beforeend', '<section class="panel" id="support-thread-area"><div class="loading-line">Loading conversation…</div></section>');
          await renderSupportThread();
        }
      } catch (error) {
        content.innerHTML = `<section class="panel"><h2>Support chat setup required</h2><p>${esc(error.message || 'Support tables are not available.')}</p><p class="muted">Ask the project administrator to run the optional support migration in optional_features.sql. Existing BloodDrop functions and tables are not changed by that migration.</p></section>`;
      }
    } else {
      await originalRenderPage();
    }
    await updateNotificationBell();
    addSupportLauncher();
  };

  // The bell is a shortcut to the existing notifications page.
  document.getElementById('notification-bell')?.addEventListener('click', async () => {
    page = 'Notifications'; renderNav(); await renderPage();
  });

  // Remove floating support shortcut on logout; refresh it after auth state changes.
  const oldShowAuth = showAuth;
  window.showAuth = function enhancedShowAuth() {
    removeSupportLauncher();
    if (supportChannel && db) db.removeChannel(supportChannel).catch(() => {});
    if (notificationChannel && db) db.removeChannel(notificationChannel).catch(() => {});
    supportChannel = null; notificationChannel = null; supportConversationId = null;
    oldShowAuth();
  };
  const oldShowApp = showApp;
  window.showApp = function enhancedShowApp() { oldShowApp(); addSupportLauncher(); updateNotificationBell(); subscribeNotifications(); };

  // Rebind the support launcher and notification count after initial load.
  document.addEventListener('DOMContentLoaded', () => { updateNotificationBell(); addSupportLauncher(); });
})();
