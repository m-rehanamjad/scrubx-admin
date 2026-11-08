import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductFormPage from "@/views/ProductForm";
import { productService } from "@/server/services/product.service";
import { categoryService } from "@/server/services/category.service";
import { requireStaffContext } from "@/server/auth";
import { toProductBundleDTO, toCategoryDTO } from "@/lib/dto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const admin = await requireStaffContext();
    const product = await productService.getProductById(id, admin);
    return {
      title: `Edit ${product.name} | ScrubX`,
      description: "Update product listing and variants.",
    };
  } catch {
    return {
      title: "Edit Product | ScrubX",
      description: "Update product listing and variants.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireStaffContext();

  let initialProduct;
  let initialCategories: any[] = [];

  try {
    const [productBundle, rawCategories] = await Promise.all([
      productService.getProductById(id, admin),
      categoryService.getAllCategories(admin, { tree: false }),
    ]);

    initialProduct = toProductBundleDTO(productBundle);
    initialCategories = (rawCategories as any[]).map(toCategoryDTO);
  } catch (err) {
    console.error(`[Edit Product Page Error]: Failed to fetch product ${id}:`, err);
    notFound();
  }

  return (
    <ProductFormPage
      id={id}
      initialProduct={initialProduct}
      initialCategories={initialCategories}
    />
  );
}
