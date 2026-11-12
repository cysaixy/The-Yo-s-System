/* The~Yo's shared page motion (GSAP + ScrollTrigger).
   Loaded on every customer page except the home page, which has its own
   choreography in home-anim.js. Rules that keep it from ever "glitching":
   - nothing is hidden until GSAP is actually loaded (no blank page if the
     CDN fails), and a watchdog force-reveals everything after 2.5s;
   - only transform/opacity are animated (no layout thrash);
   - prefers-reduced-motion skips the whole thing. */
(() => {
  if (window.__theYosMotion) return;
  window.__theYosMotion = true;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || document.body?.classList.contains('home-gsap')) return;

  const GSAP_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
  const ST_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js';

  const loadScript = src => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      // Already on the page (or loading) — wait for the global to show up.
      const started = Date.now();
      const check = () => {
        if (src === GSAP_SRC ? window.gsap : window.ScrollTrigger) return resolve();
        if (Date.now() - started > 5000) return reject(new Error('timeout'));
        setTimeout(check, 30);
      };
      return check();
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });

  // Hero / heading entrance
  const HERO = [
    '.section-head .eyebrow', '.section-head h1', '.section-head h2', '.section-head .display',
    '.section-head p', '.login-heading', '.reviews-wall-header', '.my-reservations-title',
  ].join(',');

  // Content that slides up in batches as it scrolls into view
  const BLOCKS = [
    '.menu-tabs', '.tab-btn', '.menu-item', '.media-box', '.gallery-filters .filter-tag',
    '.reserve-card', '.res-card', '.order-card', '.orders-list > *',
    '.account-card', '.login-art-benefit-item', '.feedback-form-card', '.comment-card',
    '.reviews-identity', '.order-summary-box', '.checkout-step-panel.active',
    '.about-figure', '.about-text', '.stat-row > div', '.footer-grid > *', '.gallery-section-cta',
  ].join(',');

  function run() {
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    ScrollTrigger.config({ ignoreMobileResize: true });
    document.documentElement.classList.add('motion-ready');

    const seen = new WeakSet();
    const reveal = els => gsap.to(els, {
      autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out',
      stagger: { each: 0.06, from: 'start' }, overwrite: true,
      clearProps: 'transform,opacity,visibility',
    });

    // Heading entrance
    const heads = gsap.utils.toArray(HERO).filter(el => el.offsetParent !== null);
    if (heads.length) {
      gsap.fromTo(heads, { autoAlpha: 0, y: 28 }, {
        autoAlpha: 1, y: 0, duration: 0.9, ease: 'power4.out', stagger: 0.08, delay: 0.05,
        clearProps: 'transform,opacity,visibility',
      });
    }

    function prime(nodes) {
      const fresh = nodes.filter(el => !seen.has(el) && el.offsetParent !== null);
      if (!fresh.length) return;
      fresh.forEach(el => seen.add(el));
      gsap.set(fresh, { autoAlpha: 0, y: 26, scale: 0.985 });
      ScrollTrigger.batch(fresh, {
        start: 'top 92%',
        once: true,
        onEnter: batch => reveal(batch),
      });
      // Anything already on screen (or above it) reveals right away.
      ScrollTrigger.refresh();
    }

    prime(gsap.utils.toArray(BLOCKS));

    // Menus, orders and reviews render after fetches — pick those up too.
    let pending = null;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = null;
        prime(gsap.utils.toArray(BLOCKS));
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Subtle press feedback on primary buttons
    document.addEventListener('pointerdown', e => {
      const btn = e.target.closest('.btn, .add-btn, .nav-btn');
      if (btn) gsap.fromTo(btn, { scale: 0.96 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', clearProps: 'transform' });
    }, { passive: true });

    // Watchdog: never leave content invisible, whatever happens.
    setTimeout(() => {
      gsap.utils.toArray(BLOCKS).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && getComputedStyle(el).opacity === '0') reveal(el);
      });
    }, 2500);

    let t;
    window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => ScrollTrigger.refresh(), 200); });
  }

  const start = () => loadScript(GSAP_SRC)
    .then(() => loadScript(ST_SRC))
    .then(run)
    .catch(err => console.warn('Motion disabled:', err?.message || err));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
