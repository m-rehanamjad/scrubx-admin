import type { Metadata } from "next";
import { notFound } from "next/navigation";
import OrderDetailPage from "@/views/OrderDetail";
import { orderService } from "@/server/services/order.service";
import { requireStaffContext } from "@/server/auth";
import { toOrderDTO } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const admin = await requireStaffContext();
    const order = await orderService.getOrderById(id, admin);
    return {
      title: `${order.orderNumber} | ScrubX Orders`,
      description: `Fulfilment and status for order ${order.orderNumber}.`,
    };
  } catch {
    return {
      title: "Order Details | ScrubX",
      description: "Order fulfilment and payment proof details.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireStaffContext();

  let initialOrder;

  try {
    const orderBundle = await orderService.getOrderById(id, admin);
    initialOrder = toOrderDTO(orderBundle);
  } catch (err) {
    console.error(`[Order Page Error]: Failed to fetch order ${id}:`, err);
    notFound();
  }

  return <OrderDetailPage id={id} initialOrder={initialOrder} />;
}
