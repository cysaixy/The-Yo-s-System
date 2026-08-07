// src/controllers/customer/auth.controller.js
import pool from "../../config/db.js";

export async function syncCustomerProfile(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized: User context missing." });
    }

    const { firebaseUid, email } = req.user;
    const { name, phone, address } = req.body || {};
    let customer = req.user.customer;

    if (customer) {
      // Existing user: Update details
      const updateQuery = `
        UPDATE customers
        SET name = COALESCE($1, name),
            phone = COALESCE($2, phone),
            address = COALESCE($3, address),
            email = COALESCE($4, email)
        WHERE firebase_uid = $5
        RETURNING id, name, email, phone, address, firebase_uid;
      `;
      const { rows } = await pool.query(updateQuery, [
        name || null,
        phone || null,
        address || null,
        email,
        firebaseUid,
      ]);
      customer = rows[0];
    } else {
      // New user: Insert record
      const insertQuery = `
        INSERT INTO customers (firebase_uid, email, name, phone, address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email, phone, address, firebase_uid;
      `;
      const { rows } = await pool.query(insertQuery, [
        firebaseUid,
        email,
        name || "New Customer",
        phone || null,
        address || null,
      ]);
      customer = rows[0];
    }

    return res.status(200).json({
      message: "Customer profile synced successfully.",
      customer,
    });
  } catch (error) {
    console.error("Sync Profile Error:", error);
    return res.status(500).json({ 
      error: "Internal server error during sync.",
      details: error.message 
    });
  }
}