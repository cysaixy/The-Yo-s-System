(() => {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded = params.get('embedded') === '1' || window.parent !== window;

  const applyTheme = (isDark) => {
    document.documentElement.classList.toggle('coffee-night', isDark);
    if (document.body) {
      document.body.classList.toggle('coffee-night', isDark);
    }
  };

  try {
    const isDark = localStorage.getItem('theYosTheme') === 'dark';
    if (isDark) {
      applyTheme(true);
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => applyTheme(true), { once: true });
      }
    }
  } catch (e) {}

  const syncEmbeddedState = () => {
    if (!isEmbedded) return;
    document.documentElement.classList.add('customer-app-embedded');
    if (document.body) document.body.classList.add('customer-app-embedded');

    document.querySelectorAll('header, #siteNav, .logo-link, .site-header').forEach(node => {
      node.style.display = 'none';
      node.setAttribute('data-theyos-hidden', 'embedded');
    });
  };

  syncEmbeddedState();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncEmbeddedState, { once: true });
  }

  if (isEmbedded) {
    window.addEventListener('message', event => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'theyos:customer-theme') {
        if (document.body) document.body.classList.add('sunset-mode');
        applyTheme(Boolean(event.data.dark));
      }
    });

    try {
      window.parent.postMessage({ type: 'theyos:request-theme' }, window.location.origin);
    } catch (e) {}

    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || link.target || event.defaultPrevented || window.parent === window) return;
      const destination = new URL(link.href, window.location.href);
      if (link.getAttribute('href').startsWith('#')) return;
      if (destination.origin !== window.location.origin) return;
      const supported = new Set(['/', '/about', '/menu', '/gallery', '/order', '/reviews', '/reservations', '/my-orders', '/account']);
      if (!supported.has(destination.pathname)) return;
      event.preventDefault();
      window.parent.postMessage({ type: 'theyos:customer-navigate', path: `${destination.pathname}${destination.search}${destination.hash}` }, window.location.origin);
    }, true);
    return;
  }

  const destination = `${window.location.pathname}${window.location.hash}`;
  window.location.replace(`/customer-app.html?page=${encodeURIComponent(destination)}`);
})();
