// home-live.js — small live details for the home hero:
//  • "Open now / Closed" from the store hours (Philippine time, 8AM–8PM)
//  • the real average guest rating from the reviews database
(() => {
  const OPEN_HOUR = 8;
  const CLOSE_HOUR = 20;

  function manilaHour() {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', hour: 'numeric', minute: 'numeric', hour12: false,
    }).formatToParts(new Date());
    const h = Number(parts.find(p => p.type === 'hour')?.value) % 24;
    const m = Number(parts.find(p => p.type === 'minute')?.value) || 0;
    return h + m / 60;
  }

  function updateStatus() {
    const el = document.getElementById('heroOpenStatus');
    if (!el) return;
    const hour = manilaHour();
    const open = hour >= OPEN_HOUR && hour < CLOSE_HOUR;
    el.classList.toggle('is-open', open);
    el.classList.toggle('is-closed', !open);
    el.querySelector('span').textContent = open ? 'Open now · until 8PM' : 'Closed · opens 8AM';
  }

  async function loadRating() {
    const el = document.getElementById('heroRating');
    if (!el) return;
    try {
      const res = await fetch('/api/customer/reviews?limit=1');
      if (!res.ok) return;
      const { summary } = await res.json();
      if (!summary?.total) return; // no reviews yet: keep the chip hidden
      el.querySelector('strong').textContent = Number(summary.average).toFixed(1);
      el.querySelector('span').textContent = `${summary.total} guest review${summary.total === 1 ? '' : 's'}`;
      el.hidden = false;
      if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        window.gsap.from(el, { y: 12, autoAlpha: 0, duration: 0.6, ease: 'back.out(2)', clearProps: 'transform,opacity,visibility' });
      }
    } catch {
      /* rating is a nice-to-have; stay hidden on any error */
    }
  }

  updateStatus();
  setInterval(updateStatus, 60 * 1000);
  loadRating();
})();
