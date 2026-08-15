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
      <span class="icon">${iconSvg(item.icon)}</span><span class="nav-text">${item.label}</span>
      <span class="lock-icon">${iconSvg('lock')}</span>
    </span>`;
  }
  return `<a class="admin-nav-link${item.key === active ? ' active' : ''}" href="${item.href}" title="${item.label}">
    <span class="icon">${iconSvg(item.icon)}</span><span class="nav-text">${item.label}</span>
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

// How long before actual expiry to show the warning banner. Staff JWTs
// are minted with a 1-day expiry (see backend/src/utils/generateToken.js)
// so this only ever fires for someone who's had a page open ~24h - it's
// a courtesy heads-up, not a sign anything is broken.
const SESSION_WARNING_MS = 5 * 60 * 1000;
const ONLINE_ORDER_SEEN_KEY = 'yo-admin-online-order-seen';
const ADMIN_API_BASE_URL = 'http://localhost:3000';

function readSeenOnlineOrderIds() {
  try {
    const ids = JSON.parse(localStorage.getItem(ONLINE_ORDER_SEEN_KEY));
    return Array.isArray(ids) ? ids.map(String).slice(-100) : [];
  } catch {
    return [];
  }
}

function writeSeenOnlineOrderIds(ids) {
  localStorage.setItem(ONLINE_ORDER_SEEN_KEY, JSON.stringify([...new Set(ids.map(String))].slice(-100)));
}

function escapeNotificationHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function showOnlineOrderToast(order) {
  const toast = document.createElement('div');
  toast.className = 'online-order-toast';
  toast.innerHTML = `<span class="toast-icon">🔔</span><div><strong>New online order</strong><span>Order #${escapeNotificationHtml(order.id)} · ${escapeNotificationHtml(order.customer_name || 'Customer')} · ₱${Number(order.total_amount || 0).toLocaleString('en-PH')}</span></div><button type="button" aria-label="Dismiss notification">×</button>`;
  document.body.appendChild(toast);
  toast.querySelector('button').addEventListener('click', () => toast.remove());
  window.setTimeout(() => toast.remove(), 8000);
}

function injectOnlineOrderNotificationStyles() {
  if (document.getElementById('onlineOrderNotificationStyles')) return;
  const style = document.createElement('style');
  style.id = 'onlineOrderNotificationStyles';
  style.textContent = `
    .online-order-toast { position:fixed; z-index:1000; right:24px; bottom:24px; width:min(390px, calc(100vw - 32px)); display:flex; align-items:flex-start; gap:11px; padding:15px 42px 15px 15px; border-radius:14px; border:1px solid rgba(163,132,74,.25); background:linear-gradient(135deg,#fff,#fbf7ef); color:var(--ink,#15171a); box-shadow:0 18px 42px rgba(0,0,0,.18); animation:onlineOrderEnter .25s ease both; }
    .online-order-toast .toast-icon { width:32px; height:32px; flex:0 0 32px; display:flex; align-items:center; justify-content:center; border-radius:10px; background:rgba(163,132,74,.15); font-size:1rem; }
    .online-order-toast strong { display:block; font:800 .76rem 'Space Mono',monospace; text-transform:uppercase; color:var(--brass-dark,#8a6d3a); }
    .online-order-toast span { display:block; margin-top:5px; font-size:.8rem; opacity:.7; }
    .online-order-toast button { position:absolute; right:12px; top:10px; border:0; background:transparent; font-size:1.2rem; cursor:pointer; opacity:.5; }
    @keyframes onlineOrderEnter { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:none; } }
  `;
  document.head.appendChild(style);
}

function initOnlineOrderNotifications(token) {
  const count = document.getElementById('onlineOrderCount');
  const button = document.getElementById('adminOnlineOrdersBtn');
  const panel = document.getElementById('onlineOrderPanel');
  if (!count || !button || !panel) return;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', event => {
    if (!panel.contains(event.target) && !button.contains(event.target)) panel.classList.remove('open');
  });

  const renderPanel = orders => {
    panel.innerHTML = `
      <div class="online-order-panel-head"><div><strong>Online Orders</strong><span>${orders.length} pending</span></div><button type="button" id="closeOnlineOrderPanel" aria-label="Close notifications">×</button></div>
      <div class="online-order-panel-list">${orders.length ? orders.slice(0, 5).map(order => `
        <a href="sales.html" class="online-order-panel-item"><span class="online-order-dot"></span><div><strong>Order #${escapeNotificationHtml(order.id)}</strong><span>${escapeNotificationHtml(order.customer_name || 'Customer')} · ₱${Number(order.total_amount || 0).toLocaleString('en-PH')}</span></div></a>`).join('') : '<div class="online-order-panel-empty">No pending online orders.</div>'}</div>
      <a class="online-order-panel-action" href="sales.html">View sales transactions →</a>`;
    panel.querySelector('#closeOnlineOrderPanel')?.addEventListener('click', () => panel.classList.remove('open'));
  };

  let initialized = false;
  const poll = async () => {
    try {
      const res = await fetch(`${ADMIN_API_BASE_URL}/api/admin/sales/orders?status=pending&limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const onlineOrders = (data.orders || []).filter(order => order.source === 'online');
      count.textContent = onlineOrders.length;
      count.style.display = onlineOrders.length ? 'flex' : 'none';
      renderPanel(onlineOrders);

      const seen = readSeenOnlineOrderIds();
      if (!initialized) {
        writeSeenOnlineOrderIds([...seen, ...onlineOrders.map(order => order.id)]);
        initialized = true;
        return;
      }
      const newOrders = onlineOrders.filter(order => !seen.includes(String(order.id)));
      if (newOrders.length) {
        injectOnlineOrderNotificationStyles();
        newOrders.slice(0, 3).forEach(showOnlineOrderToast);
        writeSeenOnlineOrderIds([...seen, ...newOrders.map(order => order.id)]);
      }
    } catch {
      // Notifications should never interrupt staff work when the server is unavailable.
    }
  };
  poll();
  window.setInterval(poll, 20000);
}

