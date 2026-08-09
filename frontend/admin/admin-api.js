// admin-api.js
// Shared fetch wrapper + formatting helpers for every admin page.
// Assumes a staff JWT was stored under localStorage 'staffToken' by
// whatever staff-login page you have (not included in this build).

export const API_BASE_URL = "http://localhost:3000";

// login.html and admin-shell.js both need these - login.html writes the
// session here after a successful POST /api/admin/staff/login, and
// admin-shell.js reads it on every other page to decide whether to render
// the dashboard or bounce to login.html. Previously these two functions
// didn't exist in this file at all, so importing them in login.html threw
// immediately and blocked staff sign-in entirely.
export function setStaffSession(token, staff) {
  localStorage.setItem('staffToken', token);
  localStorage.setItem('staffInfo', JSON.stringify(staff));
}

export function getStaffToken() {
  return localStorage.getItem('staffToken');
}

export async function adminFetch(path, options = {}) {
  const token = localStorage.getItem('staffToken');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Session expired / not logged in - bounce back to login.
    localStorage.removeItem('staffToken');
    localStorage.removeItem('staffInfo');
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
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}