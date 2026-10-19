(() => {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded = params.get('embedded') === '1' || window.parent !== window;

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
        document.body?.classList.toggle('coffee-night', event.data.dark);
        return;
      }
      if (event.data?.type === 'theyos:customer-scroll' && typeof event.data.targetId === 'string') {
        document.getElementById(event.data.targetId)?.scrollIntoView({ block: 'start', inline: 'nearest' });
      }
    });

    document.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link || link.target || event.defaultPrevented || window.parent === window) return;
      const destination = new URL(link.href, window.location.href);
      if (link.getAttribute('href').startsWith('#')) return;
      if (destination.origin !== window.location.origin) return;
      const supported = new Set(['/', '/about', '/menu', '/gallery', '/order', '/reservations', '/my-orders', '/account']);
      if (!supported.has(destination.pathname)) return;
      event.preventDefault();
      window.parent.postMessage({ type: 'theyos:customer-navigate', path: `${destination.pathname}${destination.hash}` }, window.location.origin);
    }, true);
    return;
  }

  const destination = `${window.location.pathname}${window.location.hash}`;
  window.location.replace(`/customer-app.html?page=${encodeURIComponent(destination)}`);
})();
