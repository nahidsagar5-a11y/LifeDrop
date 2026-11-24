/* BloodDrop home education popups and private admin-to-donor chat launcher. */
(() => {
  'use strict';
  const education = {
    why: {
      title: 'কেন রক্তদান করবেন?',
      body: `<p>আপনার দান করা রক্ত জরুরি অস্ত্রোপচার, দুর্ঘটনা, প্রসবজনিত জটিলতা, ক্যানসারসহ নানা চিকিৎসায় একজন রোগীর জীবন রক্ষায় সহায়তা করতে পারে। রক্তের বিকল্প নেই—রক্তের প্রয়োজন হলে সুস্থ ও যোগ্য মানুষের স্বেচ্ছায় দান করা রক্তই ভরসা।</p>
      <ul><li>আপনার স্বেচ্ছায় দেওয়া রক্ত একজন মানুষের জীবন বাঁচাতে সাহায্য করতে পারে।</li><li>রক্তদান সমাজে সহমর্মিতা, মানবিকতা ও পারস্পরিক সহযোগিতা বাড়ায়।</li><li>আজ আপনি কারও পাশে দাঁড়ালে ভবিষ্যতে আপনার প্রয়োজনেও অন্য কেউ এগিয়ে আসতে পারেন।</li><li>রক্তদানের আগে স্বাস্থ্য পরীক্ষা করা হয়; নিজের স্বাস্থ্য ও যোগ্যতা সম্পর্কে চিকিৎসাকর্মীর নির্দেশনা মেনে চলুন।</li></ul>
      <p class="education-caution">শুধু স্বাস্থ্যগত উপকার পাওয়ার আশায় রক্তদান করবেন না। রক্তদান নিরাপদ কি না, তা নির্ভর করে আপনার স্বাস্থ্য ও চিকিৎসাকেন্দ্রের স্ক্রিনিংয়ের ওপর।</p>`
    },
    eligible: {
      title: 'কারা রক্তদান করতে পারবেন?',
      body: `<p>রক্তদানের আগে প্রত্যেক দাতার স্বাস্থ্য ও যোগ্যতা পরীক্ষা করা হয়। সাধারণ নির্দেশনা হিসেবে:</p>
      <ul><li>সাধারণত ১৮ থেকে ৬০ বছর বয়সী সুস্থ ব্যক্তি রক্তদানের জন্য বিবেচিত হন।</li><li>ওজন সাধারণত কমপক্ষে ৫০ কেজি হওয়া প্রয়োজন; স্থানীয় রক্তকেন্দ্রের নিয়ম অনুসরণ করুন।</li><li>রক্তচাপ, হিমোগ্লোবিন, সাম্প্রতিক অসুস্থতা, ওষুধ ও অন্যান্য স্বাস্থ্য-তথ্য যাচাই করা হতে পারে।</li><li>অনেক ক্ষেত্রে পূর্ণ রক্তদানের মধ্যে অন্তত ৩–৪ মাস বিরতি রাখা হয়; আপনার রক্তকেন্দ্রের নির্দেশনাই চূড়ান্ত।</li><li>গর্ভাবস্থা, সাম্প্রতিক অস্ত্রোপচার, জ্বর বা কিছু রোগ/ওষুধের ক্ষেত্রে সাময়িক বা স্থায়ীভাবে রক্তদান স্থগিত হতে পারে।</li></ul>
      <p class="education-caution">এগুলো সাধারণ তথ্য, চিকিৎসাগত অনুমোদন নয়। রক্তদানের আগে নিবন্ধিত রক্তকেন্দ্রের স্বাস্থ্যকর্মীর সঙ্গে কথা বলুন।</p>`
    },
    myths: {
      title: 'কিছু ভুল ধারণা',
      body: `<ul><li><b>“রক্ত দিতে অনেক ব্যথা লাগে”:</b> সূচ ফোটানোর সময় অল্প সময়ের জন্য সামান্য ব্যথা বা অস্বস্তি হতে পারে।</li><li><b>“রক্ত দিলে শরীর স্থায়ীভাবে দুর্বল হয়ে যায়”:</b> যোগ্য ব্যক্তির ক্ষেত্রে নিয়ম মেনে রক্তদান সাধারণত নিরাপদ; পরে কিছুক্ষণ বিশ্রাম ও পর্যাপ্ত তরল পান করা জরুরি।</li><li><b>“ডায়াবেটিস থাকলেই রক্ত দেওয়া যায় না”:</b> সব ক্ষেত্রে নয়। রোগ নিয়ন্ত্রণে আছে কি না, ওষুধ ও সামগ্রিক স্বাস্থ্য বিবেচনা করে রক্তকেন্দ্র সিদ্ধান্ত নেয়।</li><li><b>“সবাই যেকোনো সময় রক্ত দিতে পারেন”:</b> না। প্রতিবারই স্বাস্থ্য পরীক্ষা ও যোগ্যতা যাচাই প্রয়োজন।</li></ul>
      <p class="education-caution">নিজের রোগ, ওষুধ বা স্বাস্থ্য-অবস্থা গোপন করবেন না। সঠিক তথ্য দেওয়া দাতা ও গ্রহীতা—দুজনের নিরাপত্তার জন্য জরুরি।</p>`
    },
    heroes: {
      title: 'সুপার ডোনার ও দুঃসাহসী ডোনার',
      body: `<p><b>“সুপার ডোনার”</b>—যে রক্তদাতা নিজের সামর্থ্য ও নিরাপত্তা বিবেচনা করে জরুরি প্রয়োজনে, এমনকি গভীর রাতেও, রক্তদানে এগিয়ে আসতে প্রস্তুত থাকেন।</p>
      <p><b>“দুঃসাহসী ডোনার”</b>—যে রক্তদাতা মুমূর্ষু রোগীর প্রয়োজনে দূরত্বের বাধা পেরিয়ে সাহায্য করতে আগ্রহী। এক জেলা থেকে আরেক জেলায়, পরিচিত বা অপরিচিত মানুষের পাশে দাঁড়ানোর এই মানসিকতাই তাঁকে সাহসী করে তোলে।</p>
      <ul><li>রক্তদানের আগে নিজের স্বাস্থ্য ও রক্তকেন্দ্রের অনুমোদন নিশ্চিত করুন।</li><li>রোগীর হাসপাতাল/চিকিৎসকের সঙ্গে রক্তের গ্রুপ ও প্রয়োজনীয়তা নিশ্চিত করুন।</li><li>নিরাপদ যাতায়াত, বিশ্রাম ও ব্যক্তিগত সীমাবদ্ধতার কথাও বিবেচনা করুন।</li><li>কাউকে রক্তদানে চাপ দেবেন না—স্বেচ্ছাসেবাই সবচেয়ে গুরুত্বপূর্ণ।</li></ul>
      <p class="education-caution">২৪ ঘণ্টা প্রস্তুত থাকা বাধ্যতামূলক নয়। দাতার নিরাপত্তা ও স্বেচ্ছাসম্মতি সবসময় আগে।</p>`
    }
  };

  function openEducation(key) {
    const item = education[key]; if (!item) return;
    let modal = document.getElementById('blooddrop-education-modal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'blooddrop-education-modal'; modal.className = 'education-modal-backdrop';
      modal.innerHTML = `<section class="education-modal" role="dialog" aria-modal="true" aria-labelledby="education-modal-title"><header><h2 id="education-modal-title"></h2><button type="button" class="education-modal-close" aria-label="Close">×</button></header><div class="education-modal-content"></div><footer><button type="button" class="btn primary education-modal-done">বুঝেছি</button></footer></section>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('.education-modal-close,.education-modal-done')) modal.remove(); });
      document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('blooddrop-education-modal')?.remove(); });
    }
    modal.querySelector('#education-modal-title').textContent = item.title;
    modal.querySelector('.education-modal-content').innerHTML = item.body;
  }

  async function startAdminDonorChat(donorId, donorName) {
    if (me?.role !== 'admin' || !db || !session?.user?.id) return;
    try {
      const { data: existing, error: findError } = await db.from('support_conversations').select('id').eq('user_id', donorId).eq('subject', 'Private message from BloodDrop Admin').eq('status', 'open').limit(1).maybeSingle();
      if (findError) throw findError;
      let conversationId = existing?.id;
      if (!conversationId) {
        const { data, error } = await db.from('support_conversations').insert({ user_id: donorId, subject: 'Private message from BloodDrop Admin' }).select('id').single();
        if (error) throw error; conversationId = data.id;
      }
      page = 'Support Inbox';
      if (typeof renderNav === 'function') renderNav();
      await window.renderPage();
      const target = document.querySelector(`[data-support-open="${CSS.escape(conversationId)}"]`);
      if (target) target.click();
      else toast?.(`Private chat created for ${donorName}. Open Support Inbox to continue.`);
    } catch (error) {
      console.error('Admin-to-donor chat:', error);
      showError?.(error, 'Could not start private donor chat');
      if (typeof showError !== 'function') toast?.(error.message || 'Could not start private donor chat. Run the updated optional_features.sql migration first.');
    }
  }

  document.addEventListener('click', e => {
    const read = e.target.closest('[data-education]');
    if (read) { openEducation(read.dataset.education); return; }
    const chat = e.target.closest('[data-admin-message-donor]');
    if (chat) startAdminDonorChat(chat.dataset.adminMessageDonor, chat.dataset.donorName || 'Donor');
  });

  // Private messaging is launched from each donor card in Admin > Donors.
  // Do not add a separate donor directory to the Support Inbox.

  function escapeText(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeAttr(value) { return escapeText(value); }
})();
