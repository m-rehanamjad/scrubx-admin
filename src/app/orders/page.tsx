import type { Metadata } from "next";
import OrdersPage from "@/views/Orders";

export const metadata: Metadata = {
  title: "Orders",
  description: "Manage orders, payment verifications, and order fulfilment across Pakistan.",
};

export default function Page() {
  return <OrdersPage />;
}
