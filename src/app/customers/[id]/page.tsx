import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CustomerDetailPage from "@/views/CustomerDetail";
import { customerService } from "@/server/services/customer.service";
import { orderService } from "@/server/services/order.service";
import { requireStaffContext } from "@/server/auth";
import { toCustomerDTO, toOrderDTO } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const admin = await requireStaffContext();
    const customer = await customerService.getCustomerById(id, admin);
    const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || "Customer";
    return {
      title: `${name} | ScrubX Customers`,
      description: `Customer profile and order history for ${name}.`,
    };
  } catch {
    return {
      title: "Customer Details | ScrubX",
      description: "Customer profile and order history.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireStaffContext();

  let initialCustomer;
  let initialOrders: any[] = [];

  try {
    const [customerBundle, ordersResult] = await Promise.all([
      customerService.getCustomerById(id, admin),
      orderService.getOrders(
        {
          page: 1,
          limit: 50,
          sortBy: "placedAt",
          sortOrder: "desc",
          customerId: id,
        },
        admin
      ),
    ]);

    initialCustomer = toCustomerDTO(customerBundle);
    initialOrders = ordersResult.items.map(toOrderDTO);
  } catch (err) {
    console.error(`[Customer Page Error]: Failed to fetch customer ${id}:`, err);
    notFound();
  }

  return (
    <CustomerDetailPage
      id={id}
      initialCustomer={initialCustomer}
      initialOrders={initialOrders}
    />
  );
}
