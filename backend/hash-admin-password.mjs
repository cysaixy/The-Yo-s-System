// hash-admin-password.mjs
// Run locally with: node hash-admin-password.mjs "YourChosenPassword" "you@example.com" "Your Name"
// Then copy the printed SQL and run it against your HOSTED Postgres
// (e.g. via Neon's SQL editor, or `psql` with the hosted connection string) —
// not your local database, since that's not what Vercel reads from.

import bcrypt from "bcrypt";

const [, , password, email, name] = process.argv;

if (!password || !email || !name) {
  console.error('Usage: node hash-admin-password.mjs "YourPassword" "you@example.com" "Your Name"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

console.log("\nRun this against your HOSTED database:\n");
console.log(`INSERT INTO staff (name, email, password, role, status, created_at)
VALUES ('${name.replace(/'/g, "''")}', '${email.replace(/'/g, "''")}', '${hash}', 'Admin', 'active', NOW())
RETURNING id, name, email, role;

-- Give the new staff row permission entries too (staffController expects one):
INSERT INTO staff_permissions (staff_id)
VALUES ((SELECT id FROM staff WHERE email = '${email.replace(/'/g, "''")}'));
`);