// admin-shell.js
// Renders the sidebar + header shared by every admin page and returns the
// logged-in staff session, or null (after redirecting to login) if nobody
// is signed in. Every admin page should call this first and stop if it
// returns null - see the "if (session) init();" pattern in each page.

// Clean outline icons (stroke = currentColor, so they inherit the nav
// item's color automatically) instead of emoji.
const ICONS = {
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>',
  inventory: '<path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/>',
  products: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  pos: '<rect x="3" y="5" width="18" height="12" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
  sales: '<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M9 12h6M9 16h6M9 8h3"/>',
  reservations: '<rect x="3.5" y="5" width="17" height="16" rx="1.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  cashtx: '<path d="M5 8h11l-3-3M19 16H8l3 3"/>',
  cashacc: '<path d="M3 9 12 4l9 5"/><path d="M4 9h16v2H4z"/><path d="M5 11v7M9 11v7M15 11v7M19 11v7"/><path d="M3 21h18"/>',
  budget: '<path d="M12 3a9 9 0 1 0 9 9h-9V3Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z"/>',
  purchases: '<circle cx="9" cy="20" r="1"/><circle cx="17" cy="20" r="1"/><path d="M3 4h2l2.4 11.4a1.5 1.5 0 0 0 1.5 1.6h8.2a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/>',
  dashboard: '<path d="M4 20V11M10 20V4M16 20v-6"/><path d="M2 20h20"/>',
  staff: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="8.3" r="2.3"/><path d="M15 14.2c2.6.5 4.6 2.7 4.6 5.3"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1 5.6 5.6"/>',
  signout: '<path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
};

function iconSvg(name) {
  return `<svg viewBox="0 0 24 24">${ICONS[name] || ''}</svg>`;
}

const NAV_MAIN = [
  { key: 'home', label: 'Home', href: 'home.html', icon: 'home' },
  { key: 'inventory', label: 'Inventory', href: 'inventory.html', icon: 'inventory', perm: 'can_access_inventory' },
  { key: 'products', label: 'Products', href: 'products.html', icon: 'products' },
  { key: 'pos', label: 'Point of Sale', href: 'pos.html', icon: 'pos' },
  { key: 'sales', label: 'Sales Transactions', href: 'sales.html', icon: 'sales' },
  { key: 'reservations', label: 'Reservations', href: 'reservations.html', icon: 'reservations' },
  { key: 'cash-transactions', label: 'Cash Transactions', href: 'cash-transactions.html', icon: 'cashtx', perm: 'can_access_reports' },
  { key: 'cash-accounts', label: 'Cash Accounts', href: 'cash-accounts.html', icon: 'cashacc', perm: 'can_access_reports' },
  { key: 'budget', label: 'Budget Planner', href: 'budget-planner.html', icon: 'budget', perm: 'can_access_reports' },
  { key: 'purchases', label: 'Purchases', href: 'purchases.html', icon: 'purchases', perm: 'can_access_stock_in' },
];

