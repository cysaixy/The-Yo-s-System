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

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'dashboard' },
    ],
  },
  {
    label: 'Sales & Service',
    items: [
      { key: 'pos', label: 'Point of Sale', href: 'pos.html', icon: 'pos' },
      { key: 'sales', label: 'Sales Transactions', href: 'sales.html', icon: 'sales', badge: 'orders' },
      { key: 'reservations', label: 'Reservations', href: 'reservations.html', icon: 'reservations' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { key: 'inventory', label: 'Inventory', href: 'inventory.html', icon: 'inventory', perm: 'can_access_inventory', badge: 'inventory' },
      { key: 'products', label: 'Products', href: 'products.html', icon: 'products' },
      { key: 'purchases', label: 'Purchases', href: 'purchases.html', icon: 'purchases', perm: 'can_access_stock_in' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { key: 'cash-transactions', label: 'Cash Transactions', href: 'cash-transactions.html', icon: 'cashtx', perm: 'can_access_reports' },
      { key: 'cash-accounts', label: 'Cash Accounts', href: 'cash-accounts.html', icon: 'cashacc', perm: 'can_access_reports' },
      { key: 'budget', label: 'Budget Planner', href: 'budget-planner.html', icon: 'budget', perm: 'can_access_reports' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { key: 'staff', label: 'Staff', href: 'staff.html', icon: 'staff', adminOnly: true },
      { key: 'settings', label: 'Settings', href: 'settings.html', icon: 'settings' },
    ],
  },
];

const NAV_ITEMS = NAV_SECTIONS.flatMap(section => section.items);

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
  const badge = item.badge
    ? `<span class="admin-nav-badge" id="navBadge-${item.badge}" aria-label="0 alerts"></span>`
    : '';
  if (!allowed) {
    return `<span class="admin-nav-link disabled" title="Ask an Admin to grant you access">
      <span class="icon">${iconSvg(item.icon)}</span><span class="nav-text">${item.label}</span>
      ${badge}<span class="lock-icon">${iconSvg('lock')}</span>
    </span>`;
  }
  return `<a class="admin-nav-link${item.key === active ? ' active' : ''}" href="${item.href}" title="${item.label}">
    <span class="icon">${iconSvg(item.icon)}</span><span class="nav-text">${item.label}</span>${badge}
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
  const redirect = encodeURIComponent(window.location.pathname.split('/').pop() || 'dashboard.html');
  window.location.href = `login.html?expired=1&redirect=${redirect}`;
}

// How long before actual expiry to show the warning banner. Staff JWTs
// are minted with a 1-day expiry (see backend/src/utils/generateToken.js)
// so this only ever fires for someone who's had a page open ~24h - it's
// a courtesy heads-up, not a sign anything is broken.
const SESSION_WARNING_MS = 5 * 60 * 1000;
const NOTIFICATION_HISTORY_KEY = 'yo-admin-notification-history';
const ORDER_SNAPSHOT_KEY = 'yo-admin-order-snapshot';
const INVENTORY_SNAPSHOT_KEY = 'yo-admin-inventory-alert-count';
const ADMIN_API_BASE_URL = '';
const LIVE_ORDER_STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready']);
let notificationStorageScope = 'anonymous';

function scopedStorageKey(key) {
  return `${key}:${notificationStorageScope}`;
}

function escapeNotificationHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

// Simple accessible confirm() replacement that reuses the shared
// .modal-backdrop/.modal-box markup from admin-shell.css. Resolves to
// true/false based on the confirm button, and returns false if the
// backdrop is clicked or Escape is pressed. Message is inserted as text
// (never HTML) and focus is moved into the dialog, returning to the
// previously focused element when it closes.
export function confirmDialog(message, { confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.innerHTML = `
      <div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <h3 id="confirmDialogTitle">Confirm</h3>
        <p style="margin:0 0 6px; line-height:1.55;">${escapeNotificationHtml(message)}</p>
        <div class="modal-close-row">
          <button type="button" class="btn btn-outline" data-confirm-cancel>${escapeNotificationHtml(cancelLabel)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : ''}" data-confirm-ok>${escapeNotificationHtml(confirmLabel)}</button>
        </div>
      </div>`;
    const done = result => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(result);
      previousFocus?.focus?.();
    };
    const onKey = e => {
      if (e.key === 'Escape') done(false);
      if (e.key === 'Enter' && e.target.matches('button')) e.preventDefault();
    };
    backdrop.querySelector('[data-confirm-cancel]').addEventListener('click', () => done(false));
    backdrop.querySelector('[data-confirm-ok]').addEventListener('click', () => done(true));
    backdrop.addEventListener('click', e => { if (e.target === backdrop) done(false); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-confirm-ok]').focus();
  });
}

// Simple accessible alert() replacement. Resolves once dismissed (either
// button, backdrop click, or Escape).
export function showAlert(message, { title = 'Notice' } = {}) {
  return new Promise(resolve => {
    const previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop active';
    backdrop.innerHTML = `
      <div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="showAlertTitle">
        <h3 id="showAlertTitle">${escapeNotificationHtml(title)}</h3>
        <p style="margin:0 0 6px; line-height:1.55;">${escapeNotificationHtml(message)}</p>
        <div class="modal-close-row">
          <button type="button" class="btn" data-alert-ok>OK</button>
        </div>
      </div>`;
    const done = () => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve();
      previousFocus?.focus?.();
    };
    const onKey = e => { if (e.key === 'Escape') done(); };
    backdrop.querySelector('[data-alert-ok]').addEventListener('click', done);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) done(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-alert-ok]').focus();
  });
}

function readNotificationHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(scopedStorageKey(NOTIFICATION_HISTORY_KEY)));
    return Array.isArray(history) ? history.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeNotificationHistory(history) {
  localStorage.setItem(scopedStorageKey(NOTIFICATION_HISTORY_KEY), JSON.stringify(history.slice(0, 50)));
}

function addNotification(notification) {
  const history = readNotificationHistory();
  if (history.some(item => item.id === notification.id)) return false;
  history.unshift({ ...notification, createdAt: notification.createdAt || new Date().toISOString() });
  writeNotificationHistory(history);
  return true;
}

function readJsonStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(scopedStorageKey(key)));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function showAdminToast(notification) {
  let stack = document.querySelector('.admin-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'admin-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `online-order-toast toast-${notification.type || 'order'}`;
  toast.innerHTML = `
    <span class="toast-icon">
      <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    </span>
    <div>
      <strong>${escapeNotificationHtml(notification.title)}</strong>
      <span>${escapeNotificationHtml(notification.message)}</span>
    </div>
    <button type="button" aria-label="Dismiss notification">×</button>
  `;
  stack.appendChild(toast);
  const dismiss = () => {
    toast.remove();
    if (!stack.children.length) stack.remove();
  };
  toast.querySelector('button').addEventListener('click', dismiss);
  window.setTimeout(dismiss, 8000);
}

function setNavBadge(name, value) {
  const badge = document.getElementById(`navBadge-${name}`);
  if (!badge) return;
  const count = Math.max(0, Number(value) || 0);
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.classList.toggle('visible', count > 0);
  badge.setAttribute('aria-label', `${count} ${count === 1 ? 'alert' : 'alerts'}`);
}

function notificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initOnlineOrderNotifications(token, staff) {
  notificationStorageScope = String(staff?.id || staff?.email || 'anonymous');
  const count = document.getElementById('onlineOrderCount');
  const button = document.getElementById('adminOnlineOrdersBtn');
  const panel = document.getElementById('onlineOrderPanel');
  if (!count || !button || !panel) return;

  let activeAlertCount = 0;
  const renderPanel = () => {
    const history = readNotificationHistory();
    panel.innerHTML = `
      <div class="online-order-panel-head"><div><strong>Notifications</strong><span>${activeAlertCount} active ${activeAlertCount === 1 ? 'alert' : 'alerts'}</span></div><button type="button" id="closeOnlineOrderPanel" aria-label="Close notifications">×</button></div>
      <div class="online-order-panel-list">${history.length ? history.map(item => `
        <a href="${escapeNotificationHtml(item.href || 'dashboard.html')}" class="online-order-panel-item">
          <span class="online-order-dot notification-${escapeNotificationHtml(item.type || 'order')}"></span>
          <div><strong>${escapeNotificationHtml(item.title)}</strong><span>${escapeNotificationHtml(item.message)}</span><time>${escapeNotificationHtml(notificationTime(item.createdAt))}</time></div>
        </a>`).join('') : '<div class="online-order-panel-empty">No notifications yet.</div>'}</div>
      <a class="online-order-panel-action" href="dashboard.html">Open dashboard →</a>`;
    panel.querySelector('#closeOnlineOrderPanel')?.addEventListener('click', () => panel.classList.remove('open'));
  };

  button.addEventListener('click', event => {
    event.stopPropagation();
    renderPanel();
    panel.classList.toggle('open');
  });
  document.addEventListener('click', event => {
    if (!panel.contains(event.target) && !button.contains(event.target)) panel.classList.remove('open');
  });

  const headers = { Authorization: `Bearer ${token}` };
  let pollInFlight = false;
  let lastInventoryPollAt = 0;
  const poll = async () => {
    if (document.hidden || pollInFlight) return;
    pollInFlight = true;
    try {
      const shouldFetchInventory = Date.now() - lastInventoryPollAt >= 60000;
      const [ordersRes, inventoryRes] = await Promise.all([
        fetch(`${ADMIN_API_BASE_URL}/api/admin/sales/live-state`, { headers, cache: 'no-store' }),
        shouldFetchInventory
          ? fetch(`${ADMIN_API_BASE_URL}/api/admin/dashboard/inventory-overview`, { headers, cache: 'no-store' })
          : Promise.resolve(null),
      ]);
      if (!ordersRes.ok) return;

      const ordersData = await ordersRes.json();
      const orders = ordersData.orders || [];
      const previousSnapshot = readJsonStorage(ORDER_SNAPSHOT_KEY, {});
      const orderSnapshotKey = scopedStorageKey(ORDER_SNAPSHOT_KEY);
      const hadOrderSnapshot = localStorage.getItem(orderSnapshotKey) !== null;
      const nextSnapshot = Object.fromEntries(orders.map(order => [String(order.id), order.status]));
      const changedIds = [];
      const notifications = [];

      // Compare every returned state before filtering the rail so completed
      // and cancelled transitions remain visible in notification history.
      orders.forEach(order => {
        const previousStatus = previousSnapshot[String(order.id)];
        if (!previousStatus && LIVE_ORDER_STATUSES.has(order.status)) {
          const notification = {
            id: `order-${order.id}-${order.status}`,
            type: 'order',
            title: order.source === 'online' ? 'New online order' : 'New order',
            message: `Order #${order.id} · ${order.customer_name || 'Customer'} · ₱${Number(order.total_amount || 0).toLocaleString('en-PH')}`,
            href: 'sales.html',
          };
          if (addNotification(notification) && hadOrderSnapshot) notifications.push(notification);
          if (hadOrderSnapshot) changedIds.push(String(order.id));
        } else if (previousStatus && previousStatus !== order.status) {
          const notification = {
            id: `order-${order.id}-${order.status}`,
            type: 'status',
            title: `Order #${order.id} updated`,
            message: `Status changed to ${String(order.status).replace(/_/g, ' ')}${order.handler_name ? ` · ${order.handler_name}` : ''}`,
            href: 'sales.html',
          };
          if (addNotification(notification)) notifications.push(notification);
          changedIds.push(String(order.id));
        }
      });
      localStorage.setItem(orderSnapshotKey, JSON.stringify(nextSnapshot));

      const activeOrders = orders.filter(order => LIVE_ORDER_STATUSES.has(order.status));
      const pendingApprovals = activeOrders.filter(order => order.status === 'pending').length;
      const inventorySnapshotKey = scopedStorageKey(INVENTORY_SNAPSHOT_KEY);
      let inventoryAlerts = Number(localStorage.getItem(inventorySnapshotKey)) || 0;
      if (inventoryRes) {
        lastInventoryPollAt = Date.now();
        if (inventoryRes.ok) {
          const inventory = await inventoryRes.json();
          inventoryAlerts = Number(inventory.below_reorder || 0) + Number(inventory.low_stock || 0) + Number(inventory.out_of_stock || 0);
          const previousRaw = localStorage.getItem(inventorySnapshotKey);
          const previousInventoryAlerts = Number(previousRaw) || 0;
          if (previousRaw !== null && inventoryAlerts > previousInventoryAlerts) {
            const notification = {
              id: `inventory-${Date.now()}-${inventoryAlerts}`,
              type: 'inventory',
              title: 'Inventory needs attention',
              message: `${inventoryAlerts} ${inventoryAlerts === 1 ? 'item is' : 'items are'} at or below the alert threshold`,
              href: 'inventory.html',
            };
            if (addNotification(notification)) notifications.push(notification);
          }
          localStorage.setItem(inventorySnapshotKey, String(inventoryAlerts));
        }
      }

      setNavBadge('orders', pendingApprovals);
      setNavBadge('inventory', inventoryAlerts);
      activeAlertCount = pendingApprovals + inventoryAlerts;
      count.textContent = activeAlertCount > 99 ? '99+' : String(activeAlertCount);
      count.style.display = activeAlertCount ? 'flex' : 'none';
      button.title = `${activeAlertCount} active notifications`;
      button.setAttribute('aria-label', `${activeAlertCount} active notifications`);
      renderPanel();

      window.__adminLiveOrders = activeOrders;
      document.dispatchEvent(new CustomEvent('admin:orders-updated', {
        detail: { orders: activeOrders, changedIds },
      }));
      notifications.slice(0, 3).forEach(showAdminToast);
    } catch {
      // Live notifications should never interrupt staff work when the server is unavailable.
    } finally {
      pollInFlight = false;
    }
  };

  poll();
  window.setInterval(poll, 8000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
  });
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
      padding: 10px 20px; font-family: 'Poppins', sans-serif; font-size: 0.84rem; font-weight: 600;
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
      <div class="admin-sidebar-backdrop" id="adminSidebarBackdrop"></div>
      <aside class="admin-sidebar">
        <div class="admin-logo">
          <span class="mark">TY</span>
          <span class="brand-label">THE~YO'S</span>
          <button class="sidebar-toggle" id="adminSidebarToggle" type="button" aria-label="Minimize sidebar" title="Minimize sidebar">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>
        <nav class="sidebar-nav">
          ${NAV_SECTIONS.map(section => `
            <div class="nav-group">
              <div class="nav-group-label">${section.label}</div>
              ${section.items.map(item => navLinkHTML(item, active, staff)).join('')}
            </div>`).join('')}
        </nav>
        <div class="sidebar-user-section">
          <div class="sidebar-user-avatar">${initial}</div>
          <div class="sidebar-user-info">
            <strong>${staff.name || staff.email}</strong>
            <span>${staff.role || 'Staff'}</span>
          </div>
        </div>
      </aside>
      <div class="admin-main">
        <header class="admin-header">
          <div class="admin-header-left">
            <button class="mobile-nav-toggle" id="adminMobileNavToggle" type="button" aria-label="Open menu" title="Open menu">
              <svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            </button>
            <h1>${title}</h1>
          </div>
          <div class="admin-user">
            <div class="admin-notification-wrap">
              <button class="admin-notification-btn" id="adminOnlineOrdersBtn" title="Notifications" aria-label="Notifications">
                <svg viewBox="0 0 24 24" class="bell-icon"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                <span class="admin-notification-count" id="onlineOrderCount">0</span>
              </button>
              <div class="online-order-panel" id="onlineOrderPanel"></div>
            </div>
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

  // ---- Mobile off-canvas nav (<=768px, see admin-shell.css) ----
  // Independent of the desktop collapse toggle above - on a narrow screen
  // the sidebar isn't pushing content around at all, so "collapsed" has no
  // meaning; it's just hidden off-canvas until opened here.
  const mobileToggle = document.getElementById('adminMobileNavToggle');
  const backdrop = document.getElementById('adminSidebarBackdrop');

  function openMobileNav() {
    shell.classList.add('mobile-nav-open');
    mobileToggle.setAttribute('aria-label', 'Close menu');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileNav() {
    shell.classList.remove('mobile-nav-open');
    mobileToggle.setAttribute('aria-label', 'Open menu');
    document.body.style.overflow = '';
  }

  mobileToggle.addEventListener('click', () => {
    shell.classList.contains('mobile-nav-open') ? closeMobileNav() : openMobileNav();
  });
  backdrop.addEventListener('click', closeMobileNav);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && shell.classList.contains('mobile-nav-open')) closeMobileNav();
  });
  // Tapping a nav link (or trying to, if disabled) should close the drawer
  // instead of leaving it open behind the newly-loaded page/alert.
  shell.querySelector('.admin-sidebar').addEventListener('click', (e) => {
    if (e.target.closest('.admin-nav-link')) closeMobileNav();
  });

  initOnlineOrderNotifications(token, staff);

  // A signed-in staff member who isn't allowed on this page (e.g. they
  // bookmarked it before permissions changed) gets bounced to Home rather
  // than seeing a broken/empty page.
  const activeItem = NAV_ITEMS.find(i => i.key === active);
  if (activeItem && !hasAccess(activeItem, staff)) {
    alert("You don't have permission to access this page. Ask an Admin to grant it.");
    window.location.href = 'dashboard.html';
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