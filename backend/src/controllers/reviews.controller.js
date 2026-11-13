// src/controllers/reviews.controller.js
// Guest reviews: public wall, signed-in customers can post, admins moderate.
import pool from '../config/db.js';
import { censorText } from '../utils/profanity.js';

const MAX_COMMENT = 1000;
const MIN_COMMENT = 5;
const REVIEW_COOLDOWN_HOURS = 24;

let tableReady = null;
export function ensureReviewsTable() {
  if (!tableReady) {
    tableReady = pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id            SERIAL PRIMARY KEY,
        customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        firebase_uid  VARCHAR(128) NOT NULL,
        display_name  VARCHAR(120) NOT NULL,
        rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment       TEXT NOT NULL CHECK (char_length(comment) <= ${MAX_COMMENT}),
        flagged       BOOLEAN NOT NULL DEFAULT FALSE,
        status        VARCHAR(16) NOT NULL DEFAULT 'published'
                      CHECK (status IN ('published', 'hidden')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews (status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_reviews_uid_created ON reviews (firebase_uid, created_at DESC);
    `).catch(err => { tableReady = null; throw err; });
  }
  return tableReady;
}

// "Maria Clara Santos" -> "Maria S." — enough to feel personal on a public
// wall without publishing full names or email addresses.
function publicName(fullName, email) {
  const clean = String(fullName || '').replace(/\s+/g, ' ').trim();
  const parts = clean ? clean.split(' ') : [String(email || 'Guest').split('@')[0]];
  const first = parts[0].slice(0, 40);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0].toUpperCase()}.` : '';
  return censorText(`${first}${lastInitial}`).text;
}

function toInt(value, fallback, min, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function shapeReview(row) {
  return {
    id: row.id,
    name: row.display_name,
    rating: row.rating,
    comment: row.comment,
    created_at: row.created_at,
  };
}

// GET /api/customer/reviews?limit=20&offset=0 — public guest wall + summary
export async function listPublicReviews(req, res, next) {
  try {
    await ensureReviewsTable();
    const limit = toInt(req.query.limit, 20, 1, 50);
    const offset = toInt(req.query.offset, 0, 0, 100000);

    const [{ rows }, { rows: summaryRows }] = await Promise.all([
      pool.query(
        `SELECT id, display_name, rating, comment, created_at
         FROM reviews WHERE status = 'published'
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COALESCE(ROUND(AVG(rating)::numeric, 1), 0)::float AS average,
                COUNT(*) FILTER (WHERE rating = 5)::int AS r5,
                COUNT(*) FILTER (WHERE rating = 4)::int AS r4,
                COUNT(*) FILTER (WHERE rating = 3)::int AS r3,
                COUNT(*) FILTER (WHERE rating = 2)::int AS r2,
                COUNT(*) FILTER (WHERE rating = 1)::int AS r1
         FROM reviews WHERE status = 'published'`
      ),
    ]);

    const s = summaryRows[0];
    res.json({
      reviews: rows.map(shapeReview),
      summary: {
        total: s.total,
        average: s.average,
        distribution: { 5: s.r5, 4: s.r4, 3: s.r3, 2: s.r2, 1: s.r1 },
      },
      hasMore: offset + rows.length < s.total,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/customer/reviews — signed-in customers only
export async function createReview(req, res, next) {
  try {
    await ensureReviewsTable();
    const { firebaseUid, email, customer } = req.user;
    if (!customer) {
      return res.status(403).json({ error: 'Please finish setting up your account before leaving a review.' });
    }

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Please choose a rating from 1 to 5 stars.' });
    }

    const raw = typeof req.body?.comment === 'string' ? req.body.comment : '';
    // Strip control characters, collapse runs of blank lines.
    const comment = Array.from(raw, ch => {
      const code = ch.charCodeAt(0);
      return (code < 32 && ch !== '\n') || code === 127 ? ' ' : ch;
    }).join('').replace(/\n{3,}/g, '\n\n').trim();

    if (comment.length < MIN_COMMENT) {
      return res.status(400).json({ error: `Please write at least ${MIN_COMMENT} characters.` });
    }
    if (comment.length > MAX_COMMENT) {
      return res.status(400).json({ error: `Reviews can be at most ${MAX_COMMENT} characters.` });
    }

    const { rows: recent } = await pool.query(
      `SELECT 1 FROM reviews
       WHERE firebase_uid = $1 AND created_at > NOW() - make_interval(hours => $2)
       LIMIT 1`,
      [firebaseUid, REVIEW_COOLDOWN_HOURS]
    );
    if (recent.length) {
      return res.status(429).json({ error: 'You already posted a review today. Thank you! You can post again tomorrow.' });
    }

    // Bad words are masked before anything is stored — the original wording
    // never reaches the database.
    const censored = censorText(comment);

    const { rows } = await pool.query(
      `INSERT INTO reviews (customer_id, firebase_uid, display_name, rating, comment, flagged)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, display_name, rating, comment, created_at`,
      [customer.id, firebaseUid, publicName(customer.name, email), rating, censored.text, censored.flagged]
    );

    res.status(201).json({
      review: shapeReview(rows[0]),
      censored: censored.flagged,
      message: censored.flagged
        ? 'Thanks! Your review is posted. Some words were hidden to keep the wall friendly.'
        : 'Thank you! Your review is now on the guest wall.',
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/admin/reviews?status=all|published|hidden|flagged
export async function adminListReviews(req, res, next) {
  try {
    await ensureReviewsTable();
    const filter = String(req.query.status || 'all');
    const where = {
      published: 'WHERE r.status = \'published\'',
      hidden: 'WHERE r.status = \'hidden\'',
      flagged: 'WHERE r.flagged = TRUE',
    }[filter] || '';

    const [{ rows }, { rows: stats }] = await Promise.all([
      pool.query(
        `SELECT r.id, r.display_name, r.rating, r.comment, r.flagged, r.status, r.created_at,
                c.name AS customer_name, c.email AS customer_email
         FROM reviews r LEFT JOIN customers c ON c.id = r.customer_id
         ${where}
         ORDER BY r.created_at DESC LIMIT 200`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'published')::int AS published,
                COUNT(*) FILTER (WHERE status = 'hidden')::int AS hidden,
                COUNT(*) FILTER (WHERE flagged)::int AS flagged,
                COALESCE(ROUND(AVG(rating) FILTER (WHERE status = 'published')::numeric, 1), 0)::float AS average
         FROM reviews`
      ),
    ]);
    res.json({ reviews: rows, stats: stats[0] });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/admin/reviews/:id/status  { status: 'published' | 'hidden' }
export async function adminSetReviewStatus(req, res, next) {
  try {
    await ensureReviewsTable();
    const id = Number.parseInt(req.params.id, 10);
    const { status } = req.body || {};
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid review id.' });
    if (!['published', 'hidden'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });

    const { rows } = await pool.query(
      `UPDATE reviews SET status = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, status`,
      [status, id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Review not found.' });
    res.json({ review: rows[0] });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/admin/reviews/:id
export async function adminDeleteReview(req, res, next) {
  try {
    await ensureReviewsTable();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid review id.' });
    const { rowCount } = await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Review not found.' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
