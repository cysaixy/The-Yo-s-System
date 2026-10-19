import { renderAdminShell } from './admin-shell.js';

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
  content.innerHTML = '<iframe class="admin-app-frame" title="Admin feature" id="adminFeatureFrame"></iframe>';
  const frame = document.getElementById('adminFeatureFrame');

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
    frame.src = `${feature}?embedded=1`;
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
