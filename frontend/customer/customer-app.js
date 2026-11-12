// customer-app.js — the customer site's persistent shell.
// The header lives here and never reloads; pages swap inside the iframe.
// Smoothness rules: one navigation at a time, the header never changes
// height, and every animation only touches transform/opacity/clip-path.

const SUPPORTED_PATHS = new Set(['/', '/about', '/menu', '/gallery', '/order', '/reviews', '/reservations', '/my-orders', '/account']);
const frame = document.getElementById('customerFeatureFrame');
const workspace = frame.closest('.customer-app-workspace');
const header = document.getElementById('siteHeader');
const nav = document.getElementById('siteNav');
const burger = document.getElementById('navToggle');
const links = document.getElementById('yoLinks');
const indicator = document.getElementById('yoIndicator');
const progress = document.getElementById('yoProgress');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileQuery = window.matchMedia('(max-width: 1080px)');

// GSAP is loaded with `defer`, so it's ready before this module runs —
// but everything below still works (CSS fallbacks) if the CDN fails.
const gsap = !reduceMotion && window.gsap ? window.gsap : null;
if (gsap) document.documentElement.classList.add('yo-gsap');

function normalizePath(path) {
  const url = new URL(path, window.location.origin);
  if (url.pathname === '/order' && url.hash === '#feedback') {
    url.pathname = '/reviews';
    url.search = '';
    url.hash = '';
  }
  return url;
}

