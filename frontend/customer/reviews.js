// reviews.js — guest wall backed by the database.
// Reading is public; posting needs a signed-in customer. The server masks
// offensive words before saving, so the wall only ever shows clean text.
import { auth, onAuthStateChanged } from './firebase-init.js';

const API = '/api/customer/reviews';
const PAGE_SIZE = 10;
const RATING_HINTS = {
  1: '1/5 — Poor experience',
  2: '2/5 — Below average',
  3: '3/5 — Good, average meal',
  4: '4/5 — Very good, enjoyed it!',
  5: '5/5 — Outstanding! Loved everything.',
};

const form = document.getElementById('reviewForm');
const formCard = document.getElementById('reviewFormCard');
const authGate = document.getElementById('reviewsAuthGate');
const status = document.getElementById('reviewFormStatus');
const textarea = document.getElementById('feedbackText');
const charCount = document.getElementById('rvCharCount');
const submitBtn = form.querySelector('button[type="submit"]');
const container = document.getElementById('commentsDisplay');
const loadMoreBtn = document.getElementById('rvLoadMore');
const stars = [...document.querySelectorAll('#starSelector [data-value]')];

let currentUser = null;
let chosenRating = 5;
let offset = 0;
let loaded = [];

const gsap = () => (!window.matchMedia('(prefers-reduced-motion: reduce)').matches ? window.gsap : null);

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function initials(name) {
  const parts = String(name || 'G').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'G';
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0][0]).toUpperCase();
}

function publicName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Guest';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

function timeAgo(value) {
  const date = new Date(value);
  const secs = Math.max(0, (Date.now() - date.getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)} hr ago`;
  if (secs < 86400 * 7) return `${Math.floor(secs / 86400)} day${secs < 86400 * 2 ? '' : 's'} ago`;
  return date.toLocaleDateString('en-PH', { dateStyle: 'medium' });
}

function setStatus(message, kind = '') {
  status.textContent = message;
  status.className = `reviews-status${kind ? ` ${kind}` : ''}`;
}

/* ---------------- Summary ---------------- */
function renderSummary(summary) {
  const total = summary?.total || 0;
  const avg = Number(summary?.average || 0);
  document.getElementById('rvAverage').textContent = total ? avg.toFixed(1) : '–';
  document.getElementById('rvTotal').textContent = total
    ? `Based on ${total} review${total === 1 ? '' : 's'}`
    : 'No reviews yet — be the first!';
  const full = Math.round(avg);
  document.getElementById('rvAverageStars').innerHTML = `${'★'.repeat(full)}<span class="rv-dim">${'★'.repeat(5 - full)}</span>`;

  const dist = summary?.distribution || {};
  document.getElementById('rvBars').innerHTML = [5, 4, 3, 2, 1].map(n => {
    const count = dist[n] || 0;
    const pct = total ? Math.round((count / total) * 100) : 0;
    return `
      <div class="rv-bar-row">
        <span class="rv-bar-label">${n} ★</span>
        <span class="rv-bar-track"><i class="rv-bar-fill" data-pct="${pct}" style="width:${pct}%"></i></span>
        <span class="rv-bar-count">${count}</span>
      </div>`;
  }).join('');

  const g = gsap();
  if (g) g.from('#rvBars .rv-bar-fill', { width: 0, duration: 1, ease: 'power3.out', stagger: 0.06 });
}

/* ---------------- Wall ---------------- */
function reviewCard(review) {
  const rating = Math.max(1, Math.min(5, Number(review.rating) || 5));
  return `
    <article class="comment-card" data-review-id="${Number(review.id)}">
      <div class="comment-header">
        <div class="comment-author-wrap">
          <div class="comment-avatar" aria-hidden="true">${escapeHtml(initials(review.name))}</div>
          <div class="comment-author-meta">
            <span class="comment-user">${escapeHtml(review.name)}</span>
            <span class="comment-verified-badge">Verified Guest</span>
          </div>
        </div>
        <div class="comment-stars-wrap">
          <span class="comment-stars" aria-label="${rating} out of 5 stars">${'★'.repeat(rating)}<span style="opacity:.2">${'★'.repeat(5 - rating)}</span></span>
          <span class="comment-star-label">${rating}/5</span>
        </div>
      </div>
      <p class="comment-text">${escapeHtml(review.comment)}</p>
      <span class="comment-date">${escapeHtml(timeAgo(review.created_at))}</span>
    </article>`;
}

function renderWall() {
  const countEl = document.getElementById('reviewsWallCount');
  if (countEl) countEl.textContent = loaded.length ? `${loaded.length} shown` : '';
  container.innerHTML = loaded.length
    ? loaded.map(reviewCard).join('')
    : '<div class="reviews-empty">No reviews yet. Be the first to share your experience!</div>';
}

async function loadReviews({ append = false } = {}) {
  try {
    loadMoreBtn.disabled = true;
    const res = await fetch(`${API}?limit=${PAGE_SIZE}&offset=${append ? offset : 0}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load reviews.');
    loaded = append ? loaded.concat(data.reviews) : data.reviews;
    offset = loaded.length;
    renderWall();
    renderSummary(data.summary);
    loadMoreBtn.hidden = !data.hasMore;
  } catch (err) {
    console.error('Could not load reviews:', err);
    if (!append) container.innerHTML = '<div class="reviews-empty">Reviews could not be loaded right now. Please try again in a moment.</div>';
    document.getElementById('rvTotal').textContent = 'Reviews unavailable';
  } finally {
    loadMoreBtn.disabled = false;
  }
}

