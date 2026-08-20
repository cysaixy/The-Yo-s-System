/* The~Yo's GSAP-style homepage motion.
   Uses GSAP + ScrollTrigger (CDN). Every animated state is gated behind
   body.js-anim so the page stays fully readable without JS or with
   prefers-reduced-motion enabled. */
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGsap = window.gsap && window.ScrollTrigger;
  if (reduce || !hasGsap) return;

  gsap.registerPlugin(ScrollTrigger);
  document.body.classList.add('js-anim');
  ScrollTrigger.config({ ignoreMobileResize: true });

  const clamp = n => Math.max(0, Math.min(1, n));

  // Pinned horizontal scroll: vertical scroll slides the track sideways.
  const horiz = (section, track) => {
    const stage = section.querySelector('.gs-horz-stage');
    const bar = section.querySelector('.gs-horz-progress i');
    const distance = () => Math.max(0, track.scrollWidth - window.innerWidth);
    const setBar = bar ? gsap.quickSetter(bar, 'width', '%') : null;
    gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => '+=' + distance(),
        scrub: 1,
        pin: stage,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => { if (setBar) setBar(self.progress * 100); }
      }
    });
  };

  const ready = () => {
    // --- Hero entrance (never allowed to leave content hidden: a timer
    // watchdog force-reveals everything even if the ticker stalls) ---
    const letters = gsap.utils.toArray('.gs-hero .l > span');
    const fades = gsap.utils.toArray('.gs-hero .fade-in');
    if (letters.length) gsap.from(letters, { yPercent: 115, duration: 1.1, ease: 'power4.out', stagger: 0.06, delay: 0.1 });
    if (fades.length) gsap.from(fades, { y: 26, opacity: 0, duration: 1, ease: 'power3.out', stagger: 0.12, delay: 0.5 });
    setTimeout(() => {
      if (letters.length) gsap.set(letters, { clearProps: 'transform' });
      if (fades.length) gsap.set(fades, { clearProps: 'transform,opacity' });
    }, 2000);

    // --- Hero scroll parallax ---
    const hero = document.querySelector('.gs-hero');
    if (hero) {
      const heroScroll = { trigger: hero, start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('.gs-hero-inner', { yPercent: 14, ease: 'none', scrollTrigger: heroScroll });
      gsap.to('.gs-hero-figure', { yPercent: -8, ease: 'none', scrollTrigger: heroScroll });
      gsap.to('.gs-hero-word', { xPercent: 12, ease: 'none', scrollTrigger: heroScroll });
    }

    // --- Horizontal chapters ---
    const story = document.getElementById('orderStory');
    if (story) {
      const track = story.querySelector('.gs-horz-track');
      if (track) horiz(story, track);
    }

    // --- Location journey: ONE pinned scene on every breakpoint. Scroll
    // only drives the SVG layers + the step copy - the section itself
    // never moves and never splits into separate screens. ---
    const journey = document.getElementById('locationJourney');
    const scene = document.getElementById('mapFrame');
    if (journey && scene) {
      const l = {};
      ['background', 'midground', 'road', 'foreground', 'store', 'marker']
        .forEach(k => (l[k] = scene.querySelector('.' + k)));
      const arrival = document.getElementById('arrivalCard');
      const titleEl = document.getElementById('findUsTitle');
      const labelEl = document.getElementById('journeyLabel');
      const textEl = document.getElementById('locationText');

      // Same four steps used by the no-GSAP fallback (scroll-effects.js),
      // kept here so the copy updates even when GSAP is driving the show.
      const steps = [
        ["01 / 04 \u00b7 You're on the road", "Follow the way to The~Yo's Resto Bar in the heart of Baggao.", "Walk to<br>The~Yo's."],
        ["02 / 04 \u00b7 Approaching Baggao", "The road gets closer to the heart of Baggao.", "Walk to<br>The~Yo's."],
        ["03 / 04 \u00b7 There you are", "The~Yo's Resto Bar is just ahead.", "Walk to<br>The~Yo's."],
        ["04 / 04 \u00b7 You've arrived", "Welcome to The~Yo's Resto Bar.", "You've<br>arrived."]
      ];
      let activeStep = -1;
      const setStep = i => {
        if (i === activeStep) return;
        activeStep = i;
        const [label, text, title] = steps[i];
        if (labelEl) labelEl.textContent = label;
        if (textEl) textEl.textContent = text;
        if (titleEl) titleEl.innerHTML = title;
      };

      // Scroll distance scales with viewport so the animation reads at the
      // same pace on a short phone as on a tall desktop screen, instead of
      // using one fixed desktop-tuned pixel value everywhere.
      const journeyDistance = () => Math.max(1200, Math.min(2400, window.innerHeight * 2.4));

      ScrollTrigger.create({
        trigger: journey,
        start: 'top top',
        end: () => '+=' + journeyDistance(),
        scrub: 1,
        pin: scene,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => {
          const p = self.progress;
          if (l.background) gsap.set(l.background, { y: p * -12, scale: 1 + p * 0.05 });
          if (l.midground) gsap.set(l.midground, { y: p * -35, scale: 1 + p * 0.12 });
          if (l.road) gsap.set(l.road, { y: p * 80, scale: 1 + p * 0.34 });
          if (l.foreground) gsap.set(l.foreground, { y: p * 55, scale: 1 + p * 0.18 });
          const near = clamp((p - 0.45) / 0.4), done = clamp((p - 0.72) / 0.22);
          if (l.store) gsap.set(l.store, { opacity: near, filter: `blur(${(1 - near) * 9}px)`, y: (1 - near) * 54, scale: 0.58 + near * 0.42 });
          if (l.marker) gsap.set(l.marker, { opacity: done, y: (1 - done) * -45, scale: 0.6 + done * 0.4 });
          if (arrival) gsap.set(arrival, { opacity: done, y: (1 - done) * 24 });
          setStep(Math.min(3, Math.floor(p * 4)));
        }
      });

      // The location SVGs are external <img> assets - their real box size
      // isn't known until they load, which can throw ScrollTrigger's pinned
      // measurements off (especially on mobile where layout is tighter).
      // Re-measure once everything has actually loaded.
      const artImgs = Array.from(scene.querySelectorAll('.location-layer'));
      Promise.all(artImgs.map(img => img.complete
        ? Promise.resolve()
        : new Promise(res => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); })
      )).then(() => ScrollTrigger.refresh());
    }

    ScrollTrigger.refresh();

    // Re-measure on resize/orientation change (debounced) so the pin
    // distance and step boundaries stay correct - covers rotating a
    // tablet/phone and the mobile browser chrome resizing the viewport.
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => ScrollTrigger.refresh(), 200);
    });
  };

  // Script runs at the end of <body>, so the DOM is already parsed.
  ready();
})();