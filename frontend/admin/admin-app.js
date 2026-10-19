import { renderAdminShell } from './admin-shell.js';
import { printerManager } from './receipt-printer.js?v=4';

// The app host is never replaced during feature navigation. Put the live
// Bluetooth manager here rather than inside the POS iframe, whose lifecycle
// a browser may pause when it is hidden.
window.__yoPrinterManager = printerManager;

const FEATURES = {
  dashboard: 'Dashboard',
  pos: 'Point of Sale',
  sales: 'Sales Transactions',
  reservations: 'Reservations',
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

if (session) {
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
