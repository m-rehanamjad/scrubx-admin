import type { Metadata } from "next";
import ProductFormPage from "@/views/ProductForm";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Edit Product ${id}`,
    description: "Update product listing and variants.",
  };
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <ProductFormPage id={id} />;
}
