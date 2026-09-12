// The customer pages share one coffee theme controller and stylesheet.
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

document.addEventListener("DOMContentLoaded", () => {
  // --- EXISTING HOOKS ---
  const yElement = document.getElementById('year');
  if (yElement) yElement.textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  
  if (navToggle && siteNav) {
    if (!navToggle.querySelector('svg')) {
      navToggle.innerHTML = `
        <svg class="nav-toggle-icon nav-icon-menu" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="4" y1="6" x2="20" y2="6"></line>
          <line x1="4" y1="12" x2="20" y2="12"></line>
          <line x1="4" y1="18" x2="20" y2="18"></line>
        </svg>
        <svg class="nav-toggle-icon nav-icon-close" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
    }
    navToggle.setAttribute('aria-label', 'Toggle navigation menu');
    navToggle.setAttribute('aria-expanded', 'false');

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

  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, { threshold: 0.1 });
  revealEls.forEach(el => io.observe(el));

  // --- THEME ENGINE DISABLED FOR NOW ---
  // initThemeEngine();
});

function initThemeEngine() {
  const body = document.body;
  const isMenuPage = body.classList.contains('menu-page-theme');
  const savedTheme = localStorage.getItem('theme-preference');

  const SUN_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>';
  const MOON_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

  const activeThemeIsDark = savedTheme
    ? savedTheme === 'dark'
    : isMenuPage;

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.innerHTML = activeThemeIsDark ? `${SUN_ICON}<span>Light</span>` : `${MOON_ICON}<span>Dark</span>`;

    toggleBtn.addEventListener('click', () => {
      let activeDark;
      if (isMenuPage) {
        body.classList.toggle('light-theme');
        activeDark = !body.classList.contains('light-theme');
      } else {
        body.classList.toggle('dark-theme');
        activeDark = body.classList.contains('dark-theme');
      }
      localStorage.setItem('theme-preference', activeDark ? 'dark' : 'light');
      toggleBtn.innerHTML = activeDark ? `${SUN_ICON}<span>Light</span>` : `${MOON_ICON}<span>Dark</span>`;
    });
  }

  if (savedTheme === 'dark') {
    if (!isMenuPage) body.classList.add('dark-theme');
    else body.classList.remove('light-theme');
  } else if (savedTheme === 'light') {
    if (isMenuPage) body.classList.add('light-theme');
    else body.classList.remove('dark-theme');
  }
}
