/* The~Yo's coffee theme controller.
   Dark mode is applied BEFORE first paint via global.js inline script.
   This file only wires up the toggle button UI.

   The toggle button is now static HTML in every page's nav
   (see theme-toggle.html for the markup snippet).
   No DOM injection happens here — we just find #coffeeThemeToggle and bind it. */
(() => {
  if (window.__theYosCoffeeTheme) return;
  window.__theYosCoffeeTheme = true;

  const key = 'theYosTheme';

  const init = () => {
    const body = document.body;
    const button = document.getElementById('coffeeThemeToggle');
    if (!body || !button) return;

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

    // Apply visual state WITHOUT transitions on load —
    // add no-transition class, apply state, then remove it next frame
    button.classList.add('theme-no-transition');
    applyVisual();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => button.classList.remove('theme-no-transition'));
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
