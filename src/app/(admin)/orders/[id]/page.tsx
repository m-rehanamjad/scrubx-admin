import type { Metadata } from "next";
import OrderDetailPage from "@/views/OrderDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Order ${id}`,
    description: "Order fulfilment and payment proof details.",
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <OrderDetailPage id={id} />;
}
