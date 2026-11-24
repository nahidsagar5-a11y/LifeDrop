/* Public homepage admin card.
   Admin profile photos are stored in a PRIVATE Supabase Storage bucket,
   therefore getPublicUrl() cannot display them. Use a short-lived signed URL
   for the exact photo_path returned by the limited public-admin RPC. */
(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  document.addEventListener('DOMContentLoaded', async () => {
    const card = document.getElementById('public-admin-card');
    if (!card || !window.supabase || !window.LIFEDROP_SUPABASE_URL || !window.LIFEDROP_SUPABASE_ANON_KEY) return;

    const client = window.supabase.createClient(
      window.LIFEDROP_SUPABASE_URL,
      window.LIFEDROP_SUPABASE_ANON_KEY
    );
    const area = document.getElementById('public-admin-contact');
    const toggle = document.getElementById('public-admin-contact-toggle');
    const photo = document.getElementById('public-admin-photo');
    const initials = card.querySelector('.admin-public-avatar span');
    let details = null;

    try {
      const { data, error } = await client.rpc('get_lifedrop_public_admin_profile');
      if (error) throw error;
      details = Array.isArray(data) ? data[0] : data;
      if (!details) {
        if (area) area.textContent = 'Admin contact information is not available yet.';
        if (toggle) toggle.hidden = true;
        return;
      }

      const heading = card.querySelector('h2');
      if (heading) heading.textContent = details.full_name || 'Nahid Sagar';

      if (photo && details.photo_path) {
        let signedUrl = '';
        // Current BloodDrop profile editor stores photos in profile-photos.
        const { data: signed, error: signError } = await client.storage
          .from('profile-photos')
          .createSignedUrl(details.photo_path, 3600);
        if (signError) throw signError;
        signedUrl = signed?.signedUrl || '';

        if (signedUrl) {
          photo.onload = () => {
            photo.hidden = false;
            if (initials) initials.hidden = true;
          };
          photo.onerror = () => {
            photo.hidden = true;
            if (initials) initials.hidden = false;
            console.warn('BloodDrop admin photo could not be loaded. Check the saved photo_path and Storage policy.');
          };
          photo.src = signedUrl;
        }
      }

      if (area) area.textContent = 'Contact details are available below.';
      if (toggle) toggle.hidden = false;
    } catch (error) {
      console.error('BloodDrop public admin card error:', error);
      if (area) area.textContent = 'Admin information could not be loaded. Check the public admin profile RPC and photo Storage policy.';
      if (toggle) toggle.hidden = true;
    }

    toggle?.addEventListener('click', () => {
      if (!details || !area) return;
      const email = String(details.email || '').trim();
      const phone = String(details.phone || '').trim();
      area.innerHTML = `<p><b>Email:</b> ${email ? `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>` : 'Not provided'}</p><p><b>Phone:</b> ${escapeHtml(phone || 'Not provided')}</p>`;
      toggle.hidden = true;
    });
  });
})();
