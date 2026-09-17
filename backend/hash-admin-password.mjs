// hash-admin-password.mjs
// Run locally with:
//   node hash-admin-password.mjs "YourChosenPassword" "admin@theyos.com" "Admin Name"
//
// Then copy and run the printed SQL in your hosted PostgreSQL database (Neon / Supabase SQL Editor).
// Or pass --apply to run it directly against the database configured in your environment:
//   node hash-admin-password.mjs "YourChosenPassword" "admin@theyos.com" "Admin Name" --apply

import bcrypt from "bcrypt";
import dotenv from "dotenv";
dotenv.config();

const args = process.argv.slice(2);
const shouldApply = args.includes('--apply');
const filteredArgs = args.filter(a => a !== '--apply');

const [password, email = 'admin@theyos.com', name = 'Admin'] = filteredArgs;

if (!password) {
  console.error('Usage: node hash-admin-password.mjs "YourPassword" [email] [name] [--apply]');
  console.error('Example: node hash-admin-password.mjs "admin123" "admin@theyos.com" "The Yos Admin"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
const cleanEmail = email.trim().toLowerCase();
const cleanName = name.trim();

const sql = `
-- 1. Insert or update the staff account
INSERT INTO staff (name, email, password, role, status, created_at)
VALUES (
  '${cleanName.replace(/'/g, "''")}',
  '${cleanEmail.replace(/'/g, "''")}',
  '${hash}',
  'Admin',
  'active',
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  password = EXCLUDED.password,
  role = 'Admin',
  status = 'active'
RETURNING id, name, email, role, status;

-- 2. Insert or update staff permissions with all access enabled
INSERT INTO staff_permissions (staff_id, can_access_inventory, can_access_stock_in, can_access_reports, updated_at)
VALUES (
  (SELECT id FROM staff WHERE LOWER(email) = '${cleanEmail.replace(/'/g, "''")}'),
  true,
  true,
  true,
  NOW()
)
ON CONFLICT (staff_id) DO UPDATE SET
  can_access_inventory = true,
  can_access_stock_in = true,
  can_access_reports = true,
  updated_at = NOW();
`;

console.log("=================================================");
console.log(" Generated SQL for Admin Account:");
console.log("=================================================");
console.log(sql);
console.log("=================================================");

if (shouldApply) {
  try {
    const { default: pool } = await import("./src/config/db.js");
    console.log("\nApplying directly to database...");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `INSERT INTO staff (name, email, password, role, status, created_at)
         VALUES ($1, $2, $3, 'Admin', 'active', NOW())
         ON CONFLICT (email) DO UPDATE SET
           name = EXCLUDED.name,
           password = EXCLUDED.password,
           role = 'Admin',
           status = 'active'
         RETURNING id, name, email, role, status`,
        [cleanName, cleanEmail, hash]
      );
      const staffId = res.rows[0].id;
      await client.query(
        `INSERT INTO staff_permissions (staff_id, can_access_inventory, can_access_stock_in, can_access_reports, updated_at)
         VALUES ($1, true, true, true, NOW())
         ON CONFLICT (staff_id) DO UPDATE SET
           can_access_inventory = true,
           can_access_stock_in = true,
           can_access_reports = true,
           updated_at = NOW()`,
        [staffId]
      );
      await client.query("COMMIT");
      console.log(`\x1b[32mSuccessfully created/updated admin account for ${cleanEmail} (ID: ${staffId})\x1b[0m`);
    } catch (dbErr) {
      await client.query("ROLLBACK");
      throw dbErr;
    } finally {
      client.release();
      await pool.end();
    }
  } catch (err) {
    console.error("\x1b[31mFailed to apply to database:\x1b[0m", err.message);
    process.exit(1);
  }
}