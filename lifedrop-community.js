/* BloodDrop community workflow: donor confirmation, mutual profiles, completion,
   cancellation reasons, public donor reviews, and dashboard admin card. */
(() => {
  'use strict';
  if (window.__lifedropCommunityLoaded) return;
  window.__lifedropCommunityLoaded = true;
  const oldPages = window.pages;
  const oldRenderPage = window.renderPage;
  const oldDashboard = window.dashboard;
  const safe = v => esc(v ?? '');
  const statusLabel = s => String(s || '').replaceAll('_',' ').toUpperCase();
  const notifyRefresh = async () => { renderNav(); await renderPage(); };

  window.pages = function communityPages() {
    const items = oldPages ? oldPages() : [];
    if (me?.role === 'donor' && !items.includes('Donor Requests')) items.splice(Math.max(0, items.indexOf('My Requests')), 0, 'Donor Requests');
    if (me && !items.includes('Connected Profiles')) items.push('Connected Profiles');
    if (me && !items.includes('Donor Reviews')) items.push('Donor Reviews');
    if (me?.role === 'admin' && !items.includes('Manage Reviews')) items.push('Manage Reviews');
    return items;
  };
  window.renderNav = function communityNav() {
    const nav = document.getElementById('nav'); if (!nav) return;
    nav.innerHTML = window.pages().map(item => `<button type="button" class="${item === page ? 'active' : ''}" data-page="${safe(item)}">${safe(item)}</button>`).join('');
    nav.querySelectorAll('[data-page]').forEach(b => b.onclick = async () => { page = b.dataset.page; renderNav(); await renderPage(); });
  };

  async function adminMeetCard() {
    try {
      const {data,error} = await db.rpc('get_lifedrop_public_admin_profile'); if (error) throw error;
      const p = Array.isArray(data) ? data[0] : data; if (!p) return '<section class="panel meet-admin-card"><p class="eyebrow">LIFEDROP TEAM</p><h2>Meet the Admin</h2><p class="muted">Admin information is not available.</p></section>';
      let photo='';
      if (p.photo_path) { const r=await db.storage.from('profile-photos').createSignedUrl(p.photo_path,600); photo=r.data?.signedUrl||''; }
      const initials=(p.full_name||'BloodDrop Admin').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
      return `<section class="panel meet-admin-card"><p class="eyebrow">LIFEDROP TEAM</p><div class="meet-admin-avatar">${photo?`<img src="${safe(photo)}" alt="Admin profile">`:safe(initials)}</div><div><h2>Meet the Admin</h2><h3>${safe(p.full_name||'BloodDrop Admin')}</h3><span class="soft-chip">BloodDrop Project Admin</span><p class="muted">Helping people connect with blood donors safely.</p></div><div class="meet-admin-actions">${p.email?`<a class="btn outline" href="mailto:${safe(p.email)}">✉ Email Admin</a>`:''}${p.phone?`<a class="btn primary" href="tel:${safe(p.phone)}">☎ Contact Admin</a>`:''}</div></section>`;
    } catch(e) { console.warn('Meet Admin card:',e.message); return '<section class="panel meet-admin-card"><p class="eyebrow">LIFEDROP TEAM</p><h2>Meet the Admin</h2><p class="muted">Admin profile is temporarily unavailable.</p></section>'; }
  }

  async function publicReviews(limit=30) {
    const {data,error}=await db.rpc('get_lifedrop_public_donor_reviews',{p_limit:limit});
    if(error) throw error;
    return data||[];
  }
  function starDisplay(avg,count) { const pct=Math.max(0,Math.min(100,(Number(avg)||0)/5*100)); const n=Number(count)||0; return `<span class=\"rating-stars\" aria-label=\"${Number(avg||0).toFixed(1)} out of 5\"><span class=\"stars-base\">★★★★★</span><span class=\"stars-value\" style=\"width:${pct}%\">★★★★★</span></span><span class=\"rating-caption\">${Number(avg||0).toFixed(1)}/5 · ${n} review${n===1?'':'s'}</span>`; }
  function reviewsMarkup(rows) {
    return `<section class="panel reviews-panel"><div class="section-heading"><div><p class="eyebrow">COMMUNITY FEEDBACK</p><h2>Donor Reviews</h2><p class="muted">Reviews shared by blood requesters. Everyone can read them.</p></div><span class="soft-chip">${rows.length} reviews</span></div>${rows.length?`<div class="review-grid">${rows.map(r=>`<article class="review-card"><div class="review-stars">${starDisplay(r.rating,1)}</div><h3>${safe(r.donor_name||'BloodDrop Donor')}</h3><p>${safe(r.review_text)}</p><small>By ${safe(r.reviewer_name||'Requester')} · ${safe(r.created_at?new Date(r.created_at).toLocaleDateString():'')}</small></article>`).join('')}</div>`:'<p class="empty-state">No donor reviews yet. Completed donations can be reviewed by the requester.</p>'}</section>`;
  }

  window.dashboard = async function communityDashboard() {
    const base=await oldDashboard();
    let admin=await adminMeetCard();
    let reviews='';
    try { reviews=reviewsMarkup(await publicReviews(12)); } catch(e) { console.warn('Public reviews unavailable:',e.message); }
    return `${base}<div class="community-dashboard-grid">${admin}</div>${reviews}`;
  };

  async function donorRequestsPage() {
    const {data:matches,error}=await db.from('matches').select('*').eq('donor_id',session.user.id).in('status',['pending_donor','candidate']).order('created_at',{ascending:false});
    if(error) throw error;
    const cards=[];
    for(const m of matches||[]) {
      const {data:r,error:re}=await db.from('blood_requests').select('*').eq('id',m.request_id).maybeSingle(); if(re) throw re; if(!r) continue;
      cards.push(`<article class="panel workflow-card"><div class="workflow-card-top"><span class="soft-chip">NEW BLOOD REQUEST</span><span class="status-pill pending">${safe(statusLabel(m.status))}</span></div><h3>Patient: ${safe(r.patient_name)}</h3><div class="workflow-facts"><span>🩸 <b>${safe(r.blood_group)}</b></span><span>Units: ${safe(r.units)}</span><span>📅 ${safe(r.needed_date)}</span><span>📍 ${safe(r.location)}</span><span>☎ ${safe(r.contact_phone)}</span></div><p>${safe(r.details||'No extra details provided.')}</p><div class="workflow-actions"><button class="btn primary" data-donor-accept="${safe(m.id)}">✓ Confirm Request</button><button class="btn danger" data-donor-decline="${safe(m.id)}">✕ Cannot Donate</button></div></article>`);
    }
    return `<section class="panel"><p class="eyebrow">DONOR CENTER</p><h2>Blood Requests for You</h2><p class="muted">Confirm only when you are available and willing to donate.</p></section>${cards.join('')||'<section class="panel empty-state">No new blood requests right now.</section>'}`;
  }

  async function myRequestsPage() {
    const {data:requests,error}=await db.from('blood_requests').select('*').eq('requester_id',session.user.id).order('created_at',{ascending:false}); if(error) throw error;
    const cards=[];
    for(const r of requests||[]) {
      const {data:matches,error:me}=await db.from('matches').select('*').eq('request_id',r.id).order('created_at',{ascending:false}); if(me) throw me;
      const items=[];
      for(const m of matches||[]) {
        let donor='';
        if(['connected','completed'].includes(m.status)) { const {data:p,error:pe}=await db.rpc('get_lifedrop_connected_profile',{p_match_id:m.id}); if(pe) throw pe; donor=p?.full_name||'Connected donor'; }
        items.push(`<div class="match-mini"><div><b>${safe(donor||'Donor response pending')}</b><p class="muted">${safe(statusLabel(m.status))}${m.status==='cancelled'&&m.cancel_reason?` · Reason: ${safe(m.cancel_reason)}`:''}</p></div>${['connected','completed'].includes(m.status)?`<button class="btn outline" data-open-connected>View connection</button>`:''}</div>`);
      }
      const canCancel = !['completed','cancelled'].includes(String(r.status || '').toLowerCase());
      cards.push(`<article class="panel workflow-card"><span class="soft-chip">${safe(r.blood_group)} · ${safe(r.units)} unit(s)</span><h3>${safe(r.patient_name)}</h3><p>📅 ${safe(r.needed_date)} · 📍 ${safe(r.location)}</p><p class="muted">${items.join('')||'Waiting for donor response.'}</p>${canCancel ? `<div class="workflow-actions"><button type="button" class="btn danger" data-requester-cancel="${safe(r.id)}">Cancel Blood Request</button></div>` : `<p class="hint">Request status: ${safe(r.status || 'Completed')}</p>`}</article>`);
    }
    return `<section class="panel"><p class="eyebrow">REQUEST TRACKER</p><h2>My Blood Requests</h2><p class="muted">When a donor confirms, their contact profile becomes visible here and in Connected Profiles.</p></section>${cards.join('')||'<section class="panel empty-state">You have not submitted any blood requests yet.</section>'}`;
  }

  async function connectedPage() {
    const {data:matches,error}=await db.from('matches').select('*').in('status',['connected','completed']).order('connected_at',{ascending:false}); if(error) throw error;
    const mine=(matches||[]).filter(m=>m.requester_id===session.user.id||m.donor_id===session.user.id);
    const cards=[];
    for(const m of mine) {
      const {data:p,error:pe}=await db.rpc('get_lifedrop_connected_profile',{p_match_id:m.id}); if(pe) throw pe;
      const {data:r,error:re}=await db.from('blood_requests').select('patient_name,blood_group,units,needed_date,location').eq('id',m.request_id).maybeSingle(); if(re) throw re;
      if(!p) continue;
      const isRequester=m.requester_id===session.user.id;
      let review='';
      if(isRequester&&m.status==='completed') {
        const {data:existing,error:ee}=await db.from('lifedrop_donor_reviews').select('id').eq('match_id',m.id).maybeSingle(); if(ee&&ee.code!=='PGRST116') throw ee;
        review=existing?'<span class="soft-chip">Review submitted</span>':`<button class="btn outline" data-review-open="${safe(m.id)}" data-donor-name="${safe(p.full_name)}">★ Review donor</button>`;
      }
      cards.push(`<article class="panel workflow-card"><div class="workflow-card-top"><span class="soft-chip">${m.status==='completed'?'DONATION COMPLETED':'CONNECTED'}</span><span class="status-pill ${m.status==='completed'?'done':'active'}">${safe(statusLabel(m.status))}</span></div><div class="connected-person"><div class="connected-avatar">${safe((p.full_name||'U').slice(0,1).toUpperCase())}</div><div><h3>${safe(p.full_name||'Connected member')}</h3><p class="muted">${isRequester?'Donor profile':'Blood requester profile'}</p></div></div><div class="workflow-facts"><span>🩸 ${safe(p.blood_group||'—')}</span><span>📍 ${safe(p.location||'—')}</span><span>☎ ${safe(p.phone||'Not shared')}</span><span>✉ ${safe(p.email||'Not shared')}</span></div><hr><p><b>Patient:</b> ${safe(r?.patient_name||'—')} · <b>Blood:</b> ${safe(r?.blood_group||'—')} · <b>Hospital:</b> ${safe(r?.location||'—')}</p><div class="workflow-actions">${m.status==='connected'?`<button class="btn primary" data-workflow-complete="${safe(m.id)}">✓ Complete Donation</button><button class="btn danger" data-workflow-cancel="${safe(m.id)}">Cancel Donation</button>`:''}${review}</div></article>`);
    }
    return `<section class="panel"><p class="eyebrow">PRIVATE CONNECTIONS</p><h2>Connected Profiles</h2><p class="muted">Only the two members in an accepted match can see each other's contact profile.</p></section>${cards.join('')||'<section class="panel empty-state">No accepted donor connections yet.</section>'}`;
  }

  async function reviewsPage() { try { return reviewsMarkup(await publicReviews(100)); } catch(e) { return `<section class="panel"><h2>Donor Reviews</h2><p>${safe(e.message)}</p><p class="hint">Run the Community Workflow SQL migration.</p></section>`; } }

  async function adminReviewsPage() {
    if(me?.role!=='admin') return '<section class="panel">Admin access required.</section>';
    const rows=await publicReviews(200);
    return `<section class="panel"><p class="eyebrow">ADMIN CONTROL</p><h2>Manage Donor Reviews</h2><p class="muted">Edit the star rating or review text, or remove a review. Donor averages update automatically.</p><span class="soft-chip">${rows.length} reviews</span></section>${rows.map(r=>`<article class="panel review-card admin-review-card"><div class="review-stars">${starDisplay(r.rating,1)}</div><h3>${safe(r.donor_name||'Donor')}</h3><p>${safe(r.review_text)}</p><small>Reviewer: ${safe(r.reviewer_name||'Requester')} · ${safe(r.created_at?new Date(r.created_at).toLocaleDateString():'')}</small><div class="workflow-actions"><button class="btn outline" data-admin-review-edit="${safe(r.review_id)}" data-rating="${safe(r.rating)}" data-review-text="${safe(r.review_text)}">Edit review</button><button class="btn danger" data-admin-review-delete="${safe(r.review_id)}">Delete review</button></div></article>`).join('')||'<section class="panel empty-state">No reviews to manage yet.</section>'}`;
  }
  function adminEditReviewModal(id,rating,reviewText) {
    const options=[1,2,3,4,5].map(n=>`<option value="${n}" ${Number(rating)===n?'selected':''}>${'★'.repeat(n)} (${n}/5)</option>`).join('');
    window.lifeDropModal('Edit donor review',`<form id="admin-review-edit-form" class="modal-form"><label>Star rating<select name="rating" required>${options}</select></label><label>Review text<textarea name="review_text" required minlength="5" maxlength="1000">${safe(reviewText)}</textarea></label><div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Cancel</button><button type="submit" class="btn primary">Save review</button></div></form>`);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click',window.lifeDropCloseModal);
    document.getElementById('admin-review-edit-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const {error}=await db.rpc('admin_update_lifedrop_donor_review',{p_review_id:id,p_rating:Number(f.get('rating')),p_review_text:String(f.get('review_text')||'').trim()});if(error)throw error;window.lifeDropCloseModal();toast('Review updated. Donor rating recalculated.');await notifyRefresh();}catch(err){showError(err,'Admin edit review');}});
  }


  window.renderPage = async function communityRenderPage() {
    const root=document.getElementById('page-content');
    try {
      if(page==='Donor Requests'&&me?.role==='donor') root.innerHTML=await donorRequestsPage();
      else if(page==='My Requests'&&me?.role!=='admin') root.innerHTML=await myRequestsPage();
      else if(page==='Connected Profiles') root.innerHTML=await connectedPage();
      else if(page==='Donor Reviews') root.innerHTML=await reviewsPage();
      else if(page==='Manage Reviews'&&me?.role==='admin') root.innerHTML=await adminReviewsPage();
      else { await oldRenderPage(); return; }
      bindWorkflow(root);
    } catch(e) { root.innerHTML=`<section class="panel"><h2>Could not load this section</h2><p>${safe(e.message||'Please try again.')}</p><p class="hint">Check that the Community Workflow SQL migration has been run.</p></section>`; }
  };

  function bindWorkflow(root) {
    root.querySelectorAll('[data-requester-cancel]').forEach(b=>b.onclick=()=>requesterCancelRequest(b.dataset.requesterCancel));
    root.querySelectorAll('[data-donor-accept]').forEach(b=>b.onclick=()=>window.lifeDropConfirm('Confirm blood request?','Your profile and contact details will become visible to the requester after confirmation.','Confirm',async()=>{try{const {error}=await db.rpc('donor_respond_lifedrop_match',{p_match_id:b.dataset.donorAccept,p_accept:true,p_reason:null});if(error)throw error;toast('Request confirmed. Both profiles are now connected.');await notifyRefresh();}catch(e){showError(e,'Confirm request');}}));
    root.querySelectorAll('[data-donor-decline]').forEach(b=>b.onclick=()=>reasonModal(b.dataset.donorDecline,'decline'));
    root.querySelectorAll('[data-workflow-cancel]').forEach(b=>b.onclick=()=>reasonModal(b.dataset.workflowCancel,'cancel'));
    root.querySelectorAll('[data-workflow-complete]').forEach(b=>b.onclick=()=>window.lifeDropConfirm('Complete donation?','Confirm only after the blood donation has actually taken place. This updates the donor’s last donation date.','Complete',async()=>{try{const {error}=await db.rpc('complete_lifedrop_match_v2',{p_match_id:b.dataset.workflowComplete});if(error)throw error;toast('Donation completed and donor date updated.');await notifyRefresh();}catch(e){showError(e,'Complete donation');}}));
    root.querySelectorAll('[data-review-open]').forEach(b=>b.onclick=()=>reviewModal(b.dataset.reviewOpen,b.dataset.donorName));
    root.querySelectorAll('[data-admin-review-edit]').forEach(b=>b.onclick=()=>adminEditReviewModal(b.dataset.adminReviewEdit,b.dataset.rating,b.dataset.reviewText));
    root.querySelectorAll('[data-admin-review-delete]').forEach(b=>b.onclick=()=>window.lifeDropConfirm('Delete this review?','This review will be permanently removed and the donor average will be recalculated.','Delete',async()=>{try{const {error}=await db.rpc('admin_delete_lifedrop_donor_review',{p_review_id:b.dataset.adminReviewDelete});if(error)throw error;toast('Review deleted. Donor rating recalculated.');await notifyRefresh();}catch(err){showError(err,'Admin delete review');}},true));
  }

  function requesterCancelRequest(requestId) {
    window.lifeDropModal('Cancel blood request',`<form id="requester-cancel-form" class="modal-form"><label>Reason<textarea name="reason" required minlength="5" maxlength="500" placeholder="Why do you need to cancel this request?"></textarea></label><div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Back</button><button type="submit" class="btn danger">Cancel request</button></div></form>`);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click',window.lifeDropCloseModal);
    document.getElementById('requester-cancel-form')?.addEventListener('submit',async e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')||'').trim();if(reason.length<5)return toast('Please enter a reason of at least 5 characters.');const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;try{const {error}=await db.rpc('cancel_lifedrop_blood_request',{p_request_id:requestId,p_reason:reason});if(error)throw error;window.lifeDropCloseModal();toast('Your blood request has been cancelled.');await notifyRefresh();}catch(err){showError(err,'Cancel blood request');btn.disabled=false;}});
  }

  function reasonModal(matchId,mode) {
    const title=mode==='decline'?'Why can’t you donate?':'Cancel this donation?';
    const body=`<form id="workflow-reason-form" class="modal-form"><label>Reason<textarea name="reason" required minlength="5" maxlength="500" placeholder="Please explain why you cannot donate..."></textarea></label><div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Back</button><button type="submit" class="btn danger">${mode==='decline'?'Submit reason':'Confirm cancellation'}</button></div></form>`;
    window.lifeDropModal(title,body); document.querySelector('[data-modal-cancel]')?.addEventListener('click',window.lifeDropCloseModal);
    document.getElementById('workflow-reason-form')?.addEventListener('submit',async e=>{e.preventDefault();const reason=String(new FormData(e.currentTarget).get('reason')||'').trim();if(reason.length<5)return toast('Please enter a clear reason.');const btn=e.currentTarget.querySelector('[type="submit"]');btn.disabled=true;try{const {error}=await db.rpc('donor_respond_lifedrop_match',{p_match_id:matchId,p_accept:false,p_reason:reason});if(error)throw error;window.lifeDropCloseModal();toast(mode==='decline'?'Reason sent to the requester.':'Donation cancelled. Both members were notified.');await notifyRefresh();}catch(err){showError(err,'Cancel donation');btn.disabled=false;}});
  }
  function reviewModal(matchId,donorName) {
    window.lifeDropModal(`Review ${donorName||'donor'}`,`<form id="donor-review-form" class="modal-form"><label>Your star rating</label><div class="star-picker" role="radiogroup" aria-label="Choose 1 to 5 stars">${[1,2,3,4,5].map(n=>`<button type="button" class="star-pick ${n===5?'selected':''}" data-pick-star="${n}" aria-label="${n} stars">★</button>`).join('')}</div><input type="hidden" name="rating" value="5"><label>Your review<textarea name="review_text" required minlength="5" maxlength="1000" placeholder="Write about your donation experience..."></textarea></label><div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Cancel</button><button class="btn primary" type="submit">Submit review</button></div></form>`);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click',window.lifeDropCloseModal);
    document.querySelectorAll('[data-pick-star]').forEach(b=>b.onclick=()=>{const n=Number(b.dataset.pickStar);const form=document.getElementById('donor-review-form');form.querySelector('[name=rating]').value=String(n);form.querySelectorAll('[data-pick-star]').forEach(x=>x.classList.toggle('selected',Number(x.dataset.pickStar)<=n));});
    document.getElementById('donor-review-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const {error}=await db.rpc('submit_lifedrop_donor_review',{p_match_id:matchId,p_rating:Number(f.get('rating')),p_review_text:String(f.get('review_text')).trim()});if(error)throw error;window.lifeDropCloseModal();toast('Thank you. Your review is now public.');await notifyRefresh();}catch(err){showError(err,'Submit donor review');}});
  }

  document.addEventListener('DOMContentLoaded',()=>{
    const root=document.getElementById('page-content'); if(root) root.addEventListener('click',e=>{const b=e.target.closest('[data-open-connected]');if(b){page='Connected Profiles';renderNav();renderPage();}});
  });
})();
