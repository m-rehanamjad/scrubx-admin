import type { Metadata } from "next";
import CustomerDetailPage from "@/views/CustomerDetail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Customer ${id}`,
    description: "Customer profile, order history, and account activity.",
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <CustomerDetailPage id={id} />;
}
