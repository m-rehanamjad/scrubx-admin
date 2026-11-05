import type { Metadata } from "next";
import CategoriesPage from "@/views/Categories";

export const metadata: Metadata = {
  title: "Categories",
  description: "Organise your catalogue hierarchy with parent and child categories.",
};

export default function Page() {
  return <CategoriesPage />;
}
