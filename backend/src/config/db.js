// src/config/db.js
import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';
dotenv.config({ quiet: true });

let connectionString =
  process.env.POSTGRES_URL_DATABASE_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

const isLocal =
  connectionString &&
  (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'));

// If hosted Postgres connection string uses legacy sslmode aliases (e.g. sslmode=require),
// upgrade to sslmode=verify-full to satisfy pg-connection-string and eliminate stderr security warnings in Vercel logs.
if (connectionString && !isLocal) {
  connectionString = connectionString.replace(/([?&]sslmode=)(?:require|prefer|verify-ca)(?=&|$)/, '$1verify-full');
}

const pool = connectionString
  ? new Pool({
    connectionString:
      isLocal
        ? connectionString
        : !connectionString.includes('-pooler')
          ? (() => {
              const hostMatch = connectionString.match(/@([^\/]+)/);
              if (hostMatch) {
                const host = hostMatch[1];
                const newHost = host.replace(/\.c-/, '-pooler.c-');
                return connectionString.replace(host, newHost);
              }
              return connectionString;
            })()
          : connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: true },
    options: '-c timezone=Asia/Manila',
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  })
  : new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    options: '-c timezone=Asia/Manila',
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export default pool;