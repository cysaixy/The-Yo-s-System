import { auth, onAuthStateChanged } from './firebase-init.js';

const REVIEWS_STORAGE_KEY = 'theyos_guest_reviews';
const DEFAULT_REVIEWS = [
  {
    name: 'Aaron Lavado',
    stars: 5,
    text: 'The Barbeque Pork Ribs are unbelievably tender!',
    date: 'July 2, 2026'
  },
  {
    name: 'Claire Mendoza',
    stars: 5,
    text: 'Best Batil Patung in Baggao! The iced caramel macchiato is also top-tier.',
    date: 'August 10, 2026'
  }
];
const RATING_HINTS = {
  1: '1/5 — Poor experience',
  2: '2/5 — Below average',
  3: '3/5 — Good, average meal',
  4: '4/5 — Very good, enjoyed it!',
  5: '5/5 — Outstanding! Loved everything.'
};

const form = document.getElementById('reviewForm');
const formCard = document.getElementById('reviewFormCard');
const authGate = document.getElementById('reviewsAuthGate');
const status = document.getElementById('reviewFormStatus');
const stars = [...document.querySelectorAll('#starSelector [data-value]')];
let currentUser = null;
let chosenRating = 5;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function initials(name) {
  const parts = String(name || 'Y').trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0][0]).toUpperCase();
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `reviews-status${kind ? ` ${kind}` : ''}`;
}

function readReviews() {
  const stored = localStorage.getItem(REVIEWS_STORAGE_KEY);
  if (stored === null) {
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(DEFAULT_REVIEWS));
    return DEFAULT_REVIEWS;
  }
  const reviews = JSON.parse(stored);
  if (!Array.isArray(reviews)) throw new Error('Saved reviews have an invalid format.');
  return reviews;
}

function renderReviews(reviews) {
  const container = document.getElementById('commentsDisplay');
  container.innerHTML = reviews.map(review => {
    const name = String(review.name || 'Guest');
    const rating = Math.max(1, Math.min(5, Number.parseInt(review.stars, 10) || 5));
    return `
      <article class="comment-card">
        <div class="comment-header">
          <div class="comment-author-wrap">
            <div class="comment-avatar" aria-hidden="true">${escapeHtml(initials(name))}</div>
            <div>
              <span class="comment-user">${escapeHtml(name)}</span>
              ${review.email ? `<span class="comment-email">${escapeHtml(review.email)}</span>` : ''}
              <span class="comment-verified-badge">Verified Guest</span>
            </div>
          </div>
          <span class="comment-stars" aria-label="${rating} out of 5 stars">${'★'.repeat(rating)}</span>
        </div>
        <p class="comment-text">${escapeHtml(review.text)}</p>
        <span class="comment-date">${escapeHtml(review.date)}</span>
      </article>`;
  }).join('');
}

function refreshReviews() {
  try {
    renderReviews(readReviews());
  } catch (error) {
    console.error('Could not load guest reviews:', error);
    document.getElementById('commentsDisplay').textContent = 'Reviews could not be loaded. Please refresh the page.';
  }
}

function updateRating(rating) {
  chosenRating = rating;
  stars.forEach(star => {
    const active = Number(star.dataset.value) <= rating;
    star.classList.toggle('active', active);
    star.setAttribute('aria-checked', String(Number(star.dataset.value) === rating));
  });
  document.getElementById('starRatingHint').textContent = RATING_HINTS[rating];
}

stars.forEach(star => {
  const select = () => updateRating(Number(star.dataset.value));
  star.addEventListener('click', select);
  star.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      select();
    }
  });
});

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!currentUser?.email) {
    formCard.hidden = true;
    authGate.hidden = false;
    setStatus('Please sign in with an account that has an email address.', 'error');
    return;
  }

  if (!document.getElementById('publicEmailConsent').checked) {
    setStatus('Please confirm that you understand your email will be public.', 'error');
    return;
  }

  const text = document.getElementById('feedbackText').value.trim();
  if (!text) {
    setStatus('Please enter your review.', 'error');
    return;
  }

  const name = currentUser.displayName?.trim() || currentUser.email.split('@')[0];
  let reviews;
  try {
    reviews = readReviews();
    reviews.unshift({
      name,
      email: currentUser.email,
      stars: chosenRating,
      text,
      date: new Date().toLocaleDateString('en-PH', { dateStyle: 'medium' })
    });
    localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(reviews));
  } catch (error) {
    console.error('Could not save guest review:', error);
    setStatus('Your review could not be saved. Please try again.', 'error');
    return;
  }

  renderReviews(reviews);
  form.reset();
  updateRating(5);
  setStatus('Thank you! Your review is now on the public guest wall.', 'success');
});

refreshReviews();
onAuthStateChanged(auth, user => {
  currentUser = user;
  authGate.hidden = Boolean(user);
  formCard.hidden = !user;
  if (!user) return;

  const name = user.displayName?.trim() || user.email?.split('@')[0] || 'Account';
  document.getElementById('reviewerName').textContent = name;
  document.getElementById('reviewerEmail').textContent = user.email || 'Email unavailable';
}, error => {
  console.error('Could not check sign-in status for reviews:', error);
  formCard.hidden = true;
  authGate.hidden = false;
  setStatus('Could not verify your account. Please refresh and try again.', 'error');
});
