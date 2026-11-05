import type { Metadata } from "next";
import PaymentMethodsPage from "@/views/PaymentMethods";

export const metadata: Metadata = {
  title: "Payment Methods",
  description: "Configure Bank Transfer, JazzCash, EasyPaisa, and Cash on Delivery settings.",
};

export default function Page() {
  return <PaymentMethodsPage />;
}
