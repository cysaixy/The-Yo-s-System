import { renderAdminShell } from './admin-shell.js';
import { adminFetch } from './admin-api.js';
import { printerManager } from './receipt-printer.js?v=5';

// The app host is never replaced during feature navigation. Put the live
// Bluetooth manager here rather than inside the POS iframe, whose lifecycle
// a browser may pause when it is hidden.
window.__yoPrinterManager = printerManager;

const FEATURES = {
  dashboard: 'Dashboard',
  pos: 'Point of Sale',
  sales: 'Sales Transactions',
  reservations: 'Reservations',
  reviews: 'Guest Reviews',
  inventory: 'Inventory',
  products: 'Products',
  purchases: 'Purchases',
  'cash-transactions': 'Cash Transactions',
  'cash-accounts': 'Cash Accounts',
  staff: 'Staff',
  settings: 'Settings',
  home: 'Home',
};

function requestedFeature() {
  const value = new URLSearchParams(window.location.search).get('feature');
  return Object.hasOwn(FEATURES, value) ? value : 'dashboard';
}

let currentFeature = requestedFeature();
const session = renderAdminShell({ active: currentFeature, title: FEATURES[currentFeature] });

// The cached staffInfo only drives the UI. Confirm the httpOnly session with
// the server (adminFetch bounces to login on 401) and refresh the cached
// role/permissions so a demoted or deactivated account can't keep stale UI.
async function verifyStaffSession() {
  try {
    const res = await adminFetch('/api/admin/staff/me');
    if (!res.ok) return;
    const data = await res.json();
    if (data.staff) localStorage.setItem('staffInfo', JSON.stringify(data.staff));
  } catch (err) {
    console.warn('Session check failed:', err.message);
  }
}

// One identity per browser: an open staff dashboard ends any customer
// (Firebase) session that's also signed in here.
async function endCustomerSession() {
  try {
    localStorage.removeItem('theYosNavAccount');
    localStorage.removeItem('theYosCustomerSignInAt');
    const mod = await import('/firebase-init.js');
    if (mod.auth?.authStateReady) await mod.auth.authStateReady();
    if (mod.auth?.currentUser) await mod.signOut(mod.auth);
  } catch (err) {
    console.warn('Could not end customer session:', err);
  }
}

if (session) {
  verifyStaffSession();
  endCustomerSession();
  const content = document.getElementById('adminContent');
  const body = content.closest('.admin-body');
  body.classList.add('admin-app-body');
  content.style.cssText = 'max-width:none; width:100%; height:100%;';
  content.innerHTML = `
    <div class="admin-app-workspace">
      <iframe class="admin-app-frame" title="Admin feature" id="adminFeatureFrame"></iframe>
    </div>`;
  const workspace = content.querySelector('.admin-app-workspace');
  const featureFrame = document.getElementById('adminFeatureFrame');
  let posFrame = null;

  function sendLiveOrdersToDashboard(orders, changedIds = []) {
    if (currentFeature !== 'dashboard' || !Array.isArray(orders)) return;
    featureFrame.contentWindow?.postMessage({
      type: 'theyos:admin-orders-updated',
      orders,
      changedIds,
    }, window.location.origin);
  }

  document.addEventListener('admin:orders-updated', event => {
    sendLiveOrdersToDashboard(event.detail?.orders || [], event.detail?.changedIds || []);
  });

  featureFrame.addEventListener('load', () => {
    if (currentFeature === 'dashboard' && Array.isArray(window.__adminLiveOrders)) {
      sendLiveOrdersToDashboard(window.__adminLiveOrders);
    }
  });

  function createPosFrame() {
    if (posFrame) return posFrame;
    posFrame = document.createElement('iframe');
    posFrame.className = 'admin-app-frame';
    posFrame.id = 'adminPosFrame';
    posFrame.title = 'Point of Sale';
    posFrame.src = 'pos?embedded=1';
    workspace.appendChild(posFrame);
    return posFrame;
  }

  function showFrame(frame) {
    featureFrame.hidden = frame !== featureFrame;
    if (posFrame) posFrame.hidden = frame !== posFrame;
  }

  function setActiveFeature(feature, { addHistory = false } = {}) {
    if (!Object.hasOwn(FEATURES, feature)) return;
    currentFeature = feature;
    document.title = `${FEATURES[feature]} — The~Yo's Admin`;
    document.querySelector('.admin-header h1').textContent = FEATURES[feature];
    document.querySelectorAll('[data-admin-nav-key]').forEach(link => {
      link.classList.toggle('active', link.dataset.adminNavKey === feature);
    });
    if (addHistory) {
      history.pushState({ feature }, '', `app.html?feature=${encodeURIComponent(feature)}`);
    }
    // The POS document owns the live Bluetooth printer connection. Keep its
    // iframe alive after the first visit so leaving POS never destroys that
    // connection; other features can still be replaced normally.
    if (feature === 'pos') {
      showFrame(createPosFrame());
    } else {
      showFrame(featureFrame);
      featureFrame.src = `${feature}?embedded=1`;
    }
  }

  document.querySelector('.admin-sidebar').addEventListener('click', event => {
    const link = event.target.closest('a[data-admin-nav-key]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    setActiveFeature(link.dataset.adminNavKey, { addHistory: true });
  }, true);

  window.addEventListener('message', event => {
    if (event.origin !== window.location.origin || event.data?.type !== 'theyos:admin-navigate') return;
    setActiveFeature(event.data.feature, { addHistory: true });
  });
  window.addEventListener('popstate', () => setActiveFeature(requestedFeature()));

  setActiveFeature(currentFeature);
}
