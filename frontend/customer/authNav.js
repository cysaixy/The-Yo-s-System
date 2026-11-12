// authNav.js
// Hydrates the pre-rendered account pill in the nav.
// The pill HTML is already in every page's static markup (matching size),
// so there is zero layout shift when this script runs.
//
// Logged out  → plain <a> link to account page, no dropdown
// Logged in   → button with caret + dropdown (Profile, My Orders, Log out)

// Firebase is imported lazily (below) so the cached account state paints
// immediately instead of waiting for the SDK download — that wait was the
// visible "Sign In → name" flicker in the nav.

const CACHE_KEY = 'theYosNavAccount';
const isEmbedded = document.documentElement.classList.contains('customer-app-embedded');

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safePhotoUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function goTo(path) {
  if (typeof window.theYosNavigate === 'function') return window.theYosNavigate(path);
  if (isEmbedded && window.parent !== window) {
    window.parent.postMessage({ type: 'theyos:customer-navigate', path }, window.location.origin);
    return;
  }
  window.location.href = path;
}

function getCached() {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (v && typeof v.displayName === 'string') return v;
  } catch {}
  return null;
}

function initAccountDropdown() {
  const accountLi = document.getElementById('navAccountLink')?.closest('li');
  if (!accountLi) return;
  accountLi.classList.add('nav-account-li');

  // Inject the dropdown panel once (hidden until logged in)
  const dropdownHTML = `
    <div class="nav-account-dropdown" id="navAccountDropdown" role="menu">
      <div class="nav-account-meta">
        <div class="nav-account-meta-role">Account</div>
      </div>
      <div class="nav-account-items">
        <a href="/account" data-customer-path="/account" class="nav-account-item" role="menuitem">
          <span class="nav-account-item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          My Profile
        </a>
        <a href="/my-orders" data-customer-path="/my-orders" class="nav-account-item" role="menuitem">
          <span class="nav-account-item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
              <rect x="9" y="3" width="6" height="4" rx="1"/>
              <line x1="9" y1="12" x2="15" y2="12"/>
              <line x1="9" y1="16" x2="13" y2="16"/>
            </svg>
          </span>
          My Orders
        </a>
        <div class="nav-account-divider"></div>
        <button type="button" class="nav-account-item nav-account-logout" id="navLogoutBtn" role="menuitem">
          <span class="nav-account-item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </span>
          Log out
        </button>
      </div>
    </div>`;
  accountLi.insertAdjacentHTML('beforeend', dropdownHTML);

  const dropdown  = document.getElementById('navAccountDropdown');
  const logoutBtn = document.getElementById('navLogoutBtn');

  // Helpers to get current pill elements (they stay in the DOM, just updated)
  const getBtn    = () => document.getElementById('navAccountLink');
  const getAvatar = () => accountLi.querySelector('.nav-account-avatar');
  const getNameEl = () => accountLi.querySelector('.nav-account-name');

  // ── Dropdown toggle ──────────────────────────────────────────────────────
  function openDropdown()  { dropdown.classList.add('open');    getBtn()?.setAttribute('aria-expanded', 'true'); }
  function closeDropdown() { dropdown.classList.remove('open'); getBtn()?.setAttribute('aria-expanded', 'false'); }

  accountLi.addEventListener('click', (e) => {
    const btn = getBtn();
    if (!btn || btn.tagName !== 'BUTTON') return; // only active when logged in
    if (btn.contains(e.target)) {
      e.stopPropagation();
      dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
    }
  });
  document.addEventListener('click', (e) => { if (!accountLi.contains(e.target)) closeDropdown(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDropdown(); });
  dropdown.querySelectorAll('.nav-account-item').forEach(item => item.addEventListener('click', closeDropdown));

  let firebase = null; // { auth, signOut, onAuthStateChanged } once loaded

  logoutBtn.addEventListener('click', async () => {
    closeDropdown();
    try { localStorage.removeItem(CACHE_KEY); } catch {}
    setLoggedOut();
    if (firebase) await firebase.signOut(firebase.auth);
    goTo('/account');
  });

  // ── State setters (update content in-place, no structural DOM changes) ───
  function setLoggedIn(displayName, photoURL) {
    const firstName = (displayName || 'Account').split(' ')[0].split('@')[0];
    const btn = getBtn();

    // Swap <a> → <button> once
    if (btn && btn.tagName === 'A') {
      const newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.id = 'navAccountLink';
      newBtn.className = 'nav-account-pill is-logged-in';
      if (btn.dataset.customerPath) newBtn.dataset.customerPath = btn.dataset.customerPath;
      newBtn.setAttribute('aria-haspopup', 'true');
      newBtn.setAttribute('aria-expanded', 'false');
      // Move children across
      while (btn.firstChild) newBtn.appendChild(btn.firstChild);
      // Add caret svg
      newBtn.insertAdjacentHTML('beforeend',
        `<svg class="nav-account-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`);
      btn.replaceWith(newBtn);
    } else if (btn) {
      btn.classList.add('is-logged-in');
    }

    // Update name + avatar in-place
    const nameEl = getNameEl();
    const avatar = getAvatar();
    if (nameEl) nameEl.textContent = firstName;
    if (avatar) {
      const photo = safePhotoUrl(photoURL);
      const initials = (displayName || 'A').split(' ').map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
      avatar.innerHTML = photo
        ? `<img src="${escapeText(photo)}" alt="${escapeText(firstName)}" referrerpolicy="no-referrer">`
        : `<span class="nav-avatar-initials">${escapeText(initials)}</span>`;
    }
  }

  function setLoggedOut() {
    const btn = getBtn();
    // Swap <button> → <a> if needed
    if (btn && btn.tagName === 'BUTTON') {
      const newLink = document.createElement('a');
      newLink.href = '/account';
      newLink.id = 'navAccountLink';
      if (btn.dataset.customerPath) newLink.dataset.customerPath = btn.dataset.customerPath;
      newLink.className = 'nav-account-pill nav-account-signin';
      while (btn.firstChild) {
        const child = btn.firstChild;
        // Drop the caret
        if (child.classList?.contains('nav-account-caret')) { btn.removeChild(child); continue; }
        newLink.appendChild(child);
      }
      btn.replaceWith(newLink);
    }

    const nameEl = getNameEl();
    const avatar = getAvatar();
    if (nameEl) nameEl.textContent = 'Sign In';
    if (avatar) avatar.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>`;
    closeDropdown();
  }

  // Apply cached state immediately — before Firebase resolves — to avoid flash
  const cached = getCached();
  if (cached) setLoggedIn(cached.displayName, cached.photoURL);

  // ── Firebase auth listener (loaded after the cached paint) ───────────────
  let staffChecked = false;
  import('./firebase-init.js').then(mod => {
    firebase = mod;
    mod.onAuthStateChanged(mod.auth, async (user) => {
      if (user) {
        // One identity per browser: if a staff session is live here, the
        // customer session is ended (staff must sign out of admin first).
        // Checked once per page, only by the visible shell, not each iframe.
        if (!staffChecked && !isEmbedded) {
          staffChecked = true;
          try {
            const res = await fetch('/api/admin/staff/session', { credentials: 'include' });
            const data = res.ok ? await res.json() : null;
            if (data?.active) {
              // Last sign-in wins: a customer who just signed in ends the
              // staff session; otherwise the older customer session ends.
              let signedInAt = 0;
              try { signedInAt = Number(localStorage.getItem('theYosCustomerSignInAt')) || 0; } catch {}
              if (Date.now() - signedInAt < 2 * 60 * 1000) {
                await fetch('/api/admin/staff/logout', { method: 'POST', credentials: 'include' });
                try { localStorage.removeItem('staffInfo'); localStorage.removeItem('__admin_csrf_token'); } catch {}
              } else {
                await mod.signOut(mod.auth);
                return; // listener fires again with user = null
              }
            }
          } catch {}
        }
        const displayName = user.displayName || user.email || 'Account';
        setLoggedIn(displayName, user.photoURL || '');
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ displayName, photoURL: user.photoURL || '' })); } catch {}
      } else {
        try { localStorage.removeItem(CACHE_KEY); } catch {}
        setLoggedOut();
      }
    });
  }).catch(err => console.warn('Account status unavailable:', err));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAccountDropdown);
} else {
  initAccountDropdown();
}
