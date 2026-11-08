"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { couponService } from "../server/services/coupon.service.ts";
import {
  createCouponSchema,
  updateCouponSchema,
  toggleCouponStatusSchema,
  deleteCouponSchema,
} from "../server/validation/coupons.ts";

/**
 * Server Action: Create a new coupon.
 * Strictly enforces admin role authorization.
 */
export const createCouponAction = createSafeAction(
  {
    schema: createCouponSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const created = await couponService.createCoupon(input, admin);
    revalidatePath("/coupons");
    return created;
  }
);

/**
 * Server Action: Update an existing coupon.
 * Strictly enforces admin role authorization and partial-update entity validation.
 */
export const updateCouponAction = createSafeAction(
  {
    schema: updateCouponSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await couponService.updateCoupon(input, admin);
    revalidatePath("/coupons");
    return updated;
  }
);

/**
 * Server Action: Toggle active status of a coupon.
 * Strictly enforces admin role authorization.
 */
export const toggleCouponStatusAction = createSafeAction(
  {
    schema: toggleCouponStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await couponService.toggleCouponStatus(input.id, input.isActive, admin);
    revalidatePath("/coupons");
    return updated;
  }
);

/**
 * Server Action: Safely delete or deactivate a coupon.
 * Safely deactivates if historical order references exist.
 * Strictly enforces admin role authorization.
 */
export const deleteCouponAction = createSafeAction(
  {
    schema: deleteCouponSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await couponService.deleteCoupon(input.id, admin);
    revalidatePath("/coupons");
    return result;
  }
);
