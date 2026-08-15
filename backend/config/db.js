// src/config/db.js
// Single shared connection pool. Every model imports this instead of
// creating its own client, so we don't leak connections.
//
// Supports two ways of configuring the connection:
//   1. DATABASE_URL (or POSTGRES_URL) — a single connection string, which
//      is what Neon/Supabase/Railway hand you directly. Preferred when set.
//   2. DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT — separate
//      fields, for local development against a plain local Postgres.
//
// Hosted providers like Neon require SSL. Locally, plain Postgres usually
// doesn't support it at all, so SSL is only enabled when we detect we're
// using a connection string (i.e. NOT local dev).

import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  // Vercel's Neon integration names variables using whatever custom prefix
  // was set during setup + Neon's own default suffix, e.g. a "POSTGRES_URL"
  // prefix produces "POSTGRES_URL_DATABASE_URL" rather than a plain
  // "POSTGRES_URL". Checked last so an explicit DATABASE_URL/POSTGRES_URL
  // always wins if you ever add one directly.
  process.env.POSTGRES_URL_DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    })
  : new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
    });

pool.on("error", (err) => {
  // Log only — do NOT process.exit() here. On Vercel this runs inside a
  // shared serverless function process; exiting on a single transient
  // connection hiccup can take down unrelated in-flight requests with it.
  console.error("Unexpected PostgreSQL pool error:", err);
});

export default pool;