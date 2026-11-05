import type { Metadata } from "next";
import PaymentsPage from "@/views/Payments";

export const metadata: Metadata = {
  title: "Payment Verification",
  description:
    "Review screenshot payment proofs for JazzCash, EasyPaisa, and Bank Transfers.",
};

export default function Page() {
  return <PaymentsPage />;
}
