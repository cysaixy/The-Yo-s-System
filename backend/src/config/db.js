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

// Neon connections default to a UTC session timezone. Every `::date` cast,
// CURRENT_DATE, and date_trunc('...', ...) call across the controllers
// (salesController, dashboardController, purchasesController,
// inventoryController) truncates timestamps using this session timezone.
// Without pinning it, an order placed at 2:35 AM Manila time (6:35 PM UTC
// the day before) gets filed under the wrong calendar day everywhere in
// the admin panel — "today's" filters miss it, and it shows up under
// yesterday instead. Setting it once here, on every new connection,
// fixes date filtering/grouping across the whole backend in one place.
pool.on("connect", (client) => {
  client.query("SET TIME ZONE 'Asia/Manila'").catch((err) => {
    console.error("[db.js] Failed to set session timezone:", err);
  });
});

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
  process.exit(1);
});

export default pool;