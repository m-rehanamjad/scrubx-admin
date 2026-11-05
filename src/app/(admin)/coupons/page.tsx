import type { Metadata } from "next";
import CouponsPage from "@/views/Coupons";

export const metadata: Metadata = {
  title: "Coupons",
  description:
    "Create and manage promotional voucher codes, minimum spends, and usage limits.",
};

export default function Page() {
  return <CouponsPage />;
}
