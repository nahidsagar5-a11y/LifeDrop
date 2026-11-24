/* Public homepage admin card: displays only the admin contact fields approved for this card. */
document.addEventListener('DOMContentLoaded', async () => {
  const card = document.getElementById('public-admin-card');
  if (!card || !window.supabase || !window.LIFEDROP_SUPABASE_URL || !window.LIFEDROP_SUPABASE_ANON_KEY) return;
  const client = window.supabase.createClient(window.LIFEDROP_SUPABASE_URL, window.LIFEDROP_SUPABASE_ANON_KEY);
  const area = document.getElementById('public-admin-contact');
  const toggle = document.getElementById('public-admin-contact-toggle');
  let details = null;
  try {
    const {data,error}=await client.rpc('get_lifedrop_public_admin_profile');
    if(error) throw error;
    details=data?.[0] || null;
    if(details){
      card.querySelector('h2').textContent=details.full_name || 'Nahid Sagar';
      const photo = document.getElementById('public-admin-photo');
      const initials = card.querySelector('.admin-public-avatar span');
      if (photo && details.photo_path) {
        const publicPhoto = client.storage.from('profile-photos').getPublicUrl(details.photo_path);
        if (publicPhoto?.data?.publicUrl) {
          photo.src = publicPhoto.data.publicUrl;
          photo.hidden = false;
          if (initials) initials.hidden = true;
          photo.onerror = () => { photo.hidden = true; if (initials) initials.hidden = false; };
        }
      }
      area.textContent='Contact details are available below.';
      toggle.hidden=false;
    } else { area.textContent='Admin contact information is not available yet.'; toggle.hidden=true; }
  } catch(e){ area.textContent='Run the public admin card add-on SQL to load contact information.'; }
  toggle?.addEventListener('click',()=>{
    if(!details) return;
    area.innerHTML=`<p><b>Email:</b> <a href="mailto:${String(details.email||'').replace(/["<>]/g,'')}">${String(details.email||'Not provided').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</a></p><p><b>Phone:</b> ${String(details.phone||'Not provided').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}</p>`;
    toggle.hidden=true;
  });
});
