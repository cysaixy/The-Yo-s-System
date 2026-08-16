// src/config/db.js
import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";
dotenv.config();

const connectionString =
  process.env.POSTGRES_URL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

// TEMPORARY DIAGNOSTIC — remove once confirmed which host we're hitting.
console.log(
  "[db.js] Using connection string, host:",
  connectionString ? connectionString.split('@')[1]?.split('/')[0] : "NONE FOUND"
);
console.log(
  "[db.js] Which env var won:",
  process.env.POSTGRES_URL_DATABASE_URL ? "POSTGRES_URL_DATABASE_URL" :
  process.env.DATABASE_URL ? "DATABASE_URL" :
  process.env.POSTGRES_URL ? "POSTGRES_URL" : "NONE"
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