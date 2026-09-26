// Migration: add flavors column to menu_items
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('pg');
const dotenv = require('dotenv');
dotenv.config();
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  await pool.query("ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS flavors TEXT[] NOT NULL DEFAULT '{}'");
  console.log('Migration OK: flavors column added to menu_items');
} catch(e) {
  console.error('FAILED:', e.message);
  process.exit(1);
} finally {
  await pool.end();
}
