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
      let ratingRows = [];
      const { data: publicRatings, error: publicRatingsError } = await db.rpc('get_lifedrop_donor_ratings');
      if (!publicRatingsError && Array.isArray(publicRatings)) ratingRows = publicRatings;
      else {
        const { data: reviews, error: reviewsError } = await db.from('lifedrop_donor_reviews').select('donor_id,rating');
        if (!reviewsError) {
          const totals = new Map();
          for (const review of (reviews || [])) {
            const key = String(review.donor_id);
            const item = totals.get(key) || { donor_id: review.donor_id, review_count: 0, total: 0 };
            item.review_count += 1; item.total += Number(review.rating) || 0; totals.set(key, item);
          }
          ratingRows = [...totals.values()].map(item => ({ donor_id: item.donor_id, review_count: item.review_count, average_rating: Math.round(item.total / item.review_count * 10) / 10 }));
        }
      }
      const ratingMap = new Map(ratingRows.map(r => [String(r.donor_id), r]));
      const cards = await Promise.all(data.map(async d => {
        let photo = '';
        if (d.photo_path) {
          try { const result = await db.storage.from('profile-photos').createSignedUrl(d.photo_path, 600); photo = result.data?.signedUrl || ''; } catch (_) {}
        }
        const initials = (d.donor_name || 'LD').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
        const rating = ratingMap.get(String(d.donor_id));
        const average = Number(rating?.average_rating || 0);
        const reviewCount = Number(rating?.review_count || 0);
        const ratingWidth = Math.max(0, Math.min(100, average / 5 * 100));
        const ratingMarkup = reviewCount
          ? `<span class="rating-stars"><span class="stars-base">★★★★★</span><span class="stars-value" style="width:${ratingWidth}%">★★★★★</span></span><small class="rating-caption">${average.toFixed(1)}/5 · ${reviewCount} review${reviewCount === 1 ? '' : 's'}</small>`
          : `<span class="rating-stars rating-empty">☆☆☆☆☆</span><small class="rating-caption rating-unrated">No reviews yet</small>`;
        return `<article class="donor-card donor-detail-card">
          <button class="donor-card-open" type="button" data-donor-details="${safe(d.donor_id)}">
            <div class="donor-card-head"><div class="avatar avatar-small">${photo ? `<img src="${safe(photo)}" alt="Donor profile photo">` : safe(initials)}</div><div><h3>${safe(d.donor_name || 'BloodDrop Donor')}</h3><div class="public-donor-rating">${ratingMarkup}</div><span class="soft-chip">${safe(d.blood_group)}</span></div></div>
            <div class="donor-meta"><span>⌖ ${safe(d.donor_location || 'Location not provided')}</span><span>Last donation: ${safe(d.last_donation_date || 'Not provided')}</span></div>
          </button>
          <div class="donor-card-actions"><button class="btn primary" type="button" data-send-request="${safe(d.donor_id)}" data-blood-group="${safe(group)}" data-donor-name="${safe(d.donor_name)}" data-donor-location="${safe(d.donor_location || '')}">Send Blood Request</button><button class="btn outline" type="button" data-donor-details="${safe(d.donor_id)}">View details</button></div>
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
