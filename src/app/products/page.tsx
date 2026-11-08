import type { Metadata } from "next";
import ProductsPage from "@/views/Products";
import { productService } from "@/server/services/product.service";
import { categoryService } from "@/server/services/category.service";
import { requireStaffContext } from "@/server/auth";
import { toProductListItemDTO, toCategoryDTO } from "@/lib/dto";
import type { Product, Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Products",
  description: "Manage listings, pricing and stock across every ScrubX product.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialProducts: Product[] = [];
  let initialCategories: Category[] = [];

  try {
    const [productsResult, categoriesResult] = await Promise.all([
      productService.getProducts({ page: 1, limit: 100 }, admin),
      categoryService.getAllCategories(admin, { tree: false }),
    ]);

    initialProducts = productsResult.items.map(toProductListItemDTO);
    initialCategories = (categoriesResult as any[]).map(toCategoryDTO);
  } catch (err) {
    console.error("[Products Page Error]: Failed to fetch products or categories:", err);
  }

  return (
    <ProductsPage
      initialProducts={initialProducts}
      initialCategories={initialCategories}
    />
  );
}
