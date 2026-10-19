const SUPPORTED_PATHS = new Set(['/', '/about', '/menu', '/gallery', '/order', '/reservations', '/my-orders', '/account']);
const frame = document.getElementById('customerFeatureFrame');
let pendingScrollTarget = '';
let pendingFramePath = '';
let scrollFallbackTimer = 0;

function scrollFeatureToPendingTarget() {
  if (!pendingScrollTarget || !pendingFramePath) return;
  const targetId = pendingScrollTarget;
  pendingScrollTarget = '';
  pendingFramePath = '';
  window.clearTimeout(scrollFallbackTimer);
  scrollFallbackTimer = 0;
  frame.contentWindow?.postMessage({
    type: 'theyos:customer-scroll',
    targetId,
  }, window.location.origin);
}

frame.addEventListener('load', () => {
  if (!pendingScrollTarget || !pendingFramePath) return;
  try {
    if (frame.contentWindow.location.pathname !== pendingFramePath) return;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'SecurityError') return;
    throw error;
  }
  if (pendingFramePath === '/order') {
    scrollFallbackTimer = window.setTimeout(scrollFeatureToPendingTarget, 2500);
    return;
  }
  scrollFeatureToPendingTarget();
});

function requestedPath() {
  const value = new URLSearchParams(window.location.search).get('page') || '/';
  const url = new URL(value, window.location.origin);
  return SUPPORTED_PATHS.has(url.pathname) ? `${url.pathname}${url.hash}` : '/';
}

function updateActiveLink(path) {
  const url = new URL(path, window.location.origin);
  const normalizedPath = `${url.pathname}${url.hash}`;
  document.querySelectorAll('[data-customer-path]').forEach(link => {
    const linkPath = link.dataset.customerPath;
    link.classList.toggle('active', linkPath === normalizedPath);
  });
}

function navigate(path, { addHistory = false } = {}) {
  const url = new URL(path, window.location.origin);
  if (!SUPPORTED_PATHS.has(url.pathname)) return;
  const nextPath = `${url.pathname}${url.hash}`;
  pendingScrollTarget = url.hash ? decodeURIComponent(url.hash.slice(1)) : '';
  pendingFramePath = url.pathname;
  if (addHistory) history.pushState({ path: nextPath }, '', `customer-app.html?page=${encodeURIComponent(nextPath)}`);
  updateActiveLink(nextPath);
  url.searchParams.set('embedded', '1');
  url.hash = '';
  frame.src = `${url.pathname}${url.search}`;
}

document.addEventListener('click', event => {
  const link = event.target.closest('[data-customer-path]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate(link.dataset.customerPath, { addHistory: true });
});

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type === 'theyos:customer-layout-ready') {
    if (pendingFramePath === '/order') scrollFeatureToPendingTarget();
    return;
  }
  if (event.data?.type === 'theyos:customer-navigate') {
    navigate(event.data.path, { addHistory: true });
  }
});
window.addEventListener('popstate', () => navigate(requestedPath()));

// Keep dark-mode changes visually in sync without reloading the feature page.
document.getElementById('coffeeThemeToggle')?.addEventListener('click', () => {
  requestAnimationFrame(() => frame.contentWindow?.postMessage({
    type: 'theyos:customer-theme',
    dark: document.body.classList.contains('coffee-night'),
  }, window.location.origin));
});

navigate(requestedPath());
