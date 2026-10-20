const SUPPORTED_PATHS = new Set(['/', '/about', '/menu', '/gallery', '/order', '/reviews', '/reservations', '/my-orders', '/account']);
const frame = document.getElementById('customerFeatureFrame');

function normalizePath(path) {
  const url = new URL(path, window.location.origin);
  if (url.pathname === '/order' && url.hash === '#feedback') {
    url.pathname = '/reviews';
    url.search = '';
    url.hash = '';
  }
  return url;
}

function requestedPath() {
  const page = new URLSearchParams(window.location.search).get('page')
    || (window.location.pathname === '/reviews' ? '/reviews' : '/');
  const url = normalizePath(page);
  return SUPPORTED_PATHS.has(url.pathname) ? `${url.pathname}${url.search}${url.hash}` : '/';
}

function updateActiveLink(path) {
  const normalizedPath = normalizePath(path).pathname;
  document.querySelectorAll('[data-customer-path]').forEach(link => {
    link.classList.toggle('active', normalizePath(link.dataset.customerPath).pathname === normalizedPath);
  });
}

function navigate(path, { addHistory = false } = {}) {
  const url = normalizePath(path);
  if (!SUPPORTED_PATHS.has(url.pathname)) return;

  const nextPath = `${url.pathname}${url.search}${url.hash}`;
  if (addHistory) {
    history.pushState({ path: nextPath }, '', `customer-app.html?page=${encodeURIComponent(nextPath)}`);
  }
  updateActiveLink(nextPath);
  url.searchParams.set('embedded', '1');
  frame.src = `${url.pathname}${url.search}${url.hash}`;
}

function sendThemeToFrame() {
  const isDark = document.body.classList.contains('coffee-night') || localStorage.getItem('theYosTheme') === 'dark';
  try {
    frame.contentWindow?.postMessage({
      type: 'theyos:customer-theme',
      dark: isDark,
    }, window.location.origin);
  } catch (e) {}
}

frame.addEventListener('load', () => {
  sendThemeToFrame();
});

document.addEventListener('click', event => {
  const link = event.target.closest('[data-customer-path]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(link.dataset.customerPath, { addHistory: true });
});

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'theyos:customer-navigate') {
    navigate(event.data.path, { addHistory: true });
  } else if (event.data?.type === 'theyos:request-theme') {
    sendThemeToFrame();
  }
});
window.addEventListener('popstate', () => navigate(requestedPath()));

document.getElementById('coffeeThemeToggle')?.addEventListener('click', () => {
  requestAnimationFrame(sendThemeToFrame);
});

navigate(requestedPath());
