import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

// Supports either a single connection string (DATABASE_URL / POSTGRES_URL —
// what Neon/Supabase/Railway give you, and what Vercel's Neon integration
// injects as POSTGRES_URL_DATABASE_URL) or separate DB_HOST/DB_USER/etc for
// a plain local Postgres. This lets you point this same file at Neon
// temporarily (e.g. to run initTables() against it) just by setting
// DATABASE_URL in your local .env — no code change needed to switch back
// to local Postgres afterward, just remove that one line.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_DATABASE_URL;

// TEMPORARY DIAGNOSTIC — remove once we confirm which branch is used.
console.log(
  connectionString
    ? `[db.js] Using connection string, host: ${connectionString.split('@')[1]?.split('/')[0]}`
    : `[db.js] No connection string found — falling back to DB_HOST=${process.env.DB_HOST}`
);

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
      host: process.env.DB_HOST,
      database: process.env.DB_NAME,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

pool.on("error", (err) => {
  console.error("Unexpected error from pool:", err);
  process.exit(-1);
});

export default pool;