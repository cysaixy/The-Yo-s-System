// The customer pages share one coffee theme controller and stylesheet.
if (!document.querySelector('link[href="sunset-mode.css"]')) {
  const themeStyles = document.createElement('link');
  themeStyles.rel = 'stylesheet';
  themeStyles.href = 'sunset-mode.css';
  document.head.appendChild(themeStyles);
}
if (!document.querySelector('script[src="sunset-mode.js"]')) {
  const themeScript = document.createElement('script');
  themeScript.src = 'sunset-mode.js';
  document.head.appendChild(themeScript);
}

document.addEventListener("DOMContentLoaded", () => {
  // --- EXISTING HOOKS ---
  const yElement = document.getElementById('year');
  if (yElement) yElement.textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      siteNav.classList.toggle('open');
      navToggle.textContent = siteNav.classList.contains('open') ? '✕' : '☰';
    });
  }

  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, { threshold: 0.1 });
  revealEls.forEach(el => io.observe(el));

  // --- THEME ENGINE DISABLED FOR NOW ---
  // initThemeEngine();

  // --- ORDER INITIALIZATION ---
  // Catalog/cart rendering lives in the order page's own module script.
  // Only the Delivery-address toggle needs wiring here (no-ops elsewhere).
  initServiceTypeListener();
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

// --- DELIVERY EXPANSION LOGIC ---
// Shows/hides the Delivery Address field on the order page based on the
// selected service type. The saved profile address is prefilled if present.
function initServiceTypeListener() {
  const orderTypeSelect = document.getElementById('orderType');
  if (!orderTypeSelect) return;

  const applyDeliveryState = () => {
    const locationRow = document.getElementById('deliveryLocationWrapper');
    if (orderTypeSelect.value === 'Delivery') {
      if (!locationRow) {
        const currentFormRow = orderTypeSelect.closest('.form-row');
        const newRow = document.createElement('div');
        newRow.id = 'deliveryLocationWrapper';
        newRow.className = 'form-row';
        newRow.style.marginTop = '10px';
        newRow.innerHTML = `
          <div style="width: 100%;">
            <label for="deliveryAddress" style="color: var(--brass); font-weight: 700;">📍 Delivery Address</label>
            <input id="deliveryAddress" type="text" required placeholder="House No., Street, Barangay, Landmarks">
          </div>
        `;
        const saved = sessionStorage.getItem('yo-customer-address');
        if (saved) newRow.querySelector('#deliveryAddress').value = saved;
        currentFormRow.parentNode.insertBefore(newRow, currentFormRow.nextSibling);
      }
    } else if (locationRow) {
      locationRow.remove();
    }
  };

  orderTypeSelect.addEventListener('change', applyDeliveryState);
  // Reflect the currently selected value on first load too (e.g. if the
  // user navigated back with the form state preserved).
  applyDeliveryState();
}
