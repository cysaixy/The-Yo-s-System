import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getMenu(req, res, next) {
  try {
    const [categories, menuItems, addons] = await Promise.all([
      prisma.product.findMany({
        where: { productType: "menu_item", status: "available" },
        select: { category: true },
        distinct: ["category"],
        orderBy: { category: "asc" },
      }),
      prisma.product.findMany({
        where: { productType: "menu_item", status: "available" },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { productType: "add_on", status: "available" },
        orderBy: { name: "asc" },
      }),
    ]);

    const categoryNames = categories.map((c) => c.category).filter(Boolean);

    const addonMap = new Map(addons.map((a) => [a.id, a]));

    const items = menuItems.map((item) => {
      const linkedAddonIds = item.components
        ? item.components
            .filter((c) => c.productType === "add_on")
            .map((c) => c.productId)
        : [];

      const availableAddons = addons
        .filter((a) => !linkedAddonIds.length || linkedAddonIds.includes(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          description: a.description,
          price: Number(a.price),
          category: a.category,
        }));

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        price: Number(item.price),
        cost: Number(item.cost || 0),
        imageUrl: item.imageUrl,
        stockQuantity: item.stockQuantity,
        discountPercent: item.discountPercent ? Number(item.discountPercent) : null,
        category: item.category,
        add_ons: availableAddons,
      };
    });

    res.json({
      categories: categoryNames,
      items,
    });
  } catch (err) {
    next(err);
  }
}