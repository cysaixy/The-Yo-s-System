// Automatically update copyright year dynamically across all subpages
document.addEventListener("DOMContentLoaded", () => {
  const yElement = document.getElementById('year');
  if (yElement) yElement.textContent = new Date().getFullYear();

  // Mobile navigation hamburger click systems
  const navToggle = document.getElementById('navToggle');
  const siteNav = document.getElementById('siteNav');
  
  if (navToggle && siteNav) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      siteNav.classList.toggle('open');
      navToggle.textContent = siteNav.classList.contains('open') ? '✕' : '☰';
    });
  }

  // Scroll animations observer framework
  const revealEls = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('in'); });
  }, { threshold: 0.1 });
  revealEls.forEach(el => io.observe(el));
});