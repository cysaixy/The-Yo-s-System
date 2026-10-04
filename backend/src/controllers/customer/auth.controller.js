// src/controllers/customer/auth.controller.js
import pool from '../../config/db.js';
import { getFirebaseAuth } from '../../config/firebase.js';

// Returns the currently authenticated customer profile. Called on page load
// so the frontend can prefill forms and hide/show account-gated sections.
export async function getMe(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User context missing.' });
    }

    if (req.user.customer) {
      const { rows } = await pool.query(
        `SELECT id, name, email, phone, address, firebase_uid
         FROM customers WHERE id = $1`,
        [req.user.customer.id]
      );
      if (rows[0]) {
        return res.json({ customer: rows[0] });
      }
    }

    return res.json({ customer: null });
  } catch (error) {
    console.error('getMe error:', error);
    return res.status(500).json({ error: 'Couldn\'t load profile.' });
  }
}

export async function syncCustomerProfile(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: User context missing.' });
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
      // New user: Insert record.
      // Phone is required from this point on - it must not be possible to
      // create a customer row with phone = NULL, regardless of which auth
      // path (email/password, Google, etc.) got them here. The frontend
      // gate in account.html normally supplies this before this branch is
      // ever hit; this check exists so the rule holds even if that gate is
      // bypassed or a future auth path forgets to collect it.
      if (!phone || !String(phone).trim()) {
        return res.status(400).json({
          error: 'A mobile number is required to create your account.',
          code: 'PHONE_REQUIRED',
        });
      }

      const insertQuery = `
        INSERT INTO customers (firebase_uid, email, name, phone, address)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, name, email, phone, address, firebase_uid;
      `;
      const { rows } = await pool.query(insertQuery, [
        firebaseUid,
        email,
        name || 'New Customer',
        phone || null,
        address || null,
      ]);
      customer = rows[0];
    }

    return res.status(200).json({
      message: 'Customer profile synced successfully.',
      customer,
    });
  } catch (error) {
    console.error('Sync Profile Error:', error);
    return res.status(500).json({
      error: 'Internal server error during sync.',
      details: error.message
    });
  }
}

// --- PASSWORD UPDATE ---
export async function updatePassword(req, res) {
  try {
    if (!req.user || !req.user.firebaseUid) {
      return res.status(401).json({ error: 'Unauthorized: User context missing.' });
    }

    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    await getFirebaseAuth().updateUser(req.user.firebaseUid, { password: newPassword });

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('updatePassword error:', error);
    return res.status(500).json({ error: 'Couldn\'t update password. Please try again.' });
  }
}