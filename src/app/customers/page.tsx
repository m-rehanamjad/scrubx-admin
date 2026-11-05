import type { Metadata } from "next";
import CustomersPage from "@/views/Customers";

export const metadata: Metadata = {
  title: "Customers",
  description: "View customer profiles, order histories, and lifetime spend across Pakistan.",
};

export default function Page() {
  return <CustomersPage />;
}
