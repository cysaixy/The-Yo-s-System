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

  // --- NEW LIGHT/DARK MODE ENGINE ---
  initThemeEngine();
});

function initThemeEngine() {
  const body = document.body;
  const isMenuPage = body.classList.contains('menu-page-theme');
  const savedTheme = localStorage.getItem('theme-preference');
  
  // Inject theme switch button dynamically inside the navigation list
  const navUl = document.querySelector('#siteNav ul');
  if (navUl) {
    const toggleLi = document.createElement('li');
    toggleLi.innerHTML = `<button class="theme-toggle-btn" id="themeToggleBtn">🌓 Theme</button>`;
    navUl.appendChild(toggleLi);

    document.getElementById('themeToggleBtn').addEventListener('click', () => {
      if (isMenuPage) {
        body.classList.toggle('light-theme');
        const activeDark = !body.classList.contains('light-theme');
        localStorage.setItem('theme-preference', activeDark ? 'dark' : 'light');
      } else {
        body.classList.toggle('dark-theme');
        const activeDark = body.classList.contains('dark-theme');
        localStorage.setItem('theme-preference', activeDark ? 'dark' : 'light');
      }
    });
  }

  // Apply stored preferences on load
  if (savedTheme === 'dark') {
    if (!isMenuPage) body.classList.add('dark-theme');
    else body.classList.remove('light-theme');
  } else if (savedTheme === 'light') {
    if (isMenuPage) body.classList.add('light-theme');
    else body.classList.remove('dark-theme');
  }
}