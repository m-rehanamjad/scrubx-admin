import type { Metadata } from "next";
import ProductViewPage from "@/views/ProductView";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Product ${id}`,
    description: "Product details and variant configuration.",
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <ProductViewPage id={id} />;
}
