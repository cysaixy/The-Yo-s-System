// order-ui.js — Dine-in / Takeout / Delivery segmented buttons.
// They drive the original <select id="orderType">, so every existing
// validation and submit path keeps reading the same value.
(() => {
  const select = document.getElementById('orderType');
  const seg = document.getElementById('orderTypeSeg');
  if (!select || !seg) return;
  const buttons = Array.from(seg.querySelectorAll('[data-value]'));

  function sync() {
    buttons.forEach(btn => {
      const on = btn.dataset.value === select.value;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-checked', String(on));
    });
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      select.value = btn.dataset.value;
      // Fires the select's own onchange="onOrderTypeChange()" handler.
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    });
  });

  // Arrow keys move between options (radiogroup behaviour).
  seg.addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = Math.max(0, buttons.findIndex(b => b.dataset.value === select.value));
    const next = buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.click();
    next.focus();
  });

  // The page resets the select in code (e.g. after an order) without events;
  // re-sync whenever checkout opens or the select changes.
  select.addEventListener('change', sync);
  const overlay = document.getElementById('checkoutOverlay');
  if (overlay) new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['class'], subtree: true });
  sync();
})();
