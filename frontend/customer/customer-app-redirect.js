(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('embedded') === '1' || document.body?.dataset.customerAppHost === 'true') {
    document.documentElement.classList.add('customer-app-embedded');

    window.addEventListener('message', event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'theyos:customer-theme') return;
      document.body.classList.toggle('coffee-night', event.data.dark);
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
