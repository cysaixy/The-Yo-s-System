// src/config/initTables.js
import pool from './db.js';

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

    // Loss reports are kept separately from the movement log for accountability.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inventory_incidents (
        id SERIAL PRIMARY KEY,
        inventory_id INTEGER NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
        staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        incident_type VARCHAR(20) NOT NULL CHECK (incident_type IN ('spoilage', 'theft')),
        quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
        occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description TEXT NOT NULL,
        location VARCHAR(150),
        reference_number VARCHAR(100),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS inventory_incidents_occurred_at_idx ON inventory_incidents(occurred_at DESC)');

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
      'ALTER TABLE inventory_log ALTER COLUMN quantity_change TYPE NUMERIC(10,2)'
    );
    await pool.query(
      'ALTER TABLE inventory_log ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL'
    );
    await pool.query(
      'ALTER TABLE inventory_log ALTER COLUMN menu_id DROP NOT NULL'
    );
    await pool.query(
      'ALTER TABLE inventory_log ALTER COLUMN staff_id DROP NOT NULL'
    );
    await pool.query(
      'ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2) NOT NULL DEFAULT 0'
    );
    await pool.query(
      'ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost NUMERIC(10,2) NOT NULL DEFAULT 0'
    );
    await pool.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2) NOT NULL DEFAULT 0'
    );
    await pool.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_address TEXT'
    );
    await pool.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_name TEXT'
    );
    await pool.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone TEXT'
    );
    await pool.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)'
    );

    // Delivery-fee status column: 'pending' while Admin assigns fee, 'confirmed' once fee is set.
    await pool.query(
      'ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee_status VARCHAR(20)'
    );

    // Clean up dropped/redundant columns
    await pool.query('ALTER TABLE orders DROP COLUMN IF EXISTS table_time');
    await pool.query('ALTER TABLE orders DROP COLUMN IF EXISTS delivery_fee_assigned_by');
    await pool.query('ALTER TABLE orders DROP COLUMN IF EXISTS delivery_fee_assigned_at');
    await pool.query('ALTER TABLE orders DROP COLUMN IF EXISTS delivery_barangay');
    await pool.query('ALTER TABLE orders DROP COLUMN IF EXISTS delivery_city');
    await pool.query('ALTER TABLE orders DROP COLUMN IF EXISTS delivery_landmark');

    // Delivery fees are set by staff in the POS and may be any non-negative
    // amount. Keep the database rule aligned with the POS input (which allows
    // values such as ₱10.00), rather than rejecting valid orders at checkout.
    await pool.query(`
      DO $$
      BEGIN
        ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_fee_range;
        ALTER TABLE orders
          ADD CONSTRAINT orders_delivery_fee_range
          CHECK (delivery_fee >= 0) NOT VALID;
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

    // 10. Cash accounts drawer flag and daily reconciliations
    await pool.query('ALTER TABLE cash_accounts ADD COLUMN IF NOT EXISTS is_default_drawer BOOLEAN NOT NULL DEFAULT FALSE;');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS cash_accounts_single_default_drawer_idx ON cash_accounts (is_default_drawer) WHERE (is_default_drawer = TRUE);');
    await pool.query('ALTER TABLE cash_transactions ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;');
    await pool.query('CREATE INDEX IF NOT EXISTS cash_transactions_order_id_idx ON cash_transactions(order_id);');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_reconciliations (
        id SERIAL PRIMARY KEY,
        cash_account_id INTEGER NOT NULL REFERENCES cash_accounts(id) ON DELETE CASCADE,
        reconciliation_date DATE NOT NULL,
        opening_balance NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
        counted_closing_balance NUMERIC(10, 2),
        closed_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
        closed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT daily_reconciliations_account_date_uq UNIQUE (cash_account_id, reconciliation_date)
      );
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS daily_reconciliations_date_idx ON daily_reconciliations(reconciliation_date);');

    // Ensure a default cash drawer account exists if none has been designated
    const existingDrawer = await pool.query('SELECT id FROM cash_accounts WHERE is_default_drawer = TRUE');
    if (existingDrawer.rows.length === 0) {
      await pool.query(`
        INSERT INTO cash_accounts (name, account_type, balance, status, is_default_drawer)
        VALUES ('Cash Drawer', 'cash', 0.00, 'active', TRUE)
      `);
    }

    // 11. Menu item flavors and tracking mode
    await pool.query("ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS flavors TEXT[] NOT NULL DEFAULT '{}';");
    await pool.query("ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS tracking_mode VARCHAR(10) NOT NULL DEFAULT 'direct';");
    await pool.query('ALTER TABLE stock_in ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventory_items(id) ON DELETE SET NULL;');
    await pool.query('ALTER TABLE stock_in ALTER COLUMN menu_id DROP NOT NULL;');

    // Drop legacy tables table — table numbers are now free-form text
    // assigned directly by staff on reservation confirm / walk-in.
    await pool.query('DROP TABLE IF EXISTS tables CASCADE;');

    console.log('Database tables initialized successfully.');
  } catch (err) {
    console.error('Error initializing tables:', err.message);
  }
}
