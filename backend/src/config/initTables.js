// src/config/initTables.js
import pool from "./db.js";

export async function initTables() {
  try {
    // 1. inventory_items
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        sku VARCHAR(100),
        stock_quantity NUMERIC(10,2) NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs',
        unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
        reorder_level NUMERIC(10,2) DEFAULT 5,
        supplier VARCHAR(255),
        status VARCHAR(50) DEFAULT 'in_stock',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. add_ons
    await pool.query(`
      CREATE TABLE IF NOT EXISTS add_ons (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        cost NUMERIC(10,2) DEFAULT 0,
        category VARCHAR(100),
        status VARCHAR(50) DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. addon_inventory
    await pool.query(`
      CREATE TABLE IF NOT EXISTS addon_inventory (
        id SERIAL PRIMARY KEY,
        addon_id INTEGER REFERENCES add_ons(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE CASCADE,
        quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
        unit VARCHAR(50)
      );
    `);

    // 3b. menu_item_inventory (product ingredients)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS menu_item_inventory (
        id SERIAL PRIMARY KEY,
        menu_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
        inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE CASCADE,
        quantity NUMERIC(10,2) NOT NULL DEFAULT 1,
        unit VARCHAR(50)
      );
    `);

    // 4. addon_products
    await pool.query(`
      CREATE TABLE IF NOT EXISTS addon_products (
        id SERIAL PRIMARY KEY,
        addon_id INTEGER REFERENCES add_ons(id) ON DELETE CASCADE,
        menu_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE
      );
    `);

    // 5. bundles
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bundles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        bundle_price NUMERIC(10,2) NOT NULL DEFAULT 0,
        discount_percent NUMERIC(5,2) DEFAULT 0,
        image_url TEXT,
        status VARCHAR(50) DEFAULT 'available',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 6. bundle_products
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bundle_products (
        id SERIAL PRIMARY KEY,
        bundle_id INTEGER REFERENCES bundles(id) ON DELETE CASCADE,
        menu_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL DEFAULT 1
      );
    `);

    // 7. Safe column additions for older databases.
    await pool.query(
      `ALTER TABLE inventory_log ALTER COLUMN quantity_change TYPE NUMERIC(10,2)`
    );
    await pool.query(
      `ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2) NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2) NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS table_time TEXT`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`
    );

    // Delivery-fee tracking columns. delivery_fee_status is NULL for
    // non-delivery orders, 'pending' while the Admin still has to assign a
    // fee, and 'confirmed' once a fee has been set. delivery_fee itself stays
    // 0 until an Admin assigns it — the frontend must never treat that 0 as
    // "free delivery" and instead render the delivery_fee_status.
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_status VARCHAR(20)`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_assigned_by INTEGER REFERENCES staff(id)`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_assigned_at TIMESTAMP`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_barangay TEXT`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_city TEXT`
    );
    await pool.query(
      `ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_landmark TEXT`
    );

    // Backend/database-layer validation for the ₱20.00 – ₱150.00 range.
    // 0 is allowed (no fee on dine-in/pickup, or a delivery order whose fee
    // hasn't been assigned yet); every other value must be inside the range.
    // NOT VALID so legacy rows aren't re-scanned (all current ones are 0).
    await pool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'orders_delivery_fee_range' AND conrelid = 'orders'::regclass
        ) THEN
          ALTER TABLE orders
            ADD CONSTRAINT orders_delivery_fee_range
            CHECK (delivery_fee = 0 OR (delivery_fee >= 20 AND delivery_fee <= 150))
            NOT VALID;
        END IF;
      END
      $$;
    `);

    // 8. order_item_add_ons — snapshots of the add-ons sold on each order
    //    line. name/price/cost are stored at sale time so historical
    //    transactions stay accurate even if an add-on is edited or deleted.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_item_add_ons (
        id SERIAL PRIMARY KEY,
        order_item_id INTEGER REFERENCES order_items(id) ON DELETE CASCADE,
        addon_id INTEGER REFERENCES add_ons(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        price NUMERIC(10,2) NOT NULL DEFAULT 0,
        cost NUMERIC(10,2) NOT NULL DEFAULT 0,
        subtotal NUMERIC(10,2) NOT NULL DEFAULT 0
      );
    `);

    // 9. app_settings — key/value store for dashboard-level settings like
    //    the monthly sales target. Keyed by a plain text key so future
    //    settings (store hours, tax rate, etc.) can be added without a
    //    schema migration.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 10. tables — the room's physical tables and their seating capacity.
    //     Reservations keep a snapshot of the assigned table in
    //     reservations.table_no, but this registry is the source of truth
    //     for capacity checks and double-booking prevention on confirm.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tables (
        id SERIAL PRIMARY KEY,
        table_no VARCHAR(50) NOT NULL UNIQUE,
        capacity INTEGER NOT NULL CHECK (capacity > 0),
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed the floor plan once. Kept INSERT-free afterward so staff can
    // manage tables without the server overwriting their edits.
    const seedCheck = await pool.query(`SELECT COUNT(*)::int AS n FROM tables`);
    if (seedCheck.rows[0].n === 0) {
      await pool.query(`
        INSERT INTO tables (table_no, capacity, status) VALUES
          ('T1', 2, 'active'),
          ('T2', 2, 'active'),
          ('T3', 4, 'active'),
          ('T4', 4, 'active'),
          ('T5', 4, 'active'),
          ('T6', 6, 'active'),
          ('T7', 8, 'active'),
          ('T8', 10, 'active')
      `);
      console.log("Seeded default table registry (T1 - T8).");
    }

    console.log("Database tables initialized successfully.");
  } catch (err) {
    console.error("Error initializing tables:", err.message);
  }
}
