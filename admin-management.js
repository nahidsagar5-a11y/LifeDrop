/* BloodDrop admin donor/user management. Loaded after app.js. */
(function () {
  if (typeof window === 'undefined') return;

  window.adminDonors = async function adminDonors() {
    if (me?.role !== 'admin') return '<section class="panel"><p>Admin access required.</p></section>';
    const { data, error } = await db.from('profiles')
      .select('id,full_name,email,role,phone,blood_group,location,last_donation_date,photo_path,created_at')
      .in('role', ['donor', 'user']).order('created_at', { ascending: false });
    if (error) throw error;
    const { data: ratingRows, error: ratingError } = await db.rpc('get_lifedrop_donor_ratings');
    if (ratingError) throw ratingError;
    const ratingMap = new Map((ratingRows || []).map(r => [r.donor_id, r]));
    if (!data?.length) return '<section class="panel"><h2>Donors & users</h2><p>No registered profiles found.</p></section>';
    const cards = await Promise.all(data.map(async p => {
      let photoUrl = '';
      if (p.photo_path) {
        try {
          const { data: signed, error: photoError } = await db.storage.from('profile-photos').createSignedUrl(p.photo_path, 3600);
          if (!photoError) photoUrl = signed?.signedUrl || '';
          else console.warn('Admin donor photo could not be signed:', p.id, photoError.message);
        } catch (photoError) {
          console.warn('Admin donor photo could not be loaded:', p.id, photoError);
        }
      }
      const initials = esc((p.full_name || '?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase());
      const avatar = photoUrl
        ? `<img src="${esc(photoUrl)}" alt="${esc(p.full_name || 'Donor')} profile photo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="avatar-fallback" style="display:none">${initials}</span>`
        : `<span class="avatar-fallback">${initials}</span>`;
      const r=ratingMap.get(p.id), avg=Number(r?.average_rating||0), count=Number(r?.review_count||0), pct=Math.max(0,Math.min(100,avg/5*100));
      return `<article class="profile-card">
        <div class="profile-card-top"><div class="avatar avatar-small admin-donor-avatar">${avatar}</div><span class="soft-chip">${esc(p.role)}</span></div>
        <h3>${esc(p.full_name || 'Unnamed profile')}</h3><p class="muted">${esc(p.email || '')}</p>
        ${p.role==='donor' ? `<div class="donor-rating-inline"><span class="rating-stars"><span class="stars-base">★★★★★</span><span class="stars-value" style="width:${pct}%">★★★★★</span></span><small class="rating-caption">${avg.toFixed(1)}/5 · ${count} reviews</small></div>` : ''}
        <div class="profile-facts"><span><b>Blood group</b>${esc(p.blood_group || 'Not set')}</span><span><b>Phone</b>${esc(p.phone || 'Not provided')}</span><span><b>Location</b>${esc(p.location || 'Not provided')}</span><span><b>Last donation</b>${esc(p.last_donation_date || 'Not provided')}</span></div>
        <div class="actions admin-donor-actions"><button class="btn outline" type="button" data-admin-edit-profile="${esc(p.id)}">Edit profile</button><button class="btn danger" type="button" data-admin-delete-profile="${esc(p.id)}">Delete account</button>${p.role==='donor' ? `<button class="btn admin-private-message" type="button" data-admin-message-donor="${esc(p.id)}" data-donor-name="${esc(p.full_name || 'Donor')}">✉ Private Message</button>` : ''}</div>
      </article>`;
    }));
    return `<section class="panel"><div class="section-heading"><div><p class="eyebrow">ADMIN CONTROL</p><h2>Donors & users</h2><p class="muted">Review and manage registered accounts.</p></div><span class="soft-chip">${data.length} accounts</span></div></section>
      <div class="admin-profile-grid">${cards.join('')}</div>`;
  };

  async function editProfile(profileId) {
    if (me?.role !== 'admin') return toast('Admin access required.');
    const { data: p, error } = await db.from('profiles').select('id,full_name,phone,blood_group,location,last_donation_date').eq('id', profileId).maybeSingle();
    if (error) throw error;
    if (!p) throw new Error('Profile not found.');
    const options = ['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => `<option value="${g}" ${p.blood_group===g?'selected':''}>${g}</option>`).join('');
    window.lifeDropModal('Edit profile', `<form id="admin-edit-profile-form" class="modal-form">
      <label>Full name<input name="full_name" required maxlength="120" value="${esc(p.full_name || '')}"></label>
      <label>Phone<input name="phone" maxlength="30" value="${esc(p.phone || '')}"></label>
      <label>Blood group<select name="blood_group"><option value="">Not set</option>${options}</select></label>
      <label>Location<input name="location" maxlength="180" value="${esc(p.location || '')}"></label>
      <label>Last donation date<input name="last_donation_date" type="date" value="${esc(p.last_donation_date || '')}"></label>
      <div class="modal-actions"><button type="button" class="btn outline" data-modal-cancel>Cancel</button><button type="submit" class="btn primary">Save changes</button></div>
    </form>`);
    document.querySelector('[data-modal-cancel]')?.addEventListener('click', () => window.lifeDropCloseModal());
    document.getElementById('admin-edit-profile-form')?.addEventListener('submit', async e => {
      e.preventDefault(); const f = new FormData(e.currentTarget);
      const update = { full_name:String(f.get('full_name')||'').trim(), phone:String(f.get('phone')||'').trim()||null, blood_group:f.get('blood_group')||null, location:String(f.get('location')||'').trim()||null, last_donation_date:f.get('last_donation_date')||null };
      try { const { error: updateError } = await db.from('profiles').update(update).eq('id', profileId); if (updateError) throw updateError; window.lifeDropCloseModal(); toast('Profile updated successfully.'); await renderPage(); }
      catch (err) { showError(err, 'Admin edit profile error'); }
    });
  }

  async function deleteProfile(profileId) {
    if (me?.role !== 'admin') return toast('Admin access required.');
    if (profileId === session.user.id) return toast('You cannot delete your own admin account here.');
    window.lifeDropConfirm('Delete account?', 'This permanently deletes the selected account and related records. This cannot be undone.', 'Delete account', async () => {
      try { const { data, error } = await db.rpc('admin_delete_lifedrop_user', { p_user_id: profileId }); if (error) throw error; if (!data?.success) throw new Error(data?.message || 'Account could not be deleted.'); toast('Account deleted successfully.'); await renderPage(); }
      catch (err) { showError(err, 'Admin delete profile error'); }
    }, true);
  }

  const previousBind = window.bindPage;
  window.bindPage = function bindPageWithAdminManagement() {
    if (typeof previousBind === 'function') previousBind();
    document.querySelectorAll('[data-admin-edit-profile]').forEach(button => button.onclick = () => editProfile(button.dataset.adminEditProfile).catch(err => showError(err, 'Admin edit profile error')));
    document.querySelectorAll('[data-admin-delete-profile]').forEach(button => button.onclick = () => deleteProfile(button.dataset.adminDeleteProfile));
  };
})();