function requestedPath() {
  const page = new URLSearchParams(window.location.search).get('page')
    || (window.location.pathname === '/reviews' ? '/reviews' : '/');
  const url = normalizePath(page);
  return SUPPORTED_PATHS.has(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : '/';
}

/* ---------------- Sliding active indicator ---------------- */
function moveIndicator({ instant = false } = {}) {
  if (!indicator || mobileQuery.matches) return;
  const active = links.querySelector('a.active');
  if (!active) {
    if (gsap) gsap.to(indicator, { opacity: 0, duration: instant ? 0 : 0.25 });
    else indicator.style.opacity = '0';
    return;
  }
  const x = active.offsetLeft;
  const width = active.offsetWidth;
  if (gsap) {
    gsap.to(indicator, {
      x, width, opacity: 1,
      duration: instant ? 0 : 0.55,
      ease: 'expo.out',
      overwrite: true,
    });
  } else {
    indicator.style.transform = `translateX(${x}px)`;
    indicator.style.width = `${width}px`;
    indicator.style.opacity = '1';
  }
}

function updateActiveLink(path) {
  const normalizedPath = normalizePath(path).pathname;
  document.querySelectorAll('[data-customer-path]').forEach(link => {
    const isActive = normalizePath(link.dataset.customerPath).pathname === normalizedPath;
    link.classList.toggle('active', isActive);
    if (link.tagName === 'A') {
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  });
  moveIndicator();
}

/* ---------------- Page transitions ---------------- */
let navToken = 0;
let currentSrc = '';

function startProgress() {
  if (!progress) return;
  if (gsap) {
    gsap.killTweensOf(progress);
    gsap.set(progress, { opacity: 1, scaleX: 0 });
    gsap.to(progress, { scaleX: 0.75, duration: 1.6, ease: 'power2.out' });
  } else {
    progress.style.opacity = '1';
    progress.style.transform = 'scaleX(.6)';
  }
}

function finishProgress() {
  if (!progress) return;
  if (gsap) {
    gsap.to(progress, { scaleX: 1, duration: 0.25, ease: 'power1.out', overwrite: true });
    gsap.to(progress, { opacity: 0, duration: 0.3, delay: 0.25 });
  } else {
    progress.style.opacity = '0';
  }
}

function revealFrame() {
  workspace.classList.remove('is-loading');
  finishProgress();
  if (gsap) {
    gsap.fromTo(frame, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out', overwrite: true, clearProps: 'transform' });
  } else {
    frame.style.opacity = '1';
    frame.style.visibility = 'visible';
  }
}

function loadFrame(src, { animate = true } = {}) {
  const token = ++navToken;
  currentSrc = src;
  workspace.classList.add('is-loading');
  startProgress();

  const swap = () => {
    if (token !== navToken) return; // a newer navigation won
    frame.src = src;
  };

  if (gsap && animate && frame.src) {
    gsap.to(frame, { autoAlpha: 0, y: -8, duration: 0.18, ease: 'power2.in', overwrite: true, onComplete: swap });
  } else {
    swap();
  }

  // Watchdog: never leave the page hidden if `load` is slow or never fires.
  setTimeout(() => {
    if (token === navToken && workspace.classList.contains('is-loading')) revealFrame();
  }, 5000);
}

frame.addEventListener('load', () => {
  sendThemeToFrame();
  bindFrameScroll();
  revealFrame();
});

function navigate(path, { addHistory = false, animate = true } = {}) {
  const url = normalizePath(path);
  if (!SUPPORTED_PATHS.has(url.pathname)) return;

  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  if (addHistory) {
    history.pushState({ path: nextPath }, '', `customer-app.html?page=${encodeURIComponent(nextPath)}`);
  }
  updateActiveLink(nextPath);
  closeNav();

  url.searchParams.set('embedded', '1');
  const src = `${url.pathname}${url.search}${url.hash}`;
  if (src === currentSrc && !workspace.classList.contains('is-loading')) {
    // Same page: just scroll it back to the top smoothly.
    try { frame.contentWindow?.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); } catch {}
    return;
  }
  loadFrame(src, { animate });
}
// Used by authNav.js (dropdown items, logout) so they never force a full reload.
window.theYosNavigate = path => navigate(path, { addHistory: true });

/* ---------------- Header shadow on scroll (no size change) ---------------- */
function bindFrameScroll() {
  let win;
  try { win = frame.contentWindow; win.document; } catch { return; }
  if (!win || win.__yoScrollBound) return;
  win.__yoScrollBound = true;
  let ticking = false;
  const update = () => {
    ticking = false;
    header.classList.toggle('is-scrolled', (win.scrollY || 0) > 8);
  };
  win.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
}

/* ---------------- Mobile drawer ---------------- */
let navOpen = false;
let drawerTl = null;

function buildDrawerTimeline() {
  if (!gsap) return null;
  const items = nav.querySelectorAll('.yo-links li:not(.yo-indicator), .yo-actions li');
  return gsap.timeline({ paused: true })
    .fromTo(nav, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.6, ease: 'expo.inOut' })
    .fromTo(items, { y: 28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.045, ease: 'power3.out' }, '-=0.25');
}

function openNav() {
  if (navOpen || !mobileQuery.matches) return;
  navOpen = true;
  nav.classList.add('open');
  burger.classList.add('open');
  burger.setAttribute('aria-expanded', 'true');
  burger.setAttribute('aria-label', 'Close menu');
  if (gsap) {
    drawerTl = drawerTl || buildDrawerTimeline();
    drawerTl.timeScale(1).play();
  }
}

function closeNav() {
  if (!navOpen) return;
  navOpen = false;
  burger.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  burger.setAttribute('aria-label', 'Open menu');
  if (gsap && drawerTl) {
    drawerTl.timeScale(1.6).reverse().eventCallback('onReverseComplete', () => {
      if (!navOpen) nav.classList.remove('open');
    });
  } else {
    nav.classList.remove('open');
  }
}

burger.addEventListener('click', e => {
  e.stopPropagation();
  navOpen ? closeNav() : openNav();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeNav(); });

// Leaving mobile width with the drawer open: reset cleanly, no stuck states.
mobileQuery.addEventListener('change', () => {
  navOpen = false;
  nav.classList.remove('open');
  burger.classList.remove('open');
  burger.setAttribute('aria-expanded', 'false');
  if (drawerTl) { drawerTl.kill(); drawerTl = null; }
  if (gsap) gsap.set(nav.querySelectorAll('li'), { clearProps: 'all' });
  gsap?.set(nav, { clearProps: 'clipPath' });
  requestAnimationFrame(() => moveIndicator({ instant: true }));
});

/* ---------------- Links ---------------- */
document.addEventListener('click', event => {
  const link = event.target.closest('[data-customer-path]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  // The signed-in account pill is a <button> that opens the dropdown.
  if (link.tagName === 'BUTTON') return;
  event.preventDefault();
  navigate(link.dataset.customerPath, { addHistory: true });
});

// Hover preview: the indicator glides toward the hovered link.
if (gsap) {
  links.querySelectorAll('a').forEach(a => {
    a.addEventListener('mouseenter', () => {
      if (mobileQuery.matches) return;
      gsap.to(indicator, { x: a.offsetLeft, width: a.offsetWidth, opacity: a.classList.contains('active') ? 1 : 0.35, duration: 0.45, ease: 'expo.out', overwrite: true });
    });
  });
  links.addEventListener('mouseleave', () => moveIndicator());
}

/* ---------------- Theme ---------------- */
function sendThemeToFrame() {
  const isDark = document.body.classList.contains('coffee-night') || localStorage.getItem('theYosTheme') === 'dark';
  try {
    frame.contentWindow?.postMessage({ type: 'theyos:customer-theme', dark: isDark }, window.location.origin);
  } catch (e) {}
}

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'theyos:customer-navigate' && typeof event.data.path === 'string') {
    navigate(event.data.path, { addHistory: true });
  } else if (event.data?.type === 'theyos:request-theme') {
    sendThemeToFrame();
  }
});
window.addEventListener('popstate', () => navigate(requestedPath()));

document.getElementById('coffeeThemeToggle')?.addEventListener('click', () => {
  requestAnimationFrame(sendThemeToFrame);
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => moveIndicator({ instant: true }), 120);
});
document.fonts?.ready?.then(() => moveIndicator({ instant: true }));

/* ---------------- Boot ---------------- */
if (gsap) {
  gsap.set(frame, { autoAlpha: 0 });
  gsap.from(header.querySelectorAll('.yo-brand, .yo-links, .yo-actions > li, .yo-burger'), {
    y: -14, autoAlpha: 0, duration: 0.7, ease: 'power3.out', stagger: 0.06, clearProps: 'all',
  });
}
navigate(requestedPath(), { animate: false });
requestAnimationFrame(() => moveIndicator({ instant: true }));
