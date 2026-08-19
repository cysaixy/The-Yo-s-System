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

    // --- Location journey (parallax layers + arrival) ---
    const journey = document.getElementById('locationJourney');
    const scene = document.getElementById('mapFrame');
    if (journey && scene) {
      const l = {};
      ['background', 'midground', 'road', 'foreground', 'store', 'marker']
        .forEach(k => (l[k] = scene.querySelector('.' + k)));
      const arrival = document.getElementById('arrivalCard');
      ScrollTrigger.create({
        trigger: journey,
        start: 'top top',
        end: '+=2200',
        scrub: 1,
        pin: innerWidth > 900 ? scene : false,
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
        }
      });
    }

    ScrollTrigger.refresh();
  };

  // Script runs at the end of <body>, so the DOM is already parsed.
  ready();
})();