loadMoreBtn.addEventListener('click', () => loadReviews({ append: true }));

/* ---------------- Form ---------------- */
function updateRating(rating) {
  chosenRating = rating;
  stars.forEach(star => {
    const value = Number(star.dataset.value);
    star.classList.toggle('active', value <= rating);
    star.setAttribute('aria-checked', String(value === rating));
  });
  document.getElementById('starRatingHint').textContent = RATING_HINTS[rating];
  const g = gsap();
  if (g) g.fromTo(stars.slice(0, rating), { scale: 0.7 }, { scale: 1, duration: 0.45, ease: 'back.out(3)', stagger: 0.04, clearProps: 'transform' });
}

stars.forEach(star => {
  const select = () => updateRating(Number(star.dataset.value));
  star.addEventListener('click', select);
  star.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); updateRating(Math.min(5, chosenRating + 1)); stars[chosenRating - 1].focus(); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); updateRating(Math.max(1, chosenRating - 1)); stars[chosenRating - 1].focus(); }
  });
});

textarea.addEventListener('input', () => {
  charCount.textContent = `${textarea.value.length} / 1000`;
  charCount.classList.toggle('is-near', textarea.value.length > 900);
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser) {
    formCard.hidden = true;
    authGate.hidden = false;
    return;
  }
  if (!document.getElementById('publicEmailConsent').checked) {
    setStatus('Please tick the box to agree your review will be public.', 'error');
    return;
  }
  const comment = textarea.value.trim();
  if (comment.length < 5) {
    setStatus('Please write at least 5 characters.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Posting…';
  setStatus('');
  try {
    const send = async token => fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ rating: chosenRating, comment }),
    });
    let res = await send(await currentUser.getIdToken());
    if (res.status === 401) res = await send(await currentUser.getIdToken(true));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Your review could not be posted. Please try again.');

    form.reset();
    charCount.textContent = '0 / 1000';
    updateRating(5);
    setStatus(data.message || 'Thank you! Your review is now on the guest wall.', 'success');
    await loadReviews();
    const first = container.querySelector('.comment-card');
    const g = gsap();
    if (first && g) {
      g.fromTo(first, { autoAlpha: 0, y: -16, scale: 0.97 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
      first.classList.add('is-new');
    }
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit Review';
  }
});

// Old builds kept reviews in this browser only; they now live in the database.
try { localStorage.removeItem('theyos_guest_reviews'); } catch {}

loadReviews();

onAuthStateChanged(auth, user => {
  currentUser = user;
  authGate.hidden = Boolean(user);
  formCard.hidden = !user;
  if (!user) return;
  const fullName = user.displayName?.trim() || user.email?.split('@')[0] || 'Guest';
  document.getElementById('reviewerName').textContent = fullName;
  document.getElementById('reviewerEmail').textContent = 'Signed in';
  document.getElementById('reviewerPublicName').textContent = publicName(fullName);
  const avatarEl = document.getElementById('reviewerAvatar');
  if (avatarEl) avatarEl.textContent = initials(fullName);
}, error => {
  console.error('Could not check sign-in status for reviews:', error);
  formCard.hidden = true;
  authGate.hidden = false;
});
