/* LifeDrop Admin Donors & Users patch
   Load this AFTER app.js. It leaves existing app features intact.
*/
(function () {
  if (typeof window === 'undefined') return;

  // Replace the broken Donors page: profiles.phone is the valid phone field.
  window.adminDonors = async function adminDonors() {
    if (me?.role !== 'admin') {
      return '<div class="panel"><p>Admin access required.</p></div>';
    }

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
          <p>No donor or user profiles found.</p>
        </div>`;
    }

    return `
      <div class="panel">
        <h2>Donors & Users Management</h2>
        <p class="muted">View, edit, or delete registered donor and user profiles.</p>
      </div>
      ${data.map(profile => `
        <div class="panel" style="margin-top:12px">
          <h3>${esc(profile.full_name || 'Unnamed profile')}</h3>
          <p><b>Account Type:</b> ${esc(profile.role || 'user')}</p>
          <p><b>Phone:</b> ${esc(profile.phone || 'Not provided')}</p>
          <p><b>Blood Group:</b> ${esc(profile.blood_group || 'Not provided')}</p>
          <p><b>Address:</b> ${esc(profile.location || 'Not provided')}</p>
          <p><b>Last Donation:</b> ${esc(profile.last_donation_date || 'Not provided')}</p>
          <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn primary" type="button"
              data-admin-edit-profile="${esc(profile.id)}">Edit Profile</button>
            <button class="btn outline" type="button"
              data-admin-delete-profile="${esc(profile.id)}">Delete Profile</button>
          </div>
        </div>
      `).join('')}
    `;
  };

  async function editAdminProfile(profileId) {
    if (me?.role !== 'admin') {
      toast('Admin access required.');
      return;
    }

    const { data: profile, error: loadError } = await db
      .from('profiles')
      .select('id, full_name, phone, blood_group, location, last_donation_date')
      .eq('id', profileId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!profile) throw new Error('Profile not found.');

    const full_name = prompt('Full name:', profile.full_name || '');
    if (full_name === null) return;

    const phone = prompt('Phone number:', profile.phone || '');
    if (phone === null) return;

    const blood_group = prompt(
      'Blood group (A+, A-, B+, B-, AB+, AB-, O+, O-):',
      profile.blood_group || ''
    );
    if (blood_group === null) return;
    if (blood_group.trim() && !groups.includes(blood_group.trim())) {
      toast('Invalid blood group.');
      return;
    }

    const location = prompt('Address / location:', profile.location || '');
    if (location === null) return;

    const last_donation_date = prompt(
      'Last donation date (YYYY-MM-DD, blank if none):',
      profile.last_donation_date || ''
    );
    if (last_donation_date === null) return;

    const update = {
      full_name: full_name.trim(),
      phone: phone.trim() || null,
      blood_group: blood_group.trim() || null,
      location: location.trim() || null,
      last_donation_date: last_donation_date.trim() || null
    };

    const { error } = await db
      .from('profiles')
      .update(update)
      .eq('id', profileId);

    if (error) throw error;

    toast('Profile updated successfully.');
    await renderPage();
  }

  async function deleteAdminProfile(profileId) {
    if (me?.role !== 'admin') {
      toast('Admin access required.');
      return;
    }

    if (profileId === session.user.id) {
      toast('You cannot delete your own admin account here.');
      return;
    }

    if (!confirm(
      'Permanently delete this user account and its profile? This cannot be undone.'
    )) return;

    const { data, error } = await db.rpc('admin_delete_lifedrop_user', {
      p_user_id: profileId
    });

    if (error) throw error;
    if (!data?.success) {
      toast(data?.message || 'Account could not be deleted.');
      return;
    }

    toast('User account deleted successfully.');
    await renderPage();
  }

  // Keep all existing click handlers, then attach the new admin controls.
  const previousBindPage = window.bindPage;
  window.bindPage = function bindPageWithAdminManagement() {
    if (typeof previousBindPage === 'function') previousBindPage();

    document.querySelectorAll('[data-admin-edit-profile]').forEach(button => {
      button.onclick = async () => {
        try {
          await editAdminProfile(button.dataset.adminEditProfile);
        } catch (error) {
          showError(error, 'Admin edit profile error');
        }
      };
    });

    document.querySelectorAll('[data-admin-delete-profile]').forEach(button => {
      button.onclick = async () => {
        try {
          await deleteAdminProfile(button.dataset.adminDeleteProfile);
        } catch (error) {
          showError(error, 'Admin delete profile error');
        }
      };
    });
  };
})();
