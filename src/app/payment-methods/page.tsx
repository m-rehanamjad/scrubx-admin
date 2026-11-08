import type { Metadata } from "next";
import PaymentMethodsPage from "@/views/PaymentMethods";
import { paymentMethodService } from "@/server/services/payment-method.service";
import { settingsService } from "@/server/services/settings.service";
import { requireStaffContext } from "@/server/auth";
import { toPaymentMethodDTO } from "@/lib/dto";
import type { PaymentMethod } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment Methods",
  description: "Configure Bank Transfer, JazzCash, EasyPaisa, and Cash on Delivery settings.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialMethods: PaymentMethod[] = [];
  let paymentDeadlineHours = 24;

  try {
    const [methods, settings] = await Promise.all([
      paymentMethodService.getPaymentMethods(admin),
      settingsService.getAllSettings(admin),
    ]);
    initialMethods = methods.map(toPaymentMethodDTO);
    paymentDeadlineHours = settings.payment_deadline_hours ?? 24;
  } catch (err) {
    console.error("[Payment Methods Page Error]: Failed to fetch payment methods:", err);
  }

  return (
    <PaymentMethodsPage
      initialMethods={initialMethods}
      paymentDeadlineHours={paymentDeadlineHours}
    />
  );
}
