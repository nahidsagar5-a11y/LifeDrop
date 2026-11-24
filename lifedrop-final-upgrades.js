/* BloodDrop final UI upgrades - loaded after lifedrop-enhancements.js */
(function () {
  'use strict';
  const groups = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
  const safe = v => typeof esc === 'function' ? esc(v ?? '') : String(v ?? '');
  const oldDashboard = window.dashboard;
  const oldRender = window.renderPage;
  const oldPages = window.pages;
  let selectedGroup = '';

  window.pages = function () {
    const items = oldPages();
    if (me?.role === 'admin' && !items.includes('Donation History')) items.push('Donation History');
    return items;
  };

  // The original app keeps a page list in its classic-script scope. Render the
  // menu explicitly so the admin-only history page is always navigable.
  window.renderNav = function () {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const items = window.pages();
    nav.innerHTML = items.map(item => `<button type="button" class="${item === page ? 'active' : ''}" data-page="${safe(item)}">${safe(item)}</button>`).join('');
  }; 

  window.dashboard = async function () {
    const original = await oldDashboard();
    return original.replace(/<article class="blood-group-card">([\s\S]*?)<\/article>/g, (match, inner) => {
      const found = inner.match(/<span class="blood-type">([^<]+)<\/span>/);
      const group = found ? found[1].trim() : '';
      return `<button type="button" class="blood-group-card blood-group-click" data-group-open="${group}">${inner}<span class="card-link">View donors →</span></button>`;
    });
  };

  async function renderAdminNotifications() {
    const root=document.getElementById('page-content');
    const {data,error}=await db.from('notifications').select('*').order('created_at',{ascending:false}).limit(300);
    if(error) throw error;
    root.innerHTML=`<section class="panel"><p class="eyebrow">ADMIN CONTROL</p><h2>All notifications</h2><p class="muted">Review and remove notifications across BloodDrop accounts.</p></section>
      ${(data||[]).map(n=>`<article class="panel notification-card"><h3>${safe(n.title||'BloodDrop Notification')}</h3><p>${safe(n.message||'')}</p><small>User: ${safe(n.user_id)} · ${safe(n.created_at||'')}</small><div class="actions"><button class="btn danger" data-admin-delete-notification="${safe(n.id)}" type="button">Delete notification</button></div></article>`).join('') || '<section class="panel empty-state">No notifications found.</section>'}`;
    root.querySelectorAll('[data-admin-delete-notification]').forEach(b=>b.onclick=()=>window.lifeDropConfirm('Delete notification?','This removes the selected notification from the account.','Delete',async()=>{try{const {error}=await db.from('notifications').delete().eq('id',b.dataset.adminDeleteNotification);if(error)throw error;toast('Notification deleted.');await window.renderPage();}catch(err){showError(err,'Admin notification delete error');}},true));
  }

  async function donorCards(group, location = '') {
    const target = document.getElementById('donor-search-results');
    if (!target) return;
    target.innerHTML = '<section class="panel loading-line">Loading donor profiles…</section>';
    try {
      const { data, error } = await db.rpc('get_lifedrop_donor_cards', {
        p_blood_group: group, p_location: location.trim() || null
      });
      if (error) throw error;
      if (!data?.length) {
        target.innerHTML = `<section class="panel empty-state"><h3>No ${safe(group)} donors found</h3><p>Try another location or blood group.</p></section>`;
        return;
      }
      // Ratings are loaded independently from request/match history.
      let ratingRows = [];
      try {
        const ratingResult = await db.rpc('get_lifedrop_donor_ratings');
        if (!ratingResult.error && Array.isArray(ratingResult.data)) ratingRows = ratingResult.data;
        else {
          const reviews = await db.from('lifedrop_donor_reviews').select('donor_id,rating');
          if (!reviews.error && Array.isArray(reviews.data)) {
            const totals = new Map();
            reviews.data.forEach(row => {
              const key = String(row.donor_id), item = totals.get(key) || { total: 0, count: 0 };
              item.total += Number(row.rating) || 0; item.count += 1; totals.set(key, item);
            });
            ratingRows = [...totals.entries()].map(([donor_id,v]) => ({ donor_id, review_count:v.count, average_rating:v.total/v.count }));
          }
        }
      } catch (ratingError) { console.warn('Donor ratings unavailable:', ratingError); }
      const ratingMap = new Map(ratingRows.map(r => [String(r.donor_id), r]));
      function eligibilityFor(lastDate) {
        if (!lastDate) return { eligible:false, label:'Update last donation date', detail:'Eligibility cannot be calculated until the donor profile has a last-donation date.' };
        const parts=String(lastDate).slice(0,10).split('-').map(Number);
        if (parts.length!==3 || parts.some(n=>!Number.isFinite(n))) return {eligible:false,label:'Date unavailable',detail:'Please update the donor profile.'};
        const last=new Date(parts[0],parts[1]-1,parts[2]), today=new Date(); today.setHours(0,0,0,0);
        const elapsed=Math.floor((today-last)/86400000);
        if (!Number.isFinite(elapsed)||elapsed<0) return {eligible:false,label:'Check donation date',detail:'The recorded date is in the future.'};
        const remaining=Math.max(0,90-elapsed);
        return remaining===0
          ? {eligible:true,label:'Eligible by 90-day interval',detail:'Date-based interval reached. Medical fitness must still be confirmed.'}
          : {eligible:false,label:`Eligible in ${remaining} day${remaining===1?'':'s'}`,detail:'The app’s configured 90-day interval has not yet elapsed.'};
      }
      const cards = await Promise.all(data.map(async d => {
        let photo = '';
        if (d.photo_path) {
          try { const result = await db.storage.from('profile-photos').createSignedUrl(d.photo_path, 600); photo = result.data?.signedUrl || ''; } catch (_) {}
        }
        const initials = (d.donor_name || 'LD').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
        const rating=ratingMap.get(String(d.donor_id)), avg=Number(rating?.average_rating||0), count=Number(rating?.review_count||0);
        const pct=Math.max(0,Math.min(100,avg/5*100)), eligibility=eligibilityFor(d.last_donation_date);
        return `<article class="donor-card donor-detail-card">
          <button class="donor-card-open" type="button" data-donor-details="${safe(d.donor_id)}">
            <div class="donor-card-head"><div class="avatar avatar-small">${photo ? `<img src="${safe(photo)}" alt="Donor profile photo">` : safe(initials)}</div><div class="donor-card-title"><h3>${safe(d.donor_name || 'BloodDrop Donor')}</h3><div class="public-donor-rating" aria-label="${count?`${avg.toFixed(1)} out of 5, ${count} reviews`:'No ratings yet'}">${count?`<span class="rating-stars"><span class="stars-base">★★★★★</span><span class="stars-value" style="width:${pct}%">★★★★★</span></span><small class="rating-caption">${avg.toFixed(1)}/5 · ${count} review${count===1?'':'s'}</small>`:'<span class="rating-stars rating-empty">☆☆☆☆☆</span><small class="rating-caption rating-unrated">No reviews yet</small>'}</div><span class="soft-chip">${safe(d.blood_group)}</span></div></div>
            <div class="donor-meta"><span>⌖ ${safe(d.donor_location || 'Location not provided')}</span><span>Last donation: ${safe(d.last_donation_date || 'Not provided')}</span></div>
          </button>
          <div class="donor-eligibility ${eligibility.eligible?'eligibility-ready':'eligibility-wait'}"><strong>${eligibility.eligible?'✓ ':'◷ '}${safe(eligibility.label)}</strong><small>${safe(eligibility.detail)}</small></div>
          <div class="donor-card-actions"><button class="btn ${eligibility.eligible?'primary':'outline'}" type="button" ${eligibility.eligible?'':'disabled'} data-send-request="${safe(d.donor_id)}" data-blood-group="${safe(group)}" data-donor-name="${safe(d.donor_name)}" data-donor-location="${safe(d.donor_location || '')}">${eligibility.eligible?'Send Blood Request':safe(eligibility.label)}</button><button class="btn outline" type="button" data-donor-details="${safe(d.donor_id)}">View details</button></div>
        </article>`;
      }));
      target.innerHTML = `<section class="panel"><div class="section-heading"><div><p class="eyebrow">EXACT BLOOD GROUP RESULTS</p><h2>${safe(group)} Donors</h2><p class="muted">${data.length} donor(s) found. Only this blood group is shown.</p></div><span class="soft-chip">${safe(group)}</span></div></section><div class="donor-grid">${cards.join('')}</div>`;
      bindButtons(data);
    } catch (e) {
      target.innerHTML = `<section class="panel"><h3>Could not load donor cards</h3><p>${safe(e.message || 'Please try again.')}</p><p class="hint">Run the donor-card add-on SQL included in this ZIP.</p></section>`;
    }
  }

  function bindButtons(data) {
    document.querySelectorAll('[data-send-request]').forEach(b => b.onclick = () => window.sendDonorRequest(b.dataset.sendRequest,b.dataset.bloodGroup,b.dataset.donorName,b.dataset.donorLocation));
    document.querySelectorAll('[data-donor-details]').forEach(b => b.onclick = () => {
      const d = data.find(x => x.donor_id === b.dataset.donorDetails); if (!d) return;
      const body = `<div class="donor-detail-modal"><h3>${safe(d.donor_name || 'BloodDrop Donor')}</h3><p><b>Blood group:</b> ${safe(d.blood_group)}</p><p><b>Location:</b> ${safe(d.donor_location || 'Not provided')}</p><p><b>Phone:</b> ${safe(d.donor_phone || 'Not provided')}</p><p><b>Last donation:</b> ${safe(d.last_donation_date || 'Not provided')}</p><p class="hint">Please contact donors respectfully and confirm availability before arranging a donation.</p></div>`;
      window.lifeDropModal('Donor details', body);
    });
  }

  window.runDonorSearch = async function (group, location = '') {
    if (!groups.includes(group)) return toast('Please select a valid blood group.');
    selectedGroup = group;
    await donorCards(group, location);
  };

  window.renderPage = async function () {
    if (page === 'Donation History' && me?.role === 'admin') {
      const root = document.getElementById('page-content');
      if (root) root.innerHTML = '<div class="panel">Loading completed donation history…</div>';
      await renderDonationHistory();
      bindDashboardCards();
      return;
    }
    await oldRender();
    if (page === 'Requests & Matches' && me?.role === 'admin') {
      await appendCompletedHistoryToRequests();
      await appendAdminPendingRequestControls();
    }
    if (page === 'Search Blood' && selectedGroup) {
      const select = document.querySelector('#blood-search-form select[name="blood_group"]');
      if (select) select.value = selectedGroup;
      await donorCards(selectedGroup);
    }
    if (page === 'Donation History' && me?.role === 'admin') await renderDonationHistory();
    if (page === 'Notifications' && me?.role === 'admin') await renderAdminNotifications();
    bindDashboardCards();
  };


  async function appendAdminPendingRequestControls() {
    const root=document.getElementById('page-content'); if(!root||me?.role!=='admin') return;
    root.querySelectorAll('.admin-pending-controls').forEach(el=>el.remove());
    try {
      const {data:requests,error}=await db.from('blood_requests').select('id,patient_name,blood_group,units,needed_date,location,status,created_at').not('status','in','("Completed","Cancelled")').order('created_at',{ascending:false}).limit(200);
      if(error) throw error;
      const rows=(requests||[]).map(r=>`<article class="admin-pending-row"><div><b>${safe(r.patient_name||'Blood request')}</b><p>${safe(r.blood_group||'—')} · ${safe(r.units||1)} unit(s) · ${safe(r.needed_date||'—')} · ${safe(r.location||'—')}</p><small>Status: ${safe(r.status||'PENDING')}</small></div><div class="actions"><button type="button" class="btn outline" data-admin-cancel-request="${safe(r.id)}">Cancel</button><button type="button" class="btn danger" data-admin-delete-request="${safe(r.id)}">Delete</button></div></article>`).join('');
      root.insertAdjacentHTML('beforeend',`<section class="panel admin-pending-controls"><p class="eyebrow">ADMIN CONTROL</p><h2>Pending Request Management</h2><p class="muted">Cancel to retain the record, or delete a pending/cancelled request. Donor ratings and reviews are retained separately.</p>${rows||'<p class="empty-state">No pending requests to manage.</p>'}</section>`);
      root.querySelectorAll('[data-admin-cancel-request]').forEach(b=>b.onclick=()=>adminCancelRequest(b.dataset.adminCancelRequest));
      root.querySelectorAll('[data-admin-delete-request]').forEach(b=>b.onclick=()=>adminDeleteRequest(b.dataset.adminDeleteRequest));
    } catch(e) {
      root.insertAdjacentHTML('beforeend',`<section class="panel admin-pending-controls"><h2>Pending Request Management</h2><p>${safe(e.message||'Could not load pending requests.')}</p></section>`);
    }
  }
  function adminCancelRequest(requestId) {
    window.lifeDropModal('Cancel blood request',`<form id="admin-cancel-request-form" class="modal-form"><label>Reason<textarea name="reason" required minlength="5" maxlength="500"></textarea></label><div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Back</button><button type="submit" class="btn danger">Cancel request</button></div></form>`);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click',window.lifeDropCloseModal);
    document.getElementById('admin-cancel-request-form')?.addEventListener('submit',async e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')||'').trim();if(reason.length<5)return toast('Please enter a reason of at least 5 characters.');const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;try{const {error}=await db.rpc('cancel_lifedrop_blood_request',{p_request_id:requestId,p_reason:reason});if(error)throw error;window.lifeDropCloseModal();toast('Blood request cancelled.');await window.renderPage();}catch(err){showError(err,'Admin cancel request');btn.disabled=false;}});
  }
  function adminDeleteRequest(requestId) {
    window.lifeDropConfirm('Delete pending request?','This removes the selected request and its match rows. Completed donations are protected. Donor ratings are retained independently.','Delete request',async()=>{try{const {error}=await db.rpc('admin_delete_lifedrop_blood_request',{p_request_id:requestId});if(error)throw error;toast('Request deleted from Admin history.');await window.renderPage();}catch(err){showError(err,'Admin delete request');}},true);
  }

  async function loadCompletedMatchRows() {
    const { data: matches, error } = await db.from('matches').select('*').ilike('status', 'completed').order('created_at', { ascending: false }).limit(250);
    if (error) throw error;
    const rows = [];
    for (const match of (matches || [])) {
      const [requestResult, donorResult, requesterResult] = await Promise.all([
        db.from('blood_requests').select('*').eq('id', match.request_id).maybeSingle(),
        db.from('profiles').select('full_name, blood_group, location').eq('id', match.donor_id).maybeSingle(),
        db.from('profiles').select('full_name').eq('id', match.requester_id).maybeSingle()
      ]);
      if (requestResult.error) throw requestResult.error;
      if (donorResult.error) throw donorResult.error;
      if (requesterResult.error) throw requesterResult.error;
      const request = requestResult.data || {};
      const donor = donorResult.data || {};
      const requester = requesterResult.data || {};
      rows.push(`<article class="history-row completed-match-row"><div><b>${safe(request.patient_name || requester.full_name || 'Completed donation')}</b><p>Blood: ${safe(request.blood_group || donor.blood_group || '—')} · Units: ${safe(request.units ?? '—')} · Date: ${safe(match.updated_at || match.created_at || request.needed_date || '—')}</p><p>Donor: ${safe(donor.full_name || 'Donor')} · Location: ${safe(donor.location || request.location || '—')}</p><small>Status: COMPLETED · Record: ${safe(match.id)}</small></div><button class="btn danger" type="button" data-delete-completed-match="${safe(match.id)}">Delete history</button></article>`);
    }
    return rows;
  }

  async function renderDonationHistory() {
    const root = document.getElementById('page-content');
    try {
      const rows = await loadCompletedMatchRows();
      root.innerHTML = `<section class="panel requests-history-panel"><p class="eyebrow">ADMIN CONTROL</p><h2>Completed Donation History</h2><p class="muted">Completed donations are listed from Requests & Matches. Deleting removes only the completed match record.</p>${rows.join('') || '<p class="empty-state">No completed donation history found.</p>'}</section>`;
      bindCompletedMatchDeleteButtons(root);
    } catch (error) {
      root.innerHTML = `<section class="panel"><h2>Completed Donation History</h2><p>${safe(error.message || 'Could not load completed donations.')}</p></section>`;
    }
  }

  async function appendCompletedHistoryToRequests() {
    const root = document.getElementById('page-content');
    if (!root) return;
    // Prevent duplicate history panels if the page is rendered more than once.
    root.querySelectorAll('.requests-history-panel').forEach(panel => panel.remove());
    try {
      const rows = await loadCompletedMatchRows();
      root.insertAdjacentHTML('beforeend', `<section class="panel requests-history-panel"><p class="eyebrow">ADMIN CONTROL</p><h2>Completed Donation History</h2><p class="muted">Completed donations are listed here. Delete removes only the selected completed match record.</p>${rows.join('') || '<p class="empty-state">No completed donation history found.</p>'}</section>`);
      bindCompletedMatchDeleteButtons(root);
    } catch (error) {
      root.insertAdjacentHTML('beforeend', `<section class="panel requests-history-panel"><h2>Completed Donation History</h2><p>${safe(error.message || 'Could not load completed donations.')}</p></section>`);
    }
  }

  function bindCompletedMatchDeleteButtons(root) {
    root.querySelectorAll('[data-delete-completed-match]').forEach(button => {
      if (button.dataset.boundDelete) return;
      button.dataset.boundDelete = '1';
      button.onclick = () => window.lifeDropConfirm('Delete completed donation?', 'This permanently removes the selected completed match record. The blood request itself will remain.', 'Delete', async () => {
        try {
          const { error } = await db.rpc('admin_delete_lifedrop_completed_match', { p_match_id: button.dataset.deleteCompletedMatch });
          if (error) throw error;
          toast('Completed donation history deleted.');
          await window.renderPage();
        } catch (error) { showError(error, 'Delete completed donation error'); }
      }, true);
    });
  }

  function bindDashboardCards() {
    document.querySelectorAll('[data-group-open]').forEach(b => b.onclick = async () => {
      selectedGroup = b.dataset.groupOpen;
      page = 'Search Blood'; renderNav(); await window.renderPage();
      const select = document.querySelector('#blood-search-form select[name="blood_group"]');
      if (select) select.value = selectedGroup;
      await donorCards(selectedGroup);
    });
  }

  const oldSupportInbox = window.renderPage;
  // Add delete action to the support conversation thread when admin opens one.
  document.addEventListener('click', async e => {
    const btn = e.target.closest('[data-support-delete-conversation]');
    if (!btn || me?.role !== 'admin') return;
    window.lifeDropConfirm('Delete conversation?','This permanently deletes the conversation and its messages.','Delete',async()=>{
      try { const {error}=await db.rpc('admin_delete_lifedrop_support_conversation',{p_conversation_id:btn.dataset.supportDeleteConversation}); if(error)throw error; toast('Conversation deleted.'); page='Support Inbox'; await window.renderPage(); }
      catch(err){showError(err,'Delete conversation error');}
    },true);
  });


})();
