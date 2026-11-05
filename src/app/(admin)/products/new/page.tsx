import type { Metadata } from "next";
import ProductFormPage from "@/views/ProductForm";

export const metadata: Metadata = {
  title: "New Product",
  description: "Create a new medical scrub, lab coat or accessory listing.",
};

export default function Page() {
  return <ProductFormPage />;
}