function injectSessionWarningStyles() {
  if (document.getElementById('sessionWarningStyles')) return;
  const style = document.createElement('style');
  style.id = 'sessionWarningStyles';
  style.textContent = `
    .session-warning-banner {
      display: flex; align-items: center; gap: 10px;
      background: rgba(184,134,11,0.12); color: var(--warning, #b8860b);
      border-bottom: 1px solid rgba(184,134,11,0.3);
      padding: 10px 20px; font-family: 'Inter', sans-serif; font-size: 0.84rem; font-weight: 600;
    }
    .session-warning-banner .msg { flex: 1; }
    .session-warning-banner button {
      background: transparent; border: 1px solid rgba(184,134,11,0.4); color: var(--warning, #b8860b);
      border-radius: 5px; padding: 4px 10px; font-size: 0.72rem; cursor: pointer; font-weight: 700;
    }
    .session-warning-banner button:hover { background: rgba(184,134,11,0.15); }
  `;
  document.head.appendChild(style);
}

// Shows a dismissible "your session is about to expire" banner just above
// the admin header. Purely informational - the hard redirect timer set in
// renderAdminShell still fires at the real expiry regardless of whether
// this is dismissed, so staff can't accidentally lose the warning and get
// silently logged out.
function showSessionWarningBanner() {
  if (document.getElementById('sessionWarningBanner')) return; // already shown
  injectSessionWarningStyles();

  const shell = document.querySelector('.admin-shell');
  if (!shell) return;

  const banner = document.createElement('div');
  banner.id = 'sessionWarningBanner';
  banner.className = 'session-warning-banner';
  banner.innerHTML = `
    <span class="msg">⏱ Your session will expire in about 5 minutes. Please save or finish any pending work.</span>
    <button type="button" id="sessionWarningDismiss">Dismiss</button>
  `;

  const adminMain = shell.querySelector('.admin-main');
  adminMain.insertBefore(banner, adminMain.firstChild);

  document.getElementById('sessionWarningDismiss').addEventListener('click', () => {
    banner.remove();
  });
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
        <div class="admin-logo"><span class="mark">TY</span><span class="brand-label">THE~YO'S</span><button class="sidebar-toggle" id="adminSidebarToggle" type="button" aria-label="Minimize sidebar" title="Minimize sidebar">☰</button></div>
        <div class="nav-group-label">Main Menu</div>
        ${NAV_MAIN.map(item => navLinkHTML(item, active, staff)).join('')}
        <div class="nav-group-label">Admin</div>
        ${NAV_ADMIN.map(item => navLinkHTML(item, active, staff)).join('')}
      </aside>
      <div class="admin-main">
        <header class="admin-header">
          <h1>${title}</h1>
          <div class="admin-user">
            <div class="admin-notification-wrap"><button class="admin-notification-btn" id="adminOnlineOrdersBtn" title="Pending online orders" aria-label="Pending online orders">🔔<span class="admin-notification-count" id="onlineOrderCount">0</span></button><div class="online-order-panel" id="onlineOrderPanel"></div></div>
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

  const shell = root.querySelector('.admin-shell');
  const toggle = document.getElementById('adminSidebarToggle');
  const sidebarCollapsed = localStorage.getItem('yo-admin-sidebar-collapsed') === 'true';
  shell.classList.toggle('sidebar-collapsed', sidebarCollapsed);
  toggle.setAttribute('aria-label', sidebarCollapsed ? 'Maximize sidebar' : 'Minimize sidebar');
  toggle.title = sidebarCollapsed ? 'Maximize sidebar' : 'Minimize sidebar';
  toggle.addEventListener('click', () => {
    const collapsed = shell.classList.toggle('sidebar-collapsed');
    localStorage.setItem('yo-admin-sidebar-collapsed', String(collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Maximize sidebar' : 'Minimize sidebar');
    toggle.title = collapsed ? 'Maximize sidebar' : 'Minimize sidebar';
  });

  initOnlineOrderNotifications(token);

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

  // Heads-up banner ~5 minutes before that hard cutoff, so a session
  // dying mid-order doesn't come out of nowhere. If the page is loaded
  // with less than 5 minutes left (rare - expiry is 1 day), show it
  // right away instead of scheduling a negative-delay timeout.
  const msUntilWarning = msUntilExpiry - SESSION_WARNING_MS;
  if (msUntilWarning <= 0) {
    showSessionWarningBanner();
  } else {
    window.setTimeout(showSessionWarningBanner, msUntilWarning);
  }

  return { staff, token };
}
