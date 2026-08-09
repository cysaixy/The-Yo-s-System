document.addEventListener("DOMContentLoaded", () => {
  // --- EXISTING HOOKS ---
  const yElement = document.getElementById('year');
  if (yElement) yElement.textContent = new Date().getFullYear();

  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      siteNav.classList.toggle('open');
      navToggle.textContent = siteNav.classList.contains('open') ? '✕' : '☰';
    });
  }

  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, { threshold: 0.1 });
  revealEls.forEach(el => io.observe(el));

  // --- THEME ENGINE DISABLED FOR NOW ---
  // initThemeEngine();

  // --- ORDER INITIALIZATION ---
  if (document.getElementById('menuCatalog')) {
    renderCatalog();
    updateCartDisplay();
    initServiceTypeListener(); // Tracks Delivery location field
  }
});

function initThemeEngine() {
  const body = document.body;
  const isMenuPage = body.classList.contains('menu-page-theme');
  const savedTheme = localStorage.getItem('theme-preference');

  const SUN_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12h2.6M18.9 12h2.6M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8"/></svg>';
  const MOON_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z"/></svg>';

  const activeThemeIsDark = savedTheme
    ? savedTheme === 'dark'
    : isMenuPage;

  const toggleBtn = document.getElementById('themeToggleBtn');
  if (toggleBtn) {
    toggleBtn.innerHTML = activeThemeIsDark ? `${SUN_ICON}<span>Light</span>` : `${MOON_ICON}<span>Dark</span>`;

    toggleBtn.addEventListener('click', () => {
      let activeDark;
      if (isMenuPage) {
        body.classList.toggle('light-theme');
        activeDark = !body.classList.contains('light-theme');
      } else {
        body.classList.toggle('dark-theme');
        activeDark = body.classList.contains('dark-theme');
      }
      localStorage.setItem('theme-preference', activeDark ? 'dark' : 'light');
      toggleBtn.innerHTML = activeDark ? `${SUN_ICON}<span>Light</span>` : `${MOON_ICON}<span>Dark</span>`;
    });
  }

  if (savedTheme === 'dark') {
    if (!isMenuPage) body.classList.add('dark-theme');
    else body.classList.remove('light-theme');
  } else if (savedTheme === 'light') {
    if (isMenuPage) body.classList.add('light-theme');
    else body.classList.remove('dark-theme');
  }
}

// --- DELIVERY EXPANSION LOGIC ---
function initServiceTypeListener() {
  const orderTypeSelect = document.getElementById('orderType');
  if (!orderTypeSelect) return;

  orderTypeSelect.addEventListener('change', (e) => {
    const currentFormRow = orderTypeSelect.closest('.form-row');
    let locationRow = document.getElementById('deliveryLocationWrapper');

    if (e.target.value === 'Delivery') {
      if (!locationRow) {
        locationRow = document.createElement('div');
        locationRow.id = 'deliveryLocationWrapper';
        locationRow.className = 'form-row';
        locationRow.style.marginTop = '10px';
        locationRow.innerHTML = `
          <div style="width: 100%;">
            <label for="deliveryAddress" style="color: var(--brass); font-weight: 700;">📍 Delivery Address</label>
            <input id="deliveryAddress" type="text" required placeholder="House No., Street, Barangay, Landmarks">
          </div>
        `;
        currentFormRow.parentNode.insertBefore(locationRow, currentFormRow.nextSibling);
      }
    } else {
      if (locationRow) {
        locationRow.remove();
      }
    }
  });
}

// --- DYNAMIC CATALOG & CART CUSTOMIZATION LOGIC ---
function openCustomizationModal(id, uniqueCartId = null) {
  activeSelectedItemId = id;
  const item = menuDatabase.find(p => p.id === id);
  if (!item) return;
  
  document.getElementById('modalItemName').textContent = item.name;
  
  if (uniqueCartId) {
    const cartEntry = cart.find(entry => entry.uniqueCartId === uniqueCartId);
    document.getElementById('modalItemComments').value = cartEntry ? cartEntry.comments : '';
    document.getElementById('customizationModal').setAttribute('data-editing-id', uniqueCartId);
  } else {
    document.getElementById('modalItemComments').value = '';
    document.getElementById('customizationModal').removeAttribute('data-editing-id');
  }
  
  document.getElementById('customizationModal').classList.add('active');
}

function closeModal() {
  document.getElementById('customizationModal').classList.remove('active');
  document.getElementById('customizationModal').removeAttribute('data-editing-id');
  activeSelectedItemId = null;
}

function confirmAddToCart() {
  if (!activeSelectedItemId) return;
  const commentsInput = document.getElementById('modalItemComments').value.trim();
  const editingUniqueId = document.getElementById('customizationModal').getAttribute('data-editing-id');
  
  if (editingUniqueId) {
    const cartEntry = cart.find(entry => entry.uniqueCartId === editingUniqueId);
    if (cartEntry) {
      cartEntry.comments = commentsInput;
    }
  } else {
    const existingIndex = cart.findIndex(entry => entry.id === activeSelectedItemId && entry.comments === commentsInput);
    
    if (existingIndex > -1) {
      cart[existingIndex].qty += 1;
    } else {
      cart.push({
        uniqueCartId: Date.now() + Math.random().toString(36).substr(2, 5),
        id: activeSelectedItemId,
        qty: 1,
        comments: commentsInput
      });
    }
  }
  
  closeModal();
  updateCartDisplay();
}

function updateCartDisplay() {
  const container = document.getElementById('cartListContainer');
  if (!container) return;
  
  container.innerHTML = '';
  let grandTotal = 0, totalItems = 0;

  cart.forEach(entry => {
    const product = menuDatabase.find(p => p.id === entry.id);
    if (product) {
      const subtotal = product.price * entry.qty;
      grandTotal += subtotal;
      totalItems += entry.qty;

      const row = document.createElement('div');
      row.className = 'cart-row';
      
      let modsHTML = entry.comments ? `<span class="cart-item-mods">↳ Note: "${entry.comments}"</span>` : '';
      
      row.innerHTML = `
        <div style="max-width: 75%; cursor: pointer;" onclick="openCustomizationModal('${entry.id}', '${entry.uniqueCartId}')" title="Click to edit customization">
          <strong>${product.name}</strong>
          <span style="color:var(--brass); margin-left:6px; font-family:'Space Mono'; font-weight:700;">x${entry.qty}</span>
          ${modsHTML}
          <span style="display:block; font-size:0.7rem; color:var(--ink); opacity:0.4; margin-top:2px;">✏️ Tap to edit details</span>
        </div>
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-family:'Space Mono';">₱${subtotal}</span>
          <button type="button" class="remove-item" onclick="removeCartRow('${entry.uniqueCartId}')" title="Remove item">✕</button>
        </div>
      `;
      container.appendChild(row);
    }
  });
  
  currentCartTotal = grandTotal;
  if (totalItems === 0) container.innerHTML = `<div class="cart-empty">Your shopping cart is currently empty.</div>`;
  document.getElementById('runningTotalDisplay').textContent = '₱' + grandTotal;

  const alertBox = document.getElementById('downpaymentNotice');
  if (alertBox) {
    alertBox.style.display = (grandTotal >= 300) ? 'block' : 'none';
  }
}