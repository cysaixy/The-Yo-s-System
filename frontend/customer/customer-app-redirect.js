(() => {
  const params = new URLSearchParams(window.location.search);
  const isEmbedded = params.get('embedded') === '1' || window.parent !== window;
  const pendingHash = window.location.hash && window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';

  const syncEmbeddedState = () => {
    if (!isEmbedded) return;
    document.documentElement.classList.add('customer-app-embedded');
    if (document.body) document.body.classList.add('customer-app-embedded');

    document.querySelectorAll('header, #siteNav, .logo-link, .site-header').forEach(node => {
      node.style.display = 'none';
      node.setAttribute('data-theyos-hidden', 'embedded');
    });
  };

  const setupHashScroll = () => {
    if (!pendingHash) return;
    const target = document.getElementById(pendingHash) || document.querySelector(`[id="${CSS.escape(pendingHash)}"]`);
    if (!target) return;

    const restoreHash = () => {
      const current = new URL(window.location.href);
      current.hash = '';
      history.replaceState({}, '', `${current.pathname}${current.search}`);
      requestAnimationFrame(() => {
        target.scrollIntoView({ block: 'start', inline: 'nearest' });
      });
    };

    if (document.readyState === 'complete') {
      restoreHash();
      return;
    }

    window.addEventListener('load', restoreHash, { once: true });
  };

  syncEmbeddedState();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncEmbeddedState, { once: true });
  }

  if (isEmbedded) {
    setupHashScroll();

    window.addEventListener('message', event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'theyos:customer-theme') return;
      document.body?.classList.toggle('coffee-night', event.data.dark);
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
