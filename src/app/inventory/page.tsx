import type { Metadata } from "next";
import InventoryPage from "@/views/Inventory";
import { inventoryService } from "@/server/services/inventory.service";
import { requireStaffContext } from "@/server/auth";
import { serializeDate } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Track variant stock levels, low-stock warnings, and historical movements.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialRows: any[] = [];
  let initialMovements: any[] = [];
  let initialTotals = {
    units: 0,
    value: 0,
    low: 0,
    out: 0,
    reserved: 0,
    skus: 0,
  };

  try {
    const [inventoryResult, summary, movementsResult] = await Promise.all([
      inventoryService.getInventory({ limit: 100 }, admin),
      inventoryService.getInventorySummary(admin),
      inventoryService.getMovements({ limit: 50 }, admin),
    ]);

    initialRows = inventoryResult.items.map((item) => ({
      product: {
        id: item.product.id,
        name: item.product.name,
        slug: item.product.slug,
        description: "",
        categoryId: "",
        brand: "ScrubX",
        gender: "unisex" as const,
        material: "",
        status: (item.product.status as any) || "active",
        engraveable: false,
        featured: false,
        colors: [],
        images: [],
        variants: [],
        createdAt: serializeDate(item.updatedAt),
        updatedAt: serializeDate(item.updatedAt),
      },
      variant: {
        id: item.variant.id,
        colorId: item.color?.name || "",
        colorName: item.color?.name || "Standard",
        colorHex: item.color?.hexCode || "#000000",
        size: item.variant.size || "OS",
        name: item.variant.name,
        sku: item.variant.sku,
        price: Number(item.variant.price),
        compareAtPrice: item.variant.compareAtPrice ? Number(item.variant.compareAtPrice) : null,
        stock: item.quantityOnHand,
        reserved: item.quantityReserved,
        reorderLevel: item.reorderLevel,
        active: item.variant.isActive,
      },
    }));

    initialMovements = movementsResult.items.map((m) => ({
      id: m.id,
      productId: m.product.id,
      productName: m.product.name,
      variantId: m.variantId,
      variantName: m.variant.name,
      sku: m.variant.sku,
      type: m.reason as "restock" | "sale" | "cancellation" | "adjustment" | "return",
      quantity: m.change,
      reason: m.reason === "restock" ? "Restock from supplier" : m.reason === "sale" ? "Order sale" : m.reason,
      note: m.order?.orderNumber ? `Order #${m.order.orderNumber}` : undefined,
      at: serializeDate(m.createdAt),
      by: m.createdByUser?.name || "System",
    }));

    initialTotals = {
      units: summary.totalUnitsInStock,
      value: summary.totalStockValue,
      low: summary.lowStockCount,
      out: summary.outOfStockCount,
      reserved: summary.totalReservedUnits,
      skus: summary.totalSkus,
    };
  } catch (err) {
    console.error("[Inventory Page Error]: Failed to fetch inventory data:", err);
  }

  return (
    <InventoryPage
      initialRows={initialRows}
      initialMovements={initialMovements}
      initialTotals={initialTotals}
    />
  );
}
