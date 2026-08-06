// src/middlewares/role.middleware.js
//
// Matches the "STAFF ROLES & PERMISSIONS" legend in your ERD image:
//   - Admin: full access to every module
//   - Cashier: default access to Dashboard / POS / Online Orders / Reservations
//   - Admin can additionally grant a Cashier access to Inventory, Stock In,
//     and Reports via the staff_permissions table.
//
// Usage: router.get('/inventory', requireStaffAuth, requireAdmin, ...)
//        router.get('/inventory', requireStaffAuth, requirePermission('can_access_inventory'), ...)

function requireAdmin(req, res, next) {
  if (!req.staff) return res.status(401).json({ error: "Not authenticated." });
  if (req.staff.role !== "Admin") {
    return res.status(403).json({ error: "This action requires Admin access." });
  }
  next();
}

function requirePermission(permissionKey) {
  return function (req, res, next) {
    if (!req.staff) return res.status(401).json({ error: "Not authenticated." });

    // Admins bypass individual permission flags entirely.
    if (req.staff.role === "Admin") return next();

    if (!req.staff[permissionKey]) {
      return res.status(403).json({
        error: `You don't have access to this. Ask an Admin to grant '${permissionKey}'.`,
      });
    }
    next();
  };
}

export { requireAdmin, requirePermission };
