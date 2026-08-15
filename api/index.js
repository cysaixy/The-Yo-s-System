// api/index.js
//
// Vercel serverless entry point. This does NOT call app.listen() or
// initTables() — a serverless function is invoked per-request, not run as
// a long-lived process, so both of those belong only in backend/server.js
// (your local dev entry point) and never here.
//
// This wraps backend/src/app.js specifically, not backend/server.js —
// src/app.js already does `export default app` with no static-file
// serving or listen() call, which is exactly the shape Vercel needs.
// Static frontend files are served separately via vercel.json rewrites.
import app from "../backend/src/app.js";

export default app;