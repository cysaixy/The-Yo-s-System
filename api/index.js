// api/index.js
//
// Vercel serverless entry point.
// Ensures database tables and schema migrations (e.g. flavors, cash drawer)
// are initialized on cold start before routing requests to Express.
import app from "../backend/src/app.js";
import { initTables } from "../backend/src/config/initTables.js";

let initPromise = null;
function ensureInit() {
  if (!initPromise) {
    initPromise = initTables().catch((err) => {
      console.error("Vercel initTables error:", err);
      initPromise = null; // allow retry on next request if initialization failed
    });
  }
  return initPromise;
}

export default async function handler(req, res) {
  await ensureInit();
  return app(req, res);
}