// customer-nav.js
// Shared top navigation component for all customer-facing pages.
// Renders the brand logo, responsive navigation links, profile SVG icon,
// Firebase auth state (logged-in badge / sign out), and mobile drawer menu.

import { auth, onAuthStateChanged, signOut } from "./firebase-init.js";

const NAV_LINKS = [
  { key: 'about', label: 'About', href: 'about.html' },
  { key: 'menu', label: 'Menu', href: 'menu.html' },
  { key: 'gallery', label: 'Gallery', href: 'gallery.html' },
  { key: 'reviews', label: 'Reviews', href: 'order.html#feedback' },
  { key: 'reservations', label: 'Reserve', href: 'reservations.html' },
  { key: 'my-orders', label: 'My Orders', href: 'my-orders.html' },
];

const USER_ICON_SVG = `
  <svg class="nav-user-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="7.5" r="4.2"/>
    <path d="M4.5 20.2a7.5 7.5 0 0 1 15 0"/>
  </svg>
`;

const ACCOUNT_ICON_SVG = `
  <svg class="nav-account-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>
`;

function detectActiveKey() {
  const path = window.location.pathname.toLowerCase();
  const file = path.split('/').pop() || 'index.html';
  if (file.includes('about')) return 'about';
  if (file.includes('menu')) return 'menu';
  if (file.includes('gallery')) return 'gallery';
  if (file.includes('reservations')) return 'reservations';
  if (file.includes('my-orders')) return 'my-orders';
  if (file.includes('account')) return 'account';
  if (file.includes('order')) {
    if (window.location.hash === '#feedback') return 'reviews';
    return 'order';
  }
  return '';
}

export function renderCustomerNav({ active = '' } = {}) {
  const activeKey = active || detectActiveKey();

  let header = document.querySelector('header');
  if (!header) {
    header = document.createElement('header');
    document.body.insertBefore(header, document.body.firstChild);
  }
  header.id = 'siteHeader';

  header.innerHTML = `
    <a href="index.html" class="logo-link">
      <img src="../pics&vids/the-yo's_logo.jpg" alt="The~Yo's Logo" class="logo-img">
      <span class="logo-text">The~Yo's</span>
    </a>
    <nav id="siteNav">
      <ul>
        ${NAV_LINKS.map(item => `
          <li>
            <a href="${item.href}" class="${activeKey === item.key ? 'active' : ''}">
              ${item.label}
            </a>
          </li>
        `).join('')}
        <li>
          <a href="account.html" class="nav-account-btn ${activeKey === 'account' ? 'active' : ''}" id="navAccountLink" title="My Account">
            ${ACCOUNT_ICON_SVG}
            <span class="nav-account-label" id="navAccountLabel"></span>
          </a>
        </li>
        <li id="navSignOutItem" style="display:none;"><a href="#" id="navSignOutLink">Sign Out</a></li>
        <li><a href="order.html" class="nav-btn ${activeKey === 'order' ? 'active' : ''}">Order Now</a></li>
      </ul>
    </nav>
    <button class="nav-toggle" id="navToggle" type="button" aria-label="Toggle navigation menu">☰</button>
  `;

  // ---- Mobile Navigation Toggle ----
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');

  function openNav() {
    siteNav.classList.add('open');
    navToggle.textContent = '✕';
    navToggle.setAttribute('aria-label', 'Close menu');
    document.body.style.overflow = 'hidden';
  }

  function closeNav() {
    siteNav.classList.remove('open');
    navToggle.textContent = '☰';
    navToggle.setAttribute('aria-label', 'Open menu');
    document.body.style.overflow = '';
  }

  if (navToggle && siteNav) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      siteNav.classList.contains('open') ? closeNav() : openNav();
    });

    siteNav.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeNav();
    });

    document.addEventListener('click', (e) => {
      if (siteNav.classList.contains('open') && !siteNav.contains(e.target) && e.target !== navToggle) {
        closeNav();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && siteNav.classList.contains('open')) {
        closeNav();
      }
    });
  }

  // ---- Firebase Auth Listener (Updates tooltip / Sign Out) ----
  const accountLink = document.getElementById("navAccountLink");
  const signOutItem = document.getElementById("navSignOutItem");

  onAuthStateChanged(auth, (user) => {
    if (!accountLink) return;
    if (user) {
      const label = user.displayName || user.email || "Account";
      const shortName = label.split(" ")[0].split("@")[0];
      accountLink.title = `My Account (${shortName})`;
      accountLink.classList.add('is-logged-in');
      accountLink.href = "account.html";
      if (signOutItem) signOutItem.style.display = "";
    } else {
      accountLink.title = "Sign In / My Account";
      accountLink.classList.remove('is-logged-in');
      accountLink.href = "account.html";
      if (signOutItem) signOutItem.style.display = "none";
    }
  });

  const signOutLink = document.getElementById("navSignOutLink");
  if (signOutLink) {
    signOutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await signOut(auth);
      window.location.reload();
    });
  }

  return { activeKey };
}

// Auto-run when loaded directly as a module
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderCustomerNav();
  });
} else {
  renderCustomerNav();
}
