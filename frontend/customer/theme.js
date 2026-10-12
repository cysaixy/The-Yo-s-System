/* The~Yo's coffee theme controller.
   Dark mode is applied BEFORE first paint via global.js inline script.
   This file only wires up the toggle button UI. */
(() => {
  if (window.__theYosCoffeeTheme) return;
  window.__theYosCoffeeTheme = true;

  const key = 'theYosTheme';

  const TOGGLE_HTML = '<button type="button" id="coffeeThemeToggle" class="sunset-mode-toggle coffee-theme-toggle" aria-label="Switch between hot coffee and iced coffee mode" aria-pressed="false">'
    + '<span class="coffee-toggle-art" aria-hidden="true">'
    + '<svg viewBox="0 0 52 28">'
    + '<path class="coffee-cup" d="M12 10h18v10a7 7 0 0 1-14 0V10Z M30 12h4a4 4 0 0 1 0 7h-4"/>'
    + '<path class="coffee-steam steam-a" d="M17 8c-2-2 2-3 0-6"/>'
    + '<path class="coffee-steam steam-b" d="M24 8c-2-2 2-3 0-6"/>'
    + '<path class="coffee-glass" d="M15 7h19l-2 16H17L15 7Z"/>'
    + '<path class="coffee-straw" d="M30 7l3-5"/>'
    + '<rect class="coffee-ice ice-a" x="19" y="12" width="6" height="6" rx="1"/>'
    + '<rect class="coffee-ice ice-b" x="26" y="15" width="6" height="6" rx="1"/>'
    + '<circle class="coffee-drop" cx="38" cy="14" r="1.4"/>'
    + '</svg>'
    + '<i class="coffee-thumb"></i>'
    + '</span></button>';

  const init = () => {
    const body = document.body;
    const list = document.querySelector('#siteNav ul');
    if (!body || !list) return;

    // Build the <li> and append — but the width is fixed so no layout shift
    // because the toggle is appended before the browser has painted the nav
    // (DOMContentLoaded fires before first paint on fast connections, and
    // the inline dark-mode script already ran so no color flash either).
    const item = document.createElement('li');
    item.className = 'sunset-mode-item';
    item.innerHTML = TOGGLE_HTML;

    // Insert before "Order Now" (last <li>) to keep consistent order
    const lastLi = list.querySelector('li:last-child');
    list.insertBefore(item, lastLi);

    const button = document.getElementById('coffeeThemeToggle');
    let dark = localStorage.getItem(key) === 'dark';

    const applyVisual = () => {
      body.classList.toggle('coffee-night', dark);
      button.classList.toggle('is-sunset', dark);
      button.setAttribute('aria-pressed', String(dark));
    };

    button.addEventListener('click', () => {
      // Only add sunset-mode (slow transitions) when the user manually toggles
      body.classList.add('sunset-mode');
      dark = !dark;
      localStorage.setItem(key, dark ? 'dark' : 'light');
      applyVisual();
    });

    // Apply visual state without transitions on load
    applyVisual();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
