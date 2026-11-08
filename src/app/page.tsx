import type { Metadata } from "next";
import Dashboard from "@/views/Dashboard";
import { orderService } from "@/server/services/order.service";
import { inventoryService } from "@/server/services/inventory.service";
import { db } from "@/db";
import { products } from "@/db/schema/catalog";
import { eq, isNull, and, count } from "drizzle-orm";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Live performance across orders, revenue and inventory for ScrubX Pakistan.",
};

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Page({ searchParams }: PageProps) {
  const query = await searchParams;
  const period = typeof query?.period === "string" ? (query.period as "7d" | "30d" | "90d" | "12m") : "30d";

  let serializedOrders: Order[] = [];
  let initialMetrics: {
    totalRevenue: number;
    totalOrders: number;
    pendingOrders: number;
    totalProducts: number;
    activeProducts: number;
    totalUnits: number;
    previousPeriodChange: number;
  } | undefined = undefined;
  let lowStockItems: Array<{
    product: { id: string; name: string };
    variant: { id: string; name: string; sku: string; stock: number; reorderLevel: number; price: number };
  }> = [];

  const admin = await requireStaffContext();

  try {
    // 1. Fetch recent orders & metrics
    const ordersResult = await orderService.getOrders(
      {
        page: 1,
        limit: 100,
        sortBy: "placedAt",
        sortOrder: "desc",
      },
      admin
    );

    // 2. Fetch order metrics
    const orderMetrics = await orderService.getOrderMetrics(admin);

    // 3. Fetch inventory summary metrics & low stock items
    const inventorySummary = await inventoryService.getInventorySummary(admin);
    const lowStockItemsResult = await inventoryService.getInventory(
      {
        status: "low",
        limit: 6,
      },
      admin
    );

    // 4. Aggregate product counts
    const [totalProductsRow] = await db
      .select({ count: count() })
      .from(products)
      .where(isNull(products.deletedAt));

    const [activeProductsRow] = await db
      .select({ count: count() })
      .from(products)
      .where(and(eq(products.status, "active"), isNull(products.deletedAt)));

    serializedOrders = ordersResult.items.map(toOrderDTO);

    lowStockItems = lowStockItemsResult.items.map((item) => ({
      product: {
        id: item.product.id,
        name: item.product.name,
      },
      variant: {
        id: item.variant.id,
        name: item.variant.name,
        sku: item.variant.sku,
        stock: item.quantityOnHand,
        reorderLevel: item.reorderLevel,
        price: item.variant.price,
      },
    }));

    initialMetrics = {
      totalRevenue: orderMetrics.totalRevenue,
      totalOrders: orderMetrics.totalOrders,
      pendingOrders: orderMetrics.awaitingPaymentCount + orderMetrics.paymentSubmittedCount,
      totalProducts: totalProductsRow?.count ?? 0,
      activeProducts: activeProductsRow?.count ?? 0,
      totalUnits: inventorySummary.totalUnitsInStock,
      previousPeriodChange: 0,
    };
  } catch (err) {
    console.error("[Dashboard Page Error]: Failed to fetch dashboard data:", err);
  }

  return (
    <Dashboard
      initialOrders={serializedOrders}
      initialPeriod={period}
      initialMetrics={initialMetrics}
      lowStockItems={lowStockItems}
    />
  );
}
