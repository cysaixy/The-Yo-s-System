/* Shared Hot Coffee ↔ Iced Coffee theme controller for every customer page. */
(() => {
  if (window.__theYosCoffeeTheme) return;
  window.__theYosCoffeeTheme = true;
  const key = 'theYosTheme';
  const init = () => {
    const body = document.body, list = document.querySelector('#siteNav ul');
    if (!body || !list) return;
    body.classList.add('sunset-mode');
    const item = document.createElement('li');
    item.className = 'sunset-mode-item';
    item.innerHTML = '<button type="button" id="coffeeThemeToggle" class="sunset-mode-toggle coffee-theme-toggle" aria-label="Switch between hot coffee light mode and iced coffee dark mode" aria-pressed="false"><span class="sunset-mode-label">Hot coffee</span><span class="coffee-toggle-art" aria-hidden="true"><svg viewBox="0 0 52 28"><path class="coffee-cup" d="M12 10h18v10a7 7 0 0 1-14 0V10Z M30 12h4a4 4 0 0 1 0 7h-4"/><path class="coffee-steam steam-a" d="M17 8c-2-2 2-3 0-6"/><path class="coffee-steam steam-b" d="M24 8c-2-2 2-3 0-6"/><path class="coffee-glass" d="M15 7h19l-2 16H17L15 7Z"/><path class="coffee-straw" d="M30 7l3-5"/><rect class="coffee-ice ice-a" x="19" y="12" width="6" height="6" rx="1"/><rect class="coffee-ice ice-b" x="26" y="15" width="6" height="6" rx="1"/><circle class="coffee-drop" cx="38" cy="14" r="1.4"/></svg><i class="coffee-thumb"></i></span></button>';
    list.appendChild(item);
    const button = document.getElementById('coffeeThemeToggle');
    let dark = localStorage.getItem(key) === 'dark';
    const apply = () => {
      body.classList.toggle('coffee-night', dark);
      button.classList.toggle('is-sunset', dark);
      button.setAttribute('aria-pressed', String(dark));
      button.querySelector('.sunset-mode-label').textContent = dark ? 'Iced coffee' : 'Hot coffee';
    };
    button.addEventListener('click', () => { dark = !dark; localStorage.setItem(key, dark ? 'dark' : 'light'); apply(); });
    apply();
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();
})();
