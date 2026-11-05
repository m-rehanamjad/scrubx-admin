import type { Metadata } from "next";
import ShippingPage from "@/views/Shipping";

export const metadata: Metadata = {
  title: "Shipping Methods",
  description:
    "Configure delivery couriers, rates, and estimated transit times across Pakistan.",
};

export default function Page() {
  return <ShippingPage />;
}
