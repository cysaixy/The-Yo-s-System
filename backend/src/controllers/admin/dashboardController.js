import prisma from "../../lib/prisma.js";

const ALL_ORDER_TYPES = ["dine_in", "pickup", "delivery", "takeout", "online"];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
function num(n) {
  return Number(n) || 0;
}

/* ================================================================
   SECTION 1 — Sales overview as of today
   ================================================================ */
export async function summary(req, res, next) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayOrders, bestSellers, stockOverview] = await Promise.all([
      prisma.order.findMany({
        where: {
          datetimeOrdered: { gte: today, lt: tomorrow },
          status: { not: "cancelled" },
        },
        include: {
          orderItems: {
            include: {
              product: true,
              addOns: { include: { product: true } },
            },
          },
          payments: true,
        },
      }),
      prisma.$queryRaw`
        SELECT p.name, SUM(oi.quantity)::int AS qty_sold, SUM(oi.subtotal) AS sales_amount
        FROM "order_items" oi
        JOIN "products" p ON p.id = oi."product_id"
        JOIN "orders" o ON o.id = oi."order_id"
        WHERE o."datetime_ordered"::date = CURRENT_DATE AND o.status <> 'cancelled'
        GROUP BY p.name
        ORDER BY qty_sold DESC
        LIMIT 10
      `,
      prisma.product.findMany({
        where: { productType: "menu_item" },
        select: { id: true, name: true, stockQuantity: true, status: true },
        orderBy: { stockQuantity: "asc" },
      }),
    ]);

    let totalSales = 0;
    let deliveryFees = 0;
    let cogs = 0;

    for (const order of todayOrders) {
      totalSales += Number(order.totalAmount);
      deliveryFees += Number(order.deliveryFee || 0);
      for (const item of order.orderItems) {
        cogs += Number(item.cost) * item.quantity;
        for (const addon of item.addOns) {
          cogs += Number(addon.cost) * addon.quantity;
        }
      }
    }

    const gross = round2(totalSales);
    const cogsRounded = round2(cogs);
    const deliveryFeesRounded = round2(deliveryFees);
    const profit = round2(gross - cogsRounded - deliveryFeesRounded);
    const orderCount = todayOrders.length;

    const bestSellersFormatted = bestSellers.map((b) => ({
      name: b.name,
      qty_sold: Number(b.qty_sold),
      sales_amount: Number(b.sales_amount),
    }));

    const stockOverviewFormatted = stockOverview.map((item) => {
      const stock = item.stockQuantity || 0;
      let stockStatus = "in_stock";
      if (stock <= 0) stockStatus = "out_of_stock";
      else if (stock < 5) stockStatus = "low_stock";
      else if (stock < 15) stockStatus = "below_reorder";
      return { ...item, stockQuantity: stock, stock_status: stockStatus };
    });

    const lowStockCount = stockOverviewFormatted.filter(
      (item) => item.stock_status === "low_stock" || item.stock_status === "out_of_stock"
    ).length;

    res.json({
      todaySales: gross,
      todayOrderCount: orderCount,
      avgOrderValue: orderCount > 0 ? round2(gross / orderCount) : 0,
      grossProfit: profit,
      profitMargin: gross > 0 ? round2((profit / gross) * 100) : 0,
      orderTypesCount: new Set(todayOrders.map((o) => o.orderType)).size,
      bestSellers: bestSellersFormatted,
      lowStockCount,
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 2 — Sales breakdown by order type (+ category) today
   ================================================================ */
export async function salesBreakdown(req, res, next) {
  try {
    const [byOrderTypeRaw, byCategoryRaw] = await Promise.all([
      prisma.$queryRaw`
        SELECT 
          CASE WHEN "order_type" = 'online' AND "fulfillment_details"->>'address' IS NOT NULL
               THEN 'delivery' ELSE "order_type" END AS order_type,
          COUNT(*)::int AS order_count,
          COALESCE(SUM("total_amount"), 0)::numeric AS total_sales
        FROM "orders"
        WHERE "datetime_ordered"::date = CURRENT_DATE AND status <> 'cancelled'
        GROUP BY CASE WHEN "order_type" = 'online' AND "fulfillment_details"->>'address' IS NOT NULL
                      THEN 'delivery' ELSE "order_type" END
      `,
      prisma.$queryRaw`
        SELECT p.category AS category_name, COALESCE(SUM(oi.subtotal), 0)::numeric AS total_sales
        FROM "order_items" oi
        JOIN "products" p ON p.id = oi."product_id"
        JOIN "orders" o ON o.id = oi."order_id"
        WHERE o."datetime_ordered"::date = CURRENT_DATE AND o.status <> 'cancelled'
        GROUP BY p.category
        ORDER BY total_sales DESC
      `,
    ]);

    const present = new Map(byOrderTypeRaw.map((r) => [r.order_type, r]));
    const byOrderType = ALL_ORDER_TYPES.map((type) => ({
      order_type: type,
      order_count: num(present.get(type)?.order_count),
      total_sales: round2(present.get(type)?.total_sales),
    }));

    res.json({
      byOrderType,
      byCategory: byCategoryRaw.map((c) => ({
        category_name: c.category_name || "Uncategorized",
        total_sales: round2(c.total_sales),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 3 — Monthly sales target (+ progress)
   ================================================================ */
export async function monthlyTarget(req, res, next) {
  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const salesAgg = await prisma.order.aggregate({
      where: {
        datetimeOrdered: { gte: startOfMonth },
        status: { not: "cancelled" },
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    const configuredTarget = process.env.MONTHLY_SALES_TARGET;
    const parsedTarget = configuredTarget?.trim() ? Number(configuredTarget) : NaN;
    const target = Number.isFinite(parsedTarget) && parsedTarget >= 0 ? parsedTarget : null;
    const monthSales = round2(salesAgg._sum.totalAmount || 0);
    const meta = {
      month: startOfMonth.toISOString().slice(0, 7),
      days_in_month: new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0).getDate(),
      days_remaining: Math.ceil((new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0) - new Date()) / (1000 * 60 * 60 * 24)),
    };

    res.json({
      month: meta.month,
      month_sales: monthSales,
      month_orders: salesAgg._count,
      target,
      days_in_month: meta.days_in_month,
      days_remaining: meta.days_remaining,
      progress_percent: target ? round2((monthSales / target) * 100) : 0,
    });
  } catch (err) {
    next(err);
  }
}

export async function setMonthlyTarget(req, res) {
  res.status(501).json({
    error: "Monthly sales target is configured through MONTHLY_SALES_TARGET.",
  });
}

/* ================================================================
   SECTION 4 — Top 10 best sellers as of today
   ================================================================ */
export async function bestSellers(req, res, next) {
  try {
    const [rows, totalAgg] = await Promise.all([
      prisma.$queryRaw`
        SELECT p.id, p.name, p.category AS category_name,
               SUM(oi.quantity)::int AS qty_sold,
               SUM(oi.subtotal) AS sales_amount
        FROM "order_items" oi
        JOIN "products" p ON p.id = oi."product_id"
        JOIN "orders" o ON o.id = oi."order_id"
        WHERE o."datetime_ordered"::date = CURRENT_DATE AND o.status <> 'cancelled'
        GROUP BY p.id, p.name, p.category
        ORDER BY qty_sold DESC, sales_amount DESC
        LIMIT 10
      `,
      prisma.$queryRaw`
        SELECT COALESCE(SUM(oi.subtotal), 0) AS total
        FROM "order_items" oi
        JOIN "orders" o ON o.id = oi."order_id"
        WHERE o."datetime_ordered"::date = CURRENT_DATE AND o.status <> 'cancelled'
      `,
    ]);

    const total = round2(Number(totalAgg[0]?.total || 0));
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        category_name: r.category_name || "Uncategorized",
        qty_sold: num(r.qty_sold),
        sales_amount: round2(r.sales_amount),
        share_percent: total > 0 ? round2((num(r.sales_amount) / total) * 100) : 0,
      })),
      total_sales: total,
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 5 — Sales trend, last 15 days (zero-filled)
   ================================================================ */
export async function salesTrend(req, res, next) {
  try {
    const rows = await prisma.$queryRaw`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - 14, CURRENT_DATE, '1 day')::date AS day
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
             COALESCE(SUM(o."total_amount"), 0) AS sales,
             COUNT(o.id)::int AS orders
      FROM days
      LEFT JOIN "orders" o ON o."datetime_ordered"::date = days.day AND o.status <> 'cancelled'
      GROUP BY days.day
      ORDER BY days.day
    `;

    res.json({
      days: rows.map((r) => ({
        date: r.date,
        sales: round2(r.sales),
        orders: num(r.orders),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 6 — Cash overview as of today
   ================================================================ */
export async function cashOverview(req, res, next) {
  try {
    const [balAgg, txAgg, salesAgg] = await Promise.all([
      prisma.cashAccount.aggregate({
        where: { accountType: "cash", status: "active" },
        _sum: { balance: true },
      }),
      prisma.cashTransaction.groupBy({
        by: ["transactionType"],
        where: { transactionDate: { gte: new Date(new Date().setHours(0,0,0,0)) } },
        _sum: { amount: true },
        _count: true,
      }),
      prisma.payment.aggregate({
        where: {
          paymentMethod: "cash",
          status: "paid",
          order: { datetimeOrdered: { gte: new Date(new Date().setHours(0,0,0,0)) } },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const actual = round2(balAgg._sum.balance || 0);
    const cashIn = round2(txAgg.find(t => t.transactionType === "in")?._sum.amount || 0);
    const cashOut = round2(txAgg.find(t => t.transactionType === "out")?._sum.amount || 0);
    const cashSales = round2(salesAgg._sum.amount || 0);
    const txCount = txAgg.reduce((sum, t) => sum + t._count, 0);

    const opening = round2(actual - cashIn + cashOut);
    const expected = round2(opening + cashSales + cashIn - cashOut);
    const variance = round2(actual - expected);

    res.json({
      opening,
      cash_sales: cashSales,
      cash_sale_count: salesAgg._count,
      cash_in: cashIn,
      cash_out: cashOut,
      expected,
      actual,
      variance,
      tx_count: txCount,
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 7 — Cash trend, last 15 days (zero-filled)
   ================================================================ */
export async function cashTrend(req, res, next) {
  try {
    const rows = await prisma.$queryRaw`
      WITH days AS (
        SELECT generate_series(CURRENT_DATE - 14, CURRENT_DATE, '1 day')::date AS day
      ),
      ins AS (
        SELECT "transaction_date"::date AS day, SUM(amount) AS amt
        FROM "cash_transactions" WHERE "transaction_type" = 'in' GROUP BY 1
      ),
      outs AS (
        SELECT "transaction_date"::date AS day, SUM(amount) AS amt
        FROM "cash_transactions" WHERE "transaction_type" = 'out' GROUP BY 1
      ),
      cash_sales AS (
        SELECT o."datetime_ordered"::date AS day, SUM(p.amount) AS amt
        FROM "payments" p
        JOIN "orders" o ON o.id = p."order_id"
        WHERE p."payment_method" = 'cash' AND p.status = 'paid'
        GROUP BY 1
      )
      SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
             COALESCE(ins.amt, 0) AS cash_in,
             COALESCE(outs.amt, 0) AS cash_out,
             COALESCE(cash_sales.amt, 0) AS cash_sales
      FROM days
      LEFT JOIN ins ON ins.day = days.day
      LEFT JOIN outs ON outs.day = days.day
      LEFT JOIN cash_sales ON cash_sales.day = days.day
      ORDER BY days.day
    `;

    res.json({
      days: rows.map((r) => ({
        date: r.date,
        cash_in: round2(r.cash_in),
        cash_out: round2(r.cash_out),
        cash_sales: round2(r.cash_sales),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 8 — Inventory overview (raw stock counts)
   ================================================================ */
export async function inventoryOverview(req, res, next) {
  try {
    const items = await prisma.inventory.findMany({
      where: { itemType: "raw_material" },
      select: { stockQuantity: true, reorderLevel: true },
    });

    let total = 0, outOfStock = 0, belowReorder = 0, lowStock = 0, inStock = 0;
    for (const item of items) {
      total++;
      const qty = Number(item.stockQuantity);
      const reorder = Number(item.reorderLevel || 0);
      if (qty <= 0) outOfStock++;
      else if (qty <= reorder) belowReorder++;
      else if (qty <= reorder * 1.5) lowStock++;
      else inStock++;
    }

    res.json({
      total_items: total,
      in_stock: inStock,
      below_reorder: belowReorder,
      low_stock: lowStock,
      out_of_stock: outOfStock,
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 9 — Inventory usage as of today
   ================================================================ */
export async function inventoryUsage(req, res, next) {
  try {
    const [productsRaw, ingredientsRaw] = await Promise.all([
      prisma.$queryRaw`
        SELECT p.name AS description, 'pcs' AS unit,
               p."stock_quantity" AS closing_stock,
               SUM(oi.quantity)::numeric AS used_qty
        FROM "order_items" oi
        JOIN "orders" o ON o.id = oi."order_id"
        JOIN "products" p ON p.id = oi."product_id"
        WHERE o."datetime_ordered"::date = CURRENT_DATE AND o.status <> 'cancelled'
        GROUP BY p.id, p.name, p."stock_quantity"
        ORDER BY used_qty DESC
      `,
      prisma.$queryRaw`
        SELECT i.name AS description, i.unit AS unit,
               i."stock_quantity" AS closing_stock,
               SUM(ABS(it."quantity_change"))::numeric AS used_qty
        FROM "inventory_transactions" it
        JOIN "inventory" i ON i.id = it."inventory_id"
        WHERE it."transaction_date"::date = CURRENT_DATE
          AND it."transaction_type" = 'sale'
          AND it."quantity_change" < 0
        GROUP BY i.id, i.name, i.unit, i."stock_quantity"
        ORDER BY used_qty DESC
      `,
    ]);

    const items = [...productsRaw, ...ingredientsRaw].map((r) => {
      const used = num(r.used_qty);
      const closing = num(r.closing_stock);
      const opening = closing + used;
      return {
        description: r.description,
        unit: r.unit || "pcs",
        opening_qty: opening,
        closing_qty: closing,
        used_qty: used,
        usage_percent: opening > 0 ? round2((used / opening) * 100) : null,
      };
    });

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 10 — Inventory status
   ================================================================ */
export async function inventoryStatus(req, res, next) {
  try {
    const items = await prisma.inventory.findMany({
      where: { itemType: "raw_material" },
      orderBy: [{ stockQuantity: "asc" }, { name: "asc" }],
    });

    res.json({
      items: items.map((r) => {
        const qty = Number(r.stockQuantity);
        const reorder = Number(r.reorderLevel || 0);
        let stockStatus = "in_stock";
        if (qty <= 0) stockStatus = "out_of_stock";
        else if (qty <= reorder) stockStatus = "below_reorder";
        else if (qty <= reorder * 1.5) stockStatus = "low_stock";

        return {
          id: r.id,
          name: r.name,
          category: r.category || "Uncategorized",
          sku: r.sku,
          quantity: qty,
          unit: r.unit || "pcs",
          stock_status: stockStatus,
          reorder_level: reorder,
          supplier: r.supplier || null,
          notes: r.notes || null,
          days_of_stock: null,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 11 — Live Order Rail (Home screen active orders feed)
   ================================================================ */
export async function orderRail(req, res, next) {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const orders = await prisma.order.findMany({
      where: {
        datetimeOrdered: { gte: yesterday },
        status: { not: "cancelled" },
      },
      include: {
        customer: true,
        staff: true,
        orderItems: {
          include: {
            product: true,
            addOns: { include: { product: true } },
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { datetimeOrdered: "desc" },
      ],
      take: 40,
    });

    const statusOrder = { pending: 1, confirmed: 2, preparing: 3, ready: 4, completed: 5 };
    const sorted = orders.sort((a, b) => (statusOrder[a.status] || 6) - (statusOrder[b.status] || 6));

    res.json({
      orders: sorted.map((o) => ({
        id: o.id,
        order_type: o.orderType,
        status: o.status,
        total_amount: Number(o.totalAmount),
        delivery_fee: Number(o.deliveryFee || 0),
        datetime_ordered: o.datetimeOrdered,
        notes: o.notes,
        customer_name: o.customer.name,
        customer_phone: o.customer.phone,
        staff_name: o.staff?.name,
        source: o.staffId ? "pos" : "online",
        items: o.orderItems.map((item) => ({
          item_name: item.product.name,
          quantity: item.quantity,
          price: Number(item.price),
          notes: item.notes,
          add_ons: item.addOns.map((a) => ({ name: a.product.name, quantity: a.quantity })),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/* ================================================================
   SECTION 12 — Recent Staff Activity Feed
   ================================================================ */
export async function staffActivity(req, res, next) {
  try {
    const [orderActivities, inventoryActivities, cashActivities] = await Promise.all([
      prisma.order.findMany({
        where: { staffId: { not: null } },
        include: { staff: true },
        orderBy: { datetimeOrdered: "desc" },
        take: 25,
      }),
      prisma.inventoryTransaction.findMany({
        include: { staff: true, inventory: true },
        orderBy: { transactionDate: "desc" },
        take: 25,
      }),
      prisma.cashTransaction.findMany({
        where: { staffId: { not: null } },
        include: { staff: true, cashAccount: true },
        orderBy: { transactionDate: "desc" },
        take: 25,
      }),
    ]);

    const combined = [
      ...orderActivities.map((o) => ({
        activity_time: o.datetimeOrdered,
        activity_type: "order",
        staff_name: o.staff?.name,
        staff_role: o.staff?.role,
        description: `Processed POS order #${o.id} (${o.orderType.replace("_", " ").toUpperCase()}) - ₱${Number(o.totalAmount).toFixed(2)}`,
        reference_id: String(o.id),
        status_badge: o.status,
      })),
      ...inventoryActivities.map((i) => ({
        activity_time: i.transactionDate,
        activity_type: "inventory",
        staff_name: i.staff?.name,
        staff_role: i.staff?.role,
        description: (() => {
          let prefix = "Inventory Adjustment: ";
          if (i.transactionType === "stock_in") prefix = "Stock In: +";
          else if (i.transactionType === "waste") prefix = "Recorded Waste: ";
          return `${prefix}${i.quantityChange} units of ${i.inventory.name}${i.remarks ? ` (${i.remarks})` : ""}`;
        })(),
        reference_id: String(i.id),
        status_badge: i.transactionType,
      })),
      ...cashActivities.map((c) => ({
        activity_time: c.transactionDate,
        activity_type: "cash",
        staff_name: c.staff?.name,
        staff_role: c.staff?.role,
        description: (() => {
          const prefix = c.transactionType === "in" ? "Cash In (+₱" : "Cash Out (-₱";
          return `${prefix}${Number(c.amount).toFixed(2)}) for ${c.category || "General"} - ${c.cashAccount.name}${c.description ? ` (${c.description})` : ""}`;
        })(),
        reference_id: String(c.id),
        status_badge: c.transactionType,
      })),
    ];

    combined.sort((a, b) => new Date(b.activity_time) - new Date(a.activity_time));

    res.json({ activities: combined.slice(0, 25) });
  } catch (err) {
    next(err);
  }
}