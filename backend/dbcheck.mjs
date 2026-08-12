import pg from "pg";
const { Client } = pg;
const c = new Client({ user: "postgres", password: "cyrus123", host: "localhost", port: 5432, database: "theyosdb" });
await c.connect();
const tables = ["menu_items", "orders", "order_items", "payments", "customers", "add_ons", "addon_inventory", "addon_products", "bundles", "bundle_products", "categories", "inventory_log"];
for (const t of tables) {
  const { rows } = await c.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`,
    [t]
  );
  console.log("=== " + t + " ===");
  console.log(rows.map(r => `${r.column_name} ${r.data_type}${r.is_nullable === "NO" ? " NOT NULL" : ""}${r.column_default ? " DEFAULT " + r.column_default : ""}`).join("\n"));
  console.log("");
}
await c.end();
