// admin-api.js
// Shared fetch wrapper + formatting helpers for every admin page.
// Uses httpOnly cookie for authentication (set by /api/admin/staff/login).
// No localStorage token storage — cookies are sent automatically with credentials: 'include'.
// CSRF: also reads the non-httpOnly csrf_token cookie and sends it back as X-CSRF-Token
// so that state-changing POST/PUT requests are protected against cross-site request forgery.

// Left empty on purpose so every request is relative to whatever origin
// served this page. That means:
//   - On Vercel: adminFetch('/api/admin/...') hits the same deployment's
//     /api/index.js function — no domain to hardcode or keep in sync.
//   - Locally via backend/server.js: the admin pages are served from
//     http://localhost:3000 too, so relative paths resolve the same way.
// If you ever split the frontend and backend into two separate domains,
// set this back to an absolute URL (e.g. "https://your-api.vercel.app").
export const API_BASE_URL = "";

function getCSRFToken() {
  if (typeof document === 'undefined') return '';
  // Read csrf_token cookie; be tolerant of whitespace and ordering
  const match = document.cookie.match(/^\s*csrf_token=([^;]*)/);
  return match ? match[1].trim() : '';
}

export function clearStaffSession() {
  localStorage.removeItem('staffInfo');
}

// Helper: persist the csrfToken from login response so adminFetch can
// fall back to it if the cookie read fails (e.g. shortly after navigation).
export function setCSRFTokenFromLogin(token) {
  if (token) localStorage.setItem('__admin_csrf_token', token);
}

export async function adminFetch(path, options = {}) {
  // Try cookie first, then fall back to the token stored at login
  let csrfToken = getCSRFToken();
  if (!csrfToken) {
    csrfToken = localStorage.getItem('__admin_csrf_token') || '';
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    'X-CSRF-Token': csrfToken,
  };
  // Cookie is sent automatically with credentials: 'include'
  const fetchOptions = { ...options, headers, credentials: 'include' };

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, fetchOptions);
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const error = new Error(isOffline
      ? 'You appear to be offline. Reconnect to the internet, then try again.'
      : 'We could not reach The Yo\'s server. Check your internet connection or DNS, then try again.');
    error.code = isOffline ? 'OFFLINE' : 'NETWORK_UNREACHABLE';
    error.cause = cause;
    throw error;
  }

  if (res.status === 401) {
    // Session expired / not logged in - bounce back to login.
    clearStaffSession();
    window.location.href = 'login.html';
    throw new Error('Session expired. Redirecting to login…');
  }

  return res;
}

export function peso(n) {
  return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
}

export function formatDate(value, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-PH', opts);
}

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&', '<': '<', '>': '>', '"': '"', "'": ''',
  }[c]));
}