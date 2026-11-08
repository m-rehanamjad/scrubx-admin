import type { Metadata } from "next";
import PaymentsPage from "@/views/Payments";
import { paymentService } from "@/server/services/payment.service";
import { requireStaffContext } from "@/server/auth";
import { toPaymentSubmissionDTO } from "@/lib/dto";
import type { PaymentSubmission } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment Verification",
  description: "Review screenshot payment proofs for JazzCash, EasyPaisa, and Bank Transfers.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialSubmissions: PaymentSubmission[] = [];

  try {
    const paymentsResult = await paymentService.getPayments(
      {
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
      },
      admin
    );

    initialSubmissions = paymentsResult.items.map((p) => toPaymentSubmissionDTO(p));
  } catch (err) {
    console.error("[Payments Page Error]: Failed to fetch payments:", err);
  }

  return <PaymentsPage initialSubmissions={initialSubmissions} />;
}
