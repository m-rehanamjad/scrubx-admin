import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ProductViewPage from "@/views/ProductView";
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
      title: `${product.name} | ScrubX`,
      description: product.description || "Product details and variant configuration.",
    };
  } catch {
    return {
      title: "Product Details | ScrubX",
      description: "Product details and variant configuration.",
    };
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  const admin = await requireStaffContext();

  let initialProduct;
  let initialCategories: any[] = [];

  try {
    const [productBundle, categoriesResult] = await Promise.all([
      productService.getProductById(id, admin),
      categoryService.getAllCategories(admin, { tree: false }),
    ]);

    initialProduct = toProductBundleDTO(productBundle);
    initialCategories = (categoriesResult as any[]).map(toCategoryDTO);
  } catch (err) {
    console.error(`[Product Page Error]: Failed to fetch product ${id}:`, err);
    notFound();
  }

  return (
    <ProductViewPage
      id={id}
      initialProduct={initialProduct}
      initialCategories={initialCategories}
    />
  );
}
