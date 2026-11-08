import type { Metadata } from "next";
import CategoriesPage from "@/views/Categories";
import { categoryService } from "@/server/services/category.service";
import { requireStaffContext } from "@/server/auth";
import { toCategoryDTO } from "@/lib/dto";
import type { Category } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Categories",
  description: "Organise your catalogue hierarchy with parent and child categories.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialCategories: Category[] = [];
  const initialCounts: Record<string, number> = {};

  try {
    const rawCategories = await categoryService.getAllCategories(admin, { tree: false });

    // Transform to client DTOs and build product counts record
    initialCategories = (rawCategories as any[]).map(toCategoryDTO);
    (rawCategories as any[]).forEach((cat) => {
      initialCounts[cat.id] = Number(cat.productCount ?? 0);
    });
  } catch (err) {
    console.error("[Categories Page Error]: Failed to fetch categories:", err);
  }

  return (
    <CategoriesPage
      initialCategories={initialCategories}
      initialCounts={initialCounts}
    />
  );
}
