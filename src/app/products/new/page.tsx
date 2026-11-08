import type { Metadata } from "next";
import ProductFormPage from "@/views/ProductForm";
import { categoryService } from "@/server/services/category.service";
import { requireStaffContext } from "@/server/auth";
import { toCategoryDTO } from "@/lib/dto";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New Product",
  description: "Create a new medical scrub, lab coat or accessory listing.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialCategories: Category[] = [];

  try {
    const rawCategories = await categoryService.getAllCategories(admin, { tree: false });
    initialCategories = (rawCategories as any[]).map(toCategoryDTO);
  } catch (err) {
    console.error("[New Product Page Error]: Failed to fetch categories:", err);
  }

  return <ProductFormPage initialCategories={initialCategories} />;
}
