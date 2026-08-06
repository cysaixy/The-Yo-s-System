// src/controllers/admin/purchasesController.js
import pool from "../../config/db.js";

export async function list(req, res, next) {
  try {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];

    if (from) { params.push(from); conditions.push(`si.stockin_date::date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`si.stockin_date::date <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT si.id, mi.name AS item_name, s.name AS staff_name, si.quantity,
              si.expiration_date, si.stockin_date, si.remarks
       FROM stock_in si
       JOIN menu_items mi ON mi.id = si.menu_id
       LEFT JOIN staff s ON s.id = si.staff_id
       ${where}
       ORDER BY si.stockin_date DESC`,
      params
    );

    return res.json({ purchases: rows });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  const client = await pool.connect();
  try {
    const { menu_id, quantity, expiration_date, remarks } = req.body || {};

    if (!menu_id || !quantity || quantity <= 0) {
      return res.status(400).json({
        error: "Bad Request",
        message: "menu_id and a positive quantity are required.",
      });
    }

    const staffId = req.staff?.id || null;

    await client.query("BEGIN");

    const { rows: stockInRows } = await client.query(
      `INSERT INTO stock_in (menu_id, staff_id, quantity, expiration_date, remarks)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, menu_id, quantity, expiration_date, stockin_date`,
      [menu_id, staffId, Number(quantity), expiration_date || null, remarks || null]
    );
    const stockIn = stockInRows[0];

    await client.query(
      `UPDATE menu_items SET stock_quantity = stock_quantity + $1 WHERE id = $2`,
      [Number(quantity), menu_id]
    );

    await client.query(
      `INSERT INTO inventory_log (menu_id, staff_id, stock_in_id, transaction_type, quantity_change, remarks)
       VALUES ($1, $2, $3, 'stock_in', $4, $5)`,
      [menu_id, staffId, stockIn.id, Number(quantity), remarks || null]
    );

    await client.query("COMMIT");
    return res.status(201).json(stockIn);
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}