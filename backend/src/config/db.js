// src/config/db.js
// Single shared connection pool. Every model imports this instead of
// creating its own client, so we don't leak connections.

import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();

// Supports either a hosted connection string (DATABASE_URL / POSTGRES_URL —
// what Neon/Supabase/Railway give you, and what Vercel's Neon integration
// injects as POSTGRES_URL_DATABASE_URL) or separate DB_HOST/DB_USER/etc for
// local Postgres. Without this fallback, a deployment with only
// DATABASE_URL set (no discrete DB_HOST/DB_USER/etc) would silently try to
// connect to localhost and fail with ECONNREFUSED.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_DATABASE_URL;

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    })
  : new Pool({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
  process.exit(1);
});

export default pool;