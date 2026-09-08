// src/controllers/admin/staff.controller.js
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { generateStaffToken } from "../../utils/generateToken.js";

const prisma = new PrismaClient();

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    const staff = await prisma.staff.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        status: true,
        canAccessInventory: true,
        canAccessStockIn: true,
        canAccessReports: true,
      },
    });

    if (!staff || staff.status !== "active") {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const matches = await bcrypt.compare(password, staff.password);
    if (!matches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = generateStaffToken(staff.id);
    const { password: _, ...staffWithoutPassword } = staff;

    res.json({ token, staff: staffWithoutPassword });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    res.json({ staff: req.staff });
  } catch (err) {
    next(err);
  }
}

export async function listStaff(req, res, next) {
  try {
    const staff = await prisma.staff.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        canAccessInventory: true,
        canAccessStockIn: true,
        canAccessReports: true,
      },
      orderBy: { createdAt: "desc" },
    });
    res.json({ staff });
  } catch (err) {
    next(err);
  }
}

export async function getStaffById(req, res, next) {
  try {
    const staff = await prisma.staff.findUnique({
      where: { id: parseInt(req.params.id) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        canAccessInventory: true,
        canAccessStockIn: true,
        canAccessReports: true,
      },
    });

    if (!staff) return res.status(404).json({ error: "Staff member not found." });
    res.json({ staff });
  } catch (err) {
    next(err);
  }
}

export async function createStaff(req, res, next) {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "name, email, and password are required." });
    }

    const existing = await prisma.staff.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return res.status(409).json({ error: "A staff account with this email already exists." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const staff = await prisma.staff.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: role || "Cashier",
        status: "active",
        canAccessInventory: false,
        canAccessStockIn: false,
        canAccessReports: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    res.status(201).json({ staff });
  } catch (err) {
    next(err);
  }
}

export async function updateStaff(req, res, next) {
  try {
    const { name, role, status } = req.body;
    const staff = await prisma.staff.update({
      where: { id: parseInt(req.params.id) },
      data: {
        ...(name !== undefined && { name }),
        ...(role !== undefined && { role }),
        ...(status !== undefined && { status }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });
    res.json({ staff });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Staff member not found." });
    next(err);
  }
}

export async function updatePermissions(req, res, next) {
  try {
    const { can_access_inventory, can_access_stock_in, can_access_reports } = req.body;
    const staff = await prisma.staff.update({
      where: { id: parseInt(req.params.id) },
      data: {
        canAccessInventory: !!can_access_inventory,
        canAccessStockIn: !!can_access_stock_in,
        canAccessReports: !!can_access_reports,
      },
      select: {
        id: true,
        canAccessInventory: true,
        canAccessStockIn: true,
        canAccessReports: true,
      },
    });

    res.json({ permissions: staff });
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Staff member not found." });
    next(err);
  }
}

// PUT /api/admin/staff/:id/password — lets a signed-in staff member change
// their own password (settings.html). Verifies the current password before
// writing the new one; only the account's owner (or an Admin) may use it.
export async function changePassword(req, res, next) {
  try {
    const { current_password, new_password } = req.body;
    const { id } = req.params;

    if (req.staff.role !== "Admin" && String(req.staff.id) !== String(id)) {
      return res.status(403).json({ error: "You can only change your own password." });
    }
    if (!current_password || !new_password) {
      return res.status(400).json({ error: "Current and new passwords are required." });
    }
    if (typeof new_password !== "string" || new_password.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters." });
    }

    const staff = await prisma.staff.findUnique({
      where: { id: parseInt(id) },
      select: { password: true },
    });
    if (!staff) return res.status(404).json({ error: "Staff member not found." });

    const matches = await bcrypt.compare(current_password, staff.password);
    if (!matches) {
      return res.status(401).json({ error: "Current password is incorrect." });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    await prisma.staff.update({
      where: { id: parseInt(id) },
      data: { password: hashedPassword },
    });

    res.json({ success: true, message: "Password updated." });
  } catch (err) {
    next(err);
  }
}