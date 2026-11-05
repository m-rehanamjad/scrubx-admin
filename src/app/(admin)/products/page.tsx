import type { Metadata } from "next";
import ProductsPage from "@/views/Products";

export const metadata: Metadata = {
  title: "Products",
  description:
    "Manage listings, pricing and stock across every ScrubX product.",
};

export default function Page() {
  return <ProductsPage />;
}