const NAV_ADMIN = [
  { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'dashboard' },
  { key: 'staff', label: 'Staff', href: 'staff.html', icon: 'staff', adminOnly: true },
  { key: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings' },
];

// Whether this staff member can open this nav item at all. Admins bypass
// every check. Everyone else (Cashier, Kitchen, Manager - your backend
// doesn't currently distinguish between these) is gated by the same
// staff_permissions flags requirePermission() checks server-side. This
// state comes from the staff object cached at login, so it only changes
// the next time they sign back in - matching how the JWT session itself
// only refreshes on login.
function hasAccess(item, staff) {
  if (staff.role === 'Admin') return true;
  if (item.adminOnly) return false;
  if (item.perm) return !!staff[item.perm];
  return true; // default access - Dashboard, POS, Sales, Reservations, Products (read), Settings
}

function navLinkHTML(item, active, staff) {
  const allowed = hasAccess(item, staff);
  if (!allowed) {
    return `<span class="admin-nav-link disabled" title="Ask an Admin to grant you access">
      <span class="icon">${iconSvg(item.icon)}</span><span>${item.label}</span>
      <span class="lock-icon">${iconSvg('lock')}</span>
    </span>`;
  }
  return `<a class="admin-nav-link${item.key === active ? ' active' : ''}" href="${item.href}">
    <span class="icon">${iconSvg(item.icon)}</span><span>${item.label}</span>
  </a>`;
}

// Decodes a JWT's payload without verifying the signature (verification
// happens server-side - this is purely a client-side "is it worth even
// trying" check) and returns its `exp` claim in milliseconds, or null if
// the token is malformed/unparseable. Used to catch an expired session
// BEFORE the page fires off a batch of doomed API calls, instead of
// letting every one of them independently hit the backend, get a 401,
// and log "Staff Token Error: jwt expired" in a spammy burst.
function getTokenExpiryMs(token) {
  try {
    const payloadB64 = token.split('.')[1];
    const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null; // malformed token - treat as expired, handled by caller
  }
}

function clearStaffSessionAndRedirect(reason) {
  localStorage.removeItem('staffToken');
  localStorage.removeItem('staffInfo');
  const redirect = encodeURIComponent(window.location.pathname.split('/').pop() || 'home.html');
  window.location.href = `login.html?expired=1&redirect=${redirect}`;
}

export function renderAdminShell({ active, title }) {
  const token = localStorage.getItem('staffToken');
  const staffRaw = localStorage.getItem('staffInfo');

  if (!token || !staffRaw) {
    window.location.href = 'login.html';
    return null;
  }

  // Check expiry BEFORE rendering anything or letting any page script run
  // its fetch calls. A token that's already expired (or expires in the
  // next few seconds - close enough that it'll die mid-request) sends the
  // user straight to login instead of rendering a page that immediately
  // fires 3-4 API calls that are all guaranteed to 401.
  const expiryMs = getTokenExpiryMs(token);
  const EXPIRY_GRACE_MS = 5000;
  if (expiryMs === null || expiryMs - EXPIRY_GRACE_MS <= Date.now()) {
    clearStaffSessionAndRedirect('expired');
    return null;
  }

  let staff;
  try {
    staff = JSON.parse(staffRaw);
  } catch {
    window.location.href = 'login.html';
    return null;
  }

  const root = document.getElementById('adminShell');
  const initial = (staff.name || staff.email || '?').charAt(0).toUpperCase();

  root.innerHTML = `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <div class="admin-logo"><span class="mark">TY</span> THE~YO'S</div>
        <div class="nav-group-label">Main Menu</div>
        ${NAV_MAIN.map(item => navLinkHTML(item, active, staff)).join('')}
        <div class="nav-group-label">Admin</div>
        ${NAV_ADMIN.map(item => navLinkHTML(item, active, staff)).join('')}
      </aside>
      <div class="admin-main">
        <header class="admin-header">
          <h1>${title}</h1>
          <div class="admin-user">
            <div class="who">
              <strong>${staff.name || staff.email}</strong>
              <span>${staff.role || 'Staff'}</span>
            </div>
            <div class="avatar">${initial}</div>
            <button class="logout-btn" id="adminLogoutBtn">Log Out</button>
          </div>
        </header>
        <div class="admin-body">
          <div class="admin-section" id="adminContent"></div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('adminLogoutBtn').addEventListener('click', () => {
    localStorage.removeItem('staffToken');
    localStorage.removeItem('staffInfo');
    window.location.href = 'login.html';
  });

  // A signed-in staff member who isn't allowed on this page (e.g. they
  // bookmarked it before permissions changed) gets bounced to Home rather
  // than seeing a broken/empty page.
  const activeItem = [...NAV_MAIN, ...NAV_ADMIN].find(i => i.key === active);
  if (activeItem && !hasAccess(activeItem, staff)) {
    alert("You don't have permission to access this page. Ask an Admin to grant it.");
    window.location.href = 'home.html';
    return null;
  }

  // Belt-and-suspenders: if the staff member leaves this page open long
  // enough for the token to expire mid-session (rather than arriving with
  // one already expired), catch it the moment it happens instead of
  // waiting for the next API call's 401 to reveal it.
  const msUntilExpiry = expiryMs - Date.now();
  window.setTimeout(() => {
    clearStaffSessionAndRedirect('expired-inline');
  }, msUntilExpiry);

  return { staff, token };
}