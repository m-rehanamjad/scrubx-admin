import type { Metadata } from "next";
import ShippingPage from "@/views/Shipping";
import { shippingService } from "@/server/services/shipping.service";
import { requireStaffContext } from "@/server/auth";
import { toShippingMethodDTO } from "@/lib/dto";
import type { ShippingMethod } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shipping Methods",
  description: "Configure delivery couriers, rates, and estimated transit times across Pakistan.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialMethods: ShippingMethod[] = [];

  try {
    const methods = await shippingService.getShippingMethods({}, admin);
    initialMethods = methods.map(toShippingMethodDTO);
  } catch (err) {
    console.error("[Shipping Page Error]: Failed to fetch shipping methods:", err);
  }

  return <ShippingPage initialMethods={initialMethods} />;
}
