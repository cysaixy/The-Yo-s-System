/* ==========================================================================
   The~Yo's — Shared "Quick Cart" engine
   --------------------------------------------------------------------------
   Lightweight, page-agnostic cart used on the public-facing pages (Home,
   Menu) so guests can browse and tap "Add" before they've committed to the
   full ordering flow. It stores lines in localStorage (by item NAME, since
   these pages don't know the real database IDs), and renders a floating
   button + slide-in drawer.

   When the guest hits "Checkout", they're sent to order.html, which owns
   the real, server-backed cart (kioskCartPanel / `cart` array tied to real
   menu_id values). order.html reads this shared cart on load and matches
   each line to a real catalog item by name, quietly moving it into the
   real tray — see mergeSharedCartIntoTray() in order.html.

   Include with: <script src="cart.js"></script> (after global.js)
   Opt out of the floating widget (e.g. on order.html, which has its own
   tray UI) by adding data-no-floating-cart to <body>.
   ========================================================================== */

(function () {
  const STORAGE_KEY = 'yo-shared-cart';
  const ORDER_TRAY_STORAGE_KEY = 'yo-order-tray';

  function readStoredCart(key) {
    try {
      const storage = key === ORDER_TRAY_STORAGE_KEY ? sessionStorage : localStorage;
      const raw = storage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function readQuickCart() {
    return readStoredCart(STORAGE_KEY);
  }

  // Items added from the Menu/Home live in localStorage until checkout.
  // Once they reach order.html they become real tray lines (with menu IDs)
  // in sessionStorage. Combining both here keeps the floating cart accurate
  // when the visitor uses another navigation link before placing the order.
  function readCart() {
    const quickItems = readQuickCart().map(item => ({ ...item, source: 'quick' }));
    const trayItems = readStoredCart(ORDER_TRAY_STORAGE_KEY)
      .filter(line => line && line.id && Number(line.quantity) > 0)
      .map(line => ({
        id: String(line.uniqueCartId ?? line.id),
        name: line.name,
        price: Number(line.price) || 0,
        qty: Number(line.quantity) || 1,
        total: trayLineTotal(line),
        source: 'tray'
      }));
    return [...quickItems, ...trayItems];
  }

  function trayLineTotal(line) {
    const base = (Number(line.price) || 0) * (Number(line.quantity) || 0);
    const addOns = (line.add_ons || []).reduce((sum, addon) =>
      sum + (Number(addon.price) || 0) * (Number(addon.quantity) || 0), 0);
    return base + addOns;
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    renderBadge();
    renderDrawerContents();
  }

  function writeOrderTray(items) {
    sessionStorage.setItem(ORDER_TRAY_STORAGE_KEY, JSON.stringify(items));
    renderBadge();
    renderDrawerContents();
  }

  function count(items) {
    return (items || readCart()).reduce((sum, i) => sum + i.qty, 0);
  }

  function total(items) {
    return (items || readCart()).reduce((sum, i) => sum + (i.total ?? i.qty * i.price), 0);
  }

  function slugify(str) {
    return String(str).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function addItem({ id, name, price }) {
    const items = readQuickCart();
    const key = id || slugify(name);
    const existing = items.find(i => i.id === key);
    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ id: key, name, price: Number(price) || 0, qty: 1 });
    }
    writeCart(items);
    // Keep browsing uninterrupted. The badge pulses and the toast confirms
    // the add; the drawer opens only when the customer clicks the cart icon.
    pulseCartButton();
  }

  function changeQty(id, delta, source = 'quick') {
    if (source === 'tray') {
      const items = readStoredCart(ORDER_TRAY_STORAGE_KEY);
      const line = items.find(i => String(i.uniqueCartId ?? i.id) === String(id));
      if (!line) return;
      line.quantity += delta;
      writeOrderTray(line.quantity <= 0 ? items.filter(i => i !== line) : items);
      return;
    }
    const items = readQuickCart();
    const line = items.find(i => i.id === id);
    if (!line) return;
    line.qty += delta;
    const next = line.qty <= 0 ? items.filter(i => i.id !== id) : items;
    writeCart(next);
  }

  function removeItem(id, source = 'quick') {
    if (source === 'tray') {
      writeOrderTray(readStoredCart(ORDER_TRAY_STORAGE_KEY).filter(i =>
        String(i.uniqueCartId ?? i.id) !== String(id)
      ));
      return;
    }
    writeCart(readQuickCart().filter(i => i.id !== id));
  }

  function clearCart() {
    writeCart([]);
    try { sessionStorage.removeItem(ORDER_TRAY_STORAGE_KEY); } catch (err) { /* no-op */ }
    renderBadge();
    renderDrawerContents();
  }

  /* ---------------------------- Floating UI ---------------------------- */

  let drawerEl, badgeEl, panelEl;

  function buildWidget() {
    const wrap = document.createElement('div');
    wrap.id = 'quickCartWidget';
    wrap.innerHTML = `
      <button id="quickCartBtn" aria-label="View cart" type="button">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.4"/><circle cx="18" cy="21" r="1.4"/><path d="M2.5 3h2.4l2.6 12.2a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 7H6"/></svg>
        <span id="quickCartCount" class="qc-badge">0</span>
      </button>
      <div id="quickCartOverlay"></div>
      <aside id="quickCartPanel" aria-hidden="true">
        <div class="qc-head">
          <span>Your Cart</span>
          <button id="quickCartClose" type="button" aria-label="Close cart">&times;</button>
        </div>
        <div id="quickCartLines" class="qc-lines"></div>
        <div class="qc-foot">
          <div class="qc-total-row"><span>Subtotal</span><strong id="quickCartTotal">₱0</strong></div>
          <a href="order.html" class="btn qc-checkout" id="quickCartCheckout" style="width:100%; justify-content:center;">Checkout on Order Page</a>
          <p class="qc-hint">Your picks carry over automatically — just confirm them in the tray.</p>
        </div>
      </aside>
    `;
    document.body.appendChild(wrap);

    badgeEl = wrap.querySelector('#quickCartCount');
    panelEl = wrap.querySelector('#quickCartPanel');
    drawerEl = wrap;

    wrap.querySelector('#quickCartBtn').addEventListener('click', () => openDrawer());
    wrap.querySelector('#quickCartClose').addEventListener('click', closeDrawer);
    wrap.querySelector('#quickCartOverlay').addEventListener('click', closeDrawer);
  }

  function openDrawer(pulse) {
    if (!panelEl) return;
    drawerEl.classList.add('qc-open');
    panelEl.setAttribute('aria-hidden', 'false');
    if (pulse) pulseCartButton();
  }

  function pulseCartButton() {
    const btn = document.getElementById('quickCartBtn');
    if (!btn) return;
    btn.classList.remove('qc-pulse');
    void btn.offsetWidth;
    btn.classList.add('qc-pulse');
  }

  function closeDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('qc-open');
    panelEl.setAttribute('aria-hidden', 'true');
  }

  function renderBadge() {
    if (!badgeEl) return;
    const c = count();
    badgeEl.textContent = c;
    badgeEl.style.display = c > 0 ? 'flex' : 'none';
  }

  function renderDrawerContents() {
    if (!panelEl) return;
    const items = readCart();
    const linesEl = panelEl.querySelector('#quickCartLines');
    const totalEl = panelEl.querySelector('#quickCartTotal');

    if (items.length === 0) {
      linesEl.innerHTML = `<div class="qc-empty">Nothing here yet — tap "Add" on any dish or drink to start your cart.</div>`;
    } else {
      linesEl.innerHTML = items.map(i => `
        <div class="qc-line">
          <div class="qc-line-info">
            <span class="qc-line-name">${i.name}</span>
            <span class="qc-line-price">${i.source === 'tray' ? `Saved order line · ₱${i.total}` : `₱${i.price} &times; ${i.qty}`}</span>
          </div>
          <div class="qc-line-actions">
            <button type="button" data-id="${i.id}" data-source="${i.source}" data-d="-1" class="qc-qty-btn">&minus;</button>
            <span class="qc-qty">${i.qty}</span>
            <button type="button" data-id="${i.id}" data-source="${i.source}" data-d="1" class="qc-qty-btn">+</button>
            <button type="button" data-id="${i.id}" data-source="${i.source}" class="qc-remove-btn" aria-label="Remove">&times;</button>
          </div>
        </div>
      `).join('');

      linesEl.querySelectorAll('.qc-qty-btn').forEach(btn => {
        btn.addEventListener('click', () => changeQty(btn.dataset.id, Number(btn.dataset.d), btn.dataset.source));
      });
      linesEl.querySelectorAll('.qc-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => removeItem(btn.dataset.id, btn.dataset.source));
      });
    }

    totalEl.textContent = `₱${total(items)}`;
  }

  function injectStyles() {
    if (document.getElementById('quickCartStyles')) return;
    const style = document.createElement('style');
    style.id = 'quickCartStyles';
    style.textContent = `
      #quickCartWidget{position:fixed;z-index:200;right:26px;bottom:26px;font-family:'Inter',sans-serif;}
      #quickCartBtn{position:relative;width:56px;height:56px;border-radius:50%;background:var(--ink,#15171a);color:var(--brass,#a3844a);border:1.5px solid var(--brass,#a3844a);display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 10px 28px -10px rgba(0,0,0,.4);transition:transform .18s ease;}
      #quickCartBtn:hover{transform:translateY(-2px);}
      #quickCartBtn.qc-pulse{animation:qcPulse .5s ease;}
      @keyframes qcPulse{0%{transform:scale(1);}40%{transform:scale(1.16);}100%{transform:scale(1);}}
      .qc-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:var(--brass,#a3844a);color:#fff;font-family:'Space Mono',monospace;font-size:.68rem;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid var(--bone,#faf7f2);}
      #quickCartOverlay{position:fixed;inset:0;background:rgba(15,16,18,.5);opacity:0;pointer-events:none;transition:opacity .25s ease;z-index:199;}
      #quickCartWidget.qc-open #quickCartOverlay{opacity:1;pointer-events:auto;}
      #quickCartPanel{position:fixed;top:0;right:0;height:100%;width:380px;max-width:92vw;background:var(--component-bg,#fff);color:var(--ink,#15171a);box-shadow:-18px 0 40px rgba(0,0,0,.18);transform:translateX(100%);transition:transform .3s cubic-bezier(.4,0,.2,1);display:flex;flex-direction:column;z-index:201;}
      #quickCartWidget.qc-open #quickCartPanel{transform:translateX(0);}
      .qc-head{display:flex;align-items:center;justify-content:space-between;padding:22px 22px 16px;border-bottom:1px solid var(--line,rgba(0,0,0,.1));font-family:'Archivo',sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.02em;font-size:1.05rem;}
      .qc-head button{background:none;border:none;font-size:1.6rem;line-height:1;color:inherit;cursor:pointer;opacity:.6;}
      .qc-head button:hover{opacity:1;}
      .qc-lines{flex:1;overflow-y:auto;padding:14px 22px;}
      .qc-empty{font-size:.88rem;opacity:.6;padding:30px 0;text-align:center;line-height:1.5;}
      .qc-line{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 0;border-bottom:1px dashed var(--line,rgba(0,0,0,.12));}
      .qc-line-info{display:flex;flex-direction:column;gap:4px;}
      .qc-line-name{font-weight:700;font-size:.9rem;}
      .qc-line-price{font-family:'Space Mono',monospace;font-size:.76rem;opacity:.65;}
      .qc-line-actions{display:flex;align-items:center;gap:6px;flex-shrink:0;}
      .qc-qty-btn{width:24px;height:24px;border-radius:5px;border:1px solid var(--line,rgba(0,0,0,.15));background:transparent;color:inherit;cursor:pointer;font-size:.9rem;line-height:1;}
      .qc-qty-btn:hover{background:var(--brass,#a3844a);border-color:var(--brass,#a3844a);color:#fff;}
      .qc-qty{font-family:'Space Mono',monospace;font-size:.8rem;min-width:14px;text-align:center;}
      .qc-remove-btn{background:none;border:none;color:inherit;opacity:.45;font-size:1.15rem;cursor:pointer;margin-left:4px;}
      .qc-remove-btn:hover{opacity:1;color:#c0392b;}
      .qc-foot{padding:16px 22px 22px;border-top:1px solid var(--line,rgba(0,0,0,.1));}
      .qc-total-row{display:flex;justify-content:space-between;align-items:center;font-family:'Space Mono',monospace;font-weight:700;margin-bottom:14px;font-size:1rem;}
      .qc-hint{font-size:.72rem;opacity:.55;margin-top:10px;line-height:1.4;text-align:center;}
      .qc-added-flash{position:fixed;z-index:250;background:var(--ink,#15171a);color:#fff;font-family:'Space Mono',monospace;font-size:.78rem;padding:10px 18px;border-radius:30px;bottom:96px;right:26px;box-shadow:0 10px 24px rgba(0,0,0,.25);opacity:0;transform:translateY(8px);transition:opacity .2s ease, transform .2s ease;pointer-events:none;}
      .qc-added-flash.show{opacity:1;transform:translateY(0);}
      @media(max-width:600px){
        #quickCartWidget{right:16px;bottom:16px;}
        #quickCartBtn{width:50px;height:50px;}
        .qc-added-flash{right:16px;bottom:82px;}
      }
    `;
    document.head.appendChild(style);
  }

  function flashToast(msg) {
    let toast = document.getElementById('qcToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'qcToast';
      toast.className = 'qc-added-flash';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove('show'), 1600);
  }

  function initFloatingWidget() {
    if (document.body.hasAttribute('data-no-floating-cart')) return;
    injectStyles();
    buildWidget();
    renderBadge();
    renderDrawerContents();
  }

  window.addEventListener('storage', event => {
    if (event.key === STORAGE_KEY || event.key === ORDER_TRAY_STORAGE_KEY) {
      renderBadge();
      renderDrawerContents();
    }
  });

  // Public API used by onclick="Cart.add(this)" buttons in menu markup.
  window.Cart = {
    add(source) {
      let payload;
      if (source instanceof HTMLElement) {
        const card = source.closest('[data-id],[data-name]');
        if (!card) return;
        payload = { id: card.dataset.id, name: card.dataset.name, price: card.dataset.price };
      } else {
        payload = source;
      }
      addItem(payload);
      flashToast(`Added "${payload.name}" to your cart`);
    },
    remove: removeItem,
    changeQty,
    clear: clearCart,
    getItems: readCart,
    count,
    total,
    STORAGE_KEY,
  };

  document.addEventListener('DOMContentLoaded', initFloatingWidget);
})();
