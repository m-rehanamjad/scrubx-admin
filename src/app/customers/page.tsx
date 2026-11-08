import type { Metadata } from "next";
import CustomersPage from "@/views/Customers";
import { customerService } from "@/server/services/customer.service";
import { requireStaffContext } from "@/server/auth";
import { toCustomerDTO } from "@/lib/dto";
import type { Customer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Customers",
  description: "View customer profiles, order histories, and lifetime spend across Pakistan.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialCustomers: Customer[] = [];
  const initialCustomerStats: Record<string, { orders: number; spend: number }> = {};
  let registeredCount = 0;
  let totalSpend = 0;
  let guestCount = 0;

  try {
    const customersResult = await customerService.getCustomers(
      {
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      },
      admin
    );

    initialCustomers = customersResult.items.map(toCustomerDTO);
    customersResult.items.forEach((c) => {
      initialCustomerStats[c.id] = {
        orders: c.ordersCount,
        spend: c.totalSpend,
      };
      if (c.isRegistered) registeredCount += 1;
      totalSpend += c.totalSpend;
    });

    guestCount = customersResult.items.length - registeredCount;
  } catch (err) {
    console.error("[Customers Page Error]: Failed to fetch customers:", err);
  }

  return (
    <CustomersPage
      initialCustomers={initialCustomers}
      initialCustomerStats={initialCustomerStats}
      initialRegisteredCount={registeredCount}
      initialGuestCount={guestCount}
      initialLifetimeValue={totalSpend}
    />
  );
}
