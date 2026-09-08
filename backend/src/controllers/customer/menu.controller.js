import prisma from "../../lib/prisma.js";
import { getProductJsonFields } from "../../lib/productJsonFields.js";

export async function getMenu(req, res, next) {
  try {
    const [menuItems, addons] = await Promise.all([
      prisma.product.findMany({
        where: { productType: "menu_item", status: "available" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          cost: true,
          imageUrl: true,
          stockQuantity: true,
          discountPercent: true,
          category: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.product.findMany({
        where: { productType: "add_on", status: "available" },
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          category: true,
        },
        orderBy: { name: "asc" },
      }),
    ]);
    const addonFieldsById = await getProductJsonFields(addons.map(({ id }) => id));
    const categoryNames = [...new Set(
      menuItems.map(({ category }) => category).filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    const items = menuItems.map((item) => {
      const availableAddons = addons
        .filter((addon) => {
          const applicableIds = addonFieldsById.get(addon.id)?.applicableProductIds || [];
          return !applicableIds.length || applicableIds.includes(item.id);
        })
        .map((addon) => ({
          id: addon.id,
          name: addon.name,
          description: addon.description,
          price: Number(addon.price),
          category: addon.category,
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
