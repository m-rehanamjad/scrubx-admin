import type { Metadata } from "next";
import OrdersPage from "@/views/Orders";
import { orderService } from "@/server/services/order.service";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";
import type { Order } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Orders",
  description: "Manage orders, payment verifications, and order fulfilment across Pakistan.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialOrders: Order[] = [];

  try {
    const ordersResult = await orderService.getOrders(
      {
        page: 1,
        limit: 100,
        sortBy: "placedAt",
        sortOrder: "desc",
      },
      admin
    );

    initialOrders = ordersResult.items.map(toOrderDTO);
  } catch (err) {
    console.error("[Orders Page Error]: Failed to fetch orders:", err);
  }

  return <OrdersPage initialOrders={initialOrders} />;
}
