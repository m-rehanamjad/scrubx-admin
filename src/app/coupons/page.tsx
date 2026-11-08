import type { Metadata } from "next";
import CouponsPage from "@/views/Coupons";
import { couponService } from "@/server/services/coupon.service";
import { requireStaffContext } from "@/server/auth";
import { toCouponDTO } from "@/lib/dto";
import type { Coupon } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Coupons",
  description: "Create and manage promotional voucher codes, minimum spends, and usage limits.",
};

export default async function Page() {
  const admin = await requireStaffContext();

  let initialCoupons: Coupon[] = [];

  try {
    const couponsResult = await couponService.getCoupons(
      {
        page: 1,
        limit: 100,
        sortBy: "createdAt",
        sortOrder: "desc",
        status: "all",
      },
      admin
    );

    initialCoupons = couponsResult.items.map(toCouponDTO);
  } catch (err) {
    console.error("[Coupons Page Error]: Failed to fetch coupons:", err);
  }

  return <CouponsPage initialCoupons={initialCoupons} />;
}
