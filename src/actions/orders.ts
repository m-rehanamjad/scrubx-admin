"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { orderService } from "../server/services/order.service.ts";
import {
  createOrderSchema,
  updateOrderStatusSchema,
  updateOrderShippingSchema,
  addOrderNoteSchema,
} from "../server/validation/orders.ts";

/**
 * Server Action: Create order bundle with item snapshots, stock reservation, and trigger guards.
 * Requires at least staff privileges.
 */
export const createOrderAction = createSafeAction(
  {
    schema: createOrderSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const order = await orderService.createOrder(input, admin);
    revalidatePath("/orders");
    revalidatePath("/inventory");
    revalidatePath("/");
    return order;
  }
);

/**
 * Server Action: Update order status with state machine transition checks and inventory sync.
 * Strictly requires administrator privileges.
 */
export const updateOrderStatusAction = createSafeAction(
  {
    schema: updateOrderStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await orderService.updateOrderStatus(input, admin);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    revalidatePath("/inventory");
    revalidatePath("/payments");
    return updated;
  }
);

/**
 * Server Action: Update order courier and tracking information.
 * Requires at least staff privileges.
 */
export const updateOrderShippingAction = createSafeAction(
  {
    schema: updateOrderShippingSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const updated = await orderService.updateOrderShipping(input, admin);
    revalidatePath("/orders");
    revalidatePath(`/orders/${input.orderId}`);
    return updated;
  }
);

/**
 * Server Action: Append internal team note to order.
 * Requires at least staff privileges.
 */
export const addOrderNoteAction = createSafeAction(
  {
    schema: addOrderNoteSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    const note = await orderService.addOrderNote(input, admin);
    revalidatePath(`/orders/${input.orderId}`);
    return note;
  }
);
