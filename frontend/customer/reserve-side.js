// reserve-side.js — side cards on the Reservations page:
//  • latest real guest review (from the reviews database)
//  • Coffee Night card that switches the site theme
(() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function loadReview() {
    const body = document.getElementById('rsReviewBody');
    if (!body) return;
    try {
      const res = await fetch('/api/customer/reviews?limit=2');
      if (!res.ok) throw new Error('unavailable');
      const { reviews = [] } = await res.json();
      if (!reviews.length) {
        body.innerHTML = '<p class="rs-muted">No reviews yet. Dined with us? Be the first to share how it went.</p>';
        return;
      }
      body.innerHTML = reviews.map(r => {
        const n = Math.max(1, Math.min(5, Number(r.rating) || 5));
        return `<figure class="rs-quote">
          <div class="rs-stars" aria-label="${n} out of 5">${'★'.repeat(n)}<span>${'★'.repeat(5 - n)}</span></div>
          <blockquote>${esc(r.comment)}</blockquote>
          <figcaption>${esc(r.name)}</figcaption>
        </figure>`;
      }).join('');
    } catch {
      body.innerHTML = '<p class="rs-muted">Reviews are unavailable right now.</p>';
    }
  }

  // The theme toggle lives in the app header (parent frame); fall back to
  // this page's own toggle when opened directly.
  function headerToggle() {
    try {
      if (window.parent !== window) return window.parent.document.getElementById('coffeeThemeToggle');
    } catch { /* cross-origin: not expected */ }
    return document.getElementById('coffeeThemeToggle');
  }

  function isDark() {
    try { return localStorage.getItem('theYosTheme') === 'dark'; } catch { return false; }
  }

  function renderTheme() {
    const title = document.getElementById('rsThemeTitle');
    const card = document.querySelector('.rs-theme');
    if (!title || !card) return;
    const dark = isDark();
    title.textContent = dark ? 'Coffee night' : 'Day mode';
    card.classList.toggle('is-night', dark);
  }

  document.getElementById('rsThemeBtn')?.addEventListener('click', () => {
    const toggle = headerToggle();
    if (toggle) toggle.click();
    // The header broadcasts the new theme to this page; re-read shortly after.
    setTimeout(renderTheme, 60);
  });
  window.addEventListener('storage', renderTheme);
  window.addEventListener('message', e => { if (e.data?.type === 'theyos:customer-theme') setTimeout(renderTheme, 0); });

  renderTheme();
  loadReview();
})();
