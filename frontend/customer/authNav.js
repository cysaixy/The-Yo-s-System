// authNav.js
// Transforms the plain account icon into a name+avatar pill with a dropdown
// menu (My Profile, My Orders, Log out). Loaded as a module on every page.

import { auth, onAuthStateChanged, signOut } from "./firebase-init.js";

const ACCOUNT_CACHE_KEY = 'theYosNavAccount';

function getCachedAccount() {
  try {
    const cached = JSON.parse(localStorage.getItem(ACCOUNT_CACHE_KEY) || 'null');
    if (!cached || typeof cached.displayName !== 'string') return null;
    return {
      displayName: cached.displayName,
      photoURL: typeof cached.photoURL === 'string' ? cached.photoURL : ''
    };
  } catch (error) {
    console.warn('Could not read cached account navigation state:', error);
    return null;
  }
}

// ── Build dropdown once the DOM is ready ──────────────────────────────────
function initAccountDropdown() {
  const accountLi = document.getElementById('navAccountLink')?.closest('li');
  if (!accountLi) return;

  // Replace the plain <li> contents with the pill + dropdown structure
  accountLi.classList.add('nav-account-li');
  accountLi.innerHTML = `
    <button type="button" class="nav-account-pill" id="navAccountBtn" aria-haspopup="true" aria-expanded="false">
      <span class="nav-account-avatar" id="navAccountAvatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
      </span>
      <span class="nav-account-name" id="navAccountName">Account</span>
      <svg class="nav-account-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <div class="nav-account-dropdown" id="navAccountDropdown" role="menu">
      <div class="nav-account-meta">
        <div class="nav-account-meta-role">Account</div>
      </div>
      <div class="nav-account-items">
        <a href="/account" class="nav-account-item" role="menuitem">
          <span class="nav-account-item-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </span>
          My Profile
        </a>
        <a href="/my-orders" class="nav-account-item" role="menuitem">
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
    </div>
  `;

  const pill     = document.getElementById('navAccountBtn');
  const dropdown = document.getElementById('navAccountDropdown');
  const avatar   = document.getElementById('navAccountAvatar');
  const name     = document.getElementById('navAccountName');
  const logoutBtn = document.getElementById('navLogoutBtn');

  function showSignedInAccount(displayName, photoURL) {
    const firstName = displayName.split(' ')[0].split('@')[0] || 'Account';
    name.textContent = firstName;
    pill.classList.add('is-logged-in');

    if (photoURL) {
      const image = document.createElement('img');
      image.src = photoURL;
      image.alt = firstName;
      image.referrerPolicy = 'no-referrer';
      avatar.replaceChildren(image);
    } else {
      const initials = displayName.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
      const initialsLabel = document.createElement('span');
      initialsLabel.className = 'nav-avatar-initials';
      initialsLabel.textContent = initials;
      avatar.replaceChildren(initialsLabel);
    }
  }

  const cachedAccount = getCachedAccount();
  if (cachedAccount && typeof cachedAccount.displayName === 'string') {
    showSignedInAccount(cachedAccount.displayName, cachedAccount.photoURL);
  }

  // ── Toggle open/close ────────────────────────────────────────────────────
  function openDropdown() {
    dropdown.classList.add('open');
    pill.setAttribute('aria-expanded', 'true');
  }
  function closeDropdown() {
    dropdown.classList.remove('open');
    pill.setAttribute('aria-expanded', 'false');
  }

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.contains('open') ? closeDropdown() : openDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!accountLi.contains(e.target)) closeDropdown();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDropdown();
  });

  // Close when a menu link is clicked
  dropdown.querySelectorAll('.nav-account-item').forEach(item => {
    item.addEventListener('click', closeDropdown);
  });

  // ── Log out ──────────────────────────────────────────────────────────────
  logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = '/account';
  });

  // ── Auth state → update pill and dropdown ───────────────────────────────
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const displayName = user.displayName || user.email || 'Account';
      showSignedInAccount(displayName, user.photoURL);
      try {
        localStorage.setItem(ACCOUNT_CACHE_KEY, JSON.stringify({
          displayName,
          photoURL: user.photoURL || ''
        }));
      } catch (error) {
        console.warn('Could not cache account navigation state:', error);
      }
    } else {
      try {
        localStorage.removeItem(ACCOUNT_CACHE_KEY);
      } catch (error) {
        console.warn('Could not clear cached account navigation state:', error);
      }
      name.textContent = 'Sign In';
      pill.classList.remove('is-logged-in');
      avatar.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>`;
      // Make the pill link to sign-in when logged out
      pill.onclick = () => { window.location.href = '/account'; };
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAccountDropdown);
} else {
  initAccountDropdown();
}
