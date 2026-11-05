import type { Metadata } from "next";
import InventoryPage from "@/views/Inventory";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Track variant stock levels, low-stock warnings, and historical movements.",
};

export default function Page() {
  return <InventoryPage />;
}
