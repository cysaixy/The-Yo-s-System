/* Homepage scroll scenes; business logic remains in global.js and cart.js. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // home-anim.js drives everything (all breakpoints) once GSAP + ScrollTrigger
  // are available - this plain-JS version is only a fallback for when that
  // CDN script fails to load. Running both at once means two systems set
  // transforms on the same Find Us image layers every scroll frame, which
  // is what caused the jumpy/broken-looking scroll behavior.
  const hasGsap = window.gsap && window.ScrollTrigger;
  const clamp = n => Math.max(0, Math.min(1, n));
  const chapter = (root, draw) => {
    if (!root || reduce || hasGsap) return;
    let queued = false;
    const update = () => { const r = root.getBoundingClientRect(); draw(clamp(-r.top / Math.max(1, root.offsetHeight - innerHeight))); queued = false; };
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', request, {passive:true}); addEventListener('resize', request, {passive:true}); update();
  };
  addEventListener('DOMContentLoaded', () => {
    const story = document.querySelector('#orderStory .journey'), img = document.getElementById('storyImage'), label = document.getElementById('storyLabel'), copy = document.getElementById('storyText');
    const steps = [['01 / 04 · Choose your drink','Browse our drinks and choose something you’ll enjoy.','how-drink.svg'],['02 / 04 · Choose your way','Choose dine-in, pickup, delivery, or plan your order ahead.','how-way.svg'],['03 / 04 · Review your order','Check your drinks, quantities, order details, and total.','how-cart.svg'],['04 / 04 · Confirm and track','Send your order, receive confirmation, and check its status from My Orders.','how-track.svg']];
    chapter(story, p => { const i = Math.min(3,Math.floor(p*4)); if(label)label.textContent=steps[i][0];if(copy)copy.textContent=steps[i][1];if(img&&img.dataset.step!==String(i)){img.dataset.step=i;img.src='./assets/svg/'+steps[i][2];}if(img)img.style.transform=`translateY(${(p*4%1-.5)*-24}px) scale(${.94+p*4%1*.08})`; });
    const journey=document.getElementById('locationJourney'),scene=document.getElementById('mapFrame'),caption=document.getElementById('journeyLabel'),text=document.getElementById('locationText'),arrival=document.getElementById('arrivalCard');
    const l=Object.fromEntries(['background','midground','road','foreground','store','marker'].map(k=>[k,scene?.querySelector('.'+k)]));
    const scenes=[['01 / 04 · You’re on the road','Follow the way to The~Yo’s Resto Bar in the heart of Baggao.'],['02 / 04 · Approaching Baggao','The road gets closer to the heart of Baggao.'],['03 / 04 · There you are','The~Yo’s Resto Bar is just ahead.'],['04 / 04 · You’ve arrived','Welcome to The~Yo’s Resto Bar.']];
    chapter(journey,p=>{const s=scenes[Math.min(3,Math.floor(p*4))],near=clamp((p-.45)/.4),done=clamp((p-.72)/.22);if(caption)caption.textContent=s[0];if(text)text.textContent=s[1];if(l.background)l.background.style.transform=`translateY(${p*-12}px) scale(${1+p*.05})`;if(l.midground)l.midground.style.transform=`translateY(${p*-35}px) scale(${1+p*.12})`;if(l.road)l.road.style.transform=`translateY(${p*80}px) scale(${1+p*.34})`;if(l.foreground)l.foreground.style.transform=`translateY(${p*55}px) scale(${1+p*.18})`;if(l.store){l.store.style.opacity=near;l.store.style.filter=`blur(${(1-near)*9}px)`;l.store.style.transform=`translateY(${(1-near)*54}px) scale(${.58+near*.42})`;}if(l.marker){l.marker.style.opacity=done;l.marker.style.transform=`translateY(${(1-done)*-45}px) scale(${.6+done*.4})`;}if(arrival){arrival.style.opacity=done;arrival.style.transform=`translateY(${(1-done)*24}px)`;}}); 
  });
})();