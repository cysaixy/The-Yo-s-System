// global.js — runs on every customer page

// ─── STEP 1: Apply saved dark mode BEFORE any stylesheet loads ───────────────
// This inline-style block runs synchronously so the body already has
// coffee-night before the first paint — no dark flash on navigation.
try {
  if (localStorage.getItem('theYosTheme') === 'dark') {
    document.documentElement.classList.add('coffee-night-pending');
    // Use a <style> tag so it wins even before theme.css loads
    const s = document.createElement('style');
    s.textContent = 'body{--bone:#160f0b;--stone:#2a1a12;--ink:#f5ead8;--component-bg:#25170f;--line:rgba(245,234,216,.17);--header-bg:rgba(24,15,10,.97);background:#160f0b!important;color:#f5ead8!important}';
    document.head.appendChild(s);
    // Once body exists, swap to the proper class so theme.css takes over
    const applyClass = () => {
      document.body.classList.add('coffee-night');
      s.remove();
      document.documentElement.classList.remove('coffee-night-pending');
    };
    if (document.body) {
      applyClass();
    } else {
      document.addEventListener('DOMContentLoaded', applyClass, { once: true });
    }
  }
} catch (e) {}

// ─── STEP 2: Load theme.css and theme.js ─────────────────────────────────────
if (!document.querySelector('link[href="theme.css"]')) {
  const themeStyles = document.createElement('link');
  themeStyles.rel = 'stylesheet';
  themeStyles.href = 'theme.css';
  document.head.appendChild(themeStyles);
}
if (!document.querySelector('script[src="theme.js"]')) {
  const themeScript = document.createElement('script');
  themeScript.src = 'theme.js';
  document.head.appendChild(themeScript);
}

document.addEventListener('DOMContentLoaded', () => {
  // Year
  const yElement = document.getElementById('year');
  if (yElement) yElement.textContent = new Date().getFullYear();

  // ─── Mobile nav toggle — guarded against double-binding ────────────────────
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');

  if (navToggle && siteNav && !navToggle.dataset.bound) {
    navToggle.dataset.bound = '1';

    const openNav = () => {
      siteNav.classList.add('open');
      navToggle.classList.add('open');
      navToggle.setAttribute('aria-expanded', 'true');
      navToggle.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
    };

    const closeNav = () => {
      siteNav.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
    };

    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      siteNav.classList.contains('open') ? closeNav() : openNav();
    });

    siteNav.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeNav();
    });

    document.addEventListener('click', (e) => {
      if (siteNav.classList.contains('open') && !siteNav.contains(e.target) && !navToggle.contains(e.target)) {
        closeNav();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && siteNav.classList.contains('open')) {
        closeNav();
      }
    });
  }

  // Scroll reveal
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, { threshold: 0.1 });
  revealEls.forEach(el => io.observe(el));
});
