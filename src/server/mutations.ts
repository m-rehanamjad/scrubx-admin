import "server-only";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { schemas, type Operation } from "./validation";
import { HttpError } from "./access";
import type { z } from "zod";

type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];
const found = <T>(rows: T[]) => {
  if (!rows[0]) throw new HttpError(404, "Record not found.");
  return rows[0];
};
const dbStatus = (s: string) =>
  (s === "pending_cod" ? "pending" : s) as typeof t.orders.$inferInsert.status;
const transitions: Record<string, string[]> = {
  awaiting_payment: ["payment_submitted", "cancelled"],
  payment_submitted: ["awaiting_payment", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};
async function changeOrder(
  tx: Tx,
  id: string,
  status: NonNullable<typeof t.orders.$inferInsert.status>,
  actor: string,
  note?: string,
  paymentReview = false,
) {
  const o = found(
    await tx.select().from(t.orders).where(eq(t.orders.id, id)).for("update"),
  );
  if (o.status === status) return;
  if (
    !transitions[o.status]?.includes(status) &&
    !(
      paymentReview &&
      o.status === "payment_submitted" &&
      status === "confirmed"
    )
  )
    throw new HttpError(409, `Cannot change ${o.status} to ${status}.`);
  // Stock is reserved by checkout. Shipping consumes it; cancellation releases it atomically.
  if (status === "shipped" || status === "cancelled") {
    const items = await tx
      .select()
      .from(t.orderItems)
      .where(eq(t.orderItems.orderId, id))
      .orderBy(t.orderItems.variantId);
    for (const i of items) {
      if (!i.variantId) continue;
      const rows = await tx
        .update(t.inventory)
        .set({
          quantityReserved: sql`${t.inventory.quantityReserved} - ${i.quantity}`,
          ...(status === "shipped"
            ? {
                quantityOnHand: sql`${t.inventory.quantityOnHand} - ${i.quantity}`,
              }
            : {}),
        })
        .where(
          and(
            eq(t.inventory.variantId, i.variantId),
            sql`${t.inventory.quantityReserved} >= ${i.quantity}`,
          ),
        )
        .returning();
      if (!rows.length)
        throw new HttpError(
          409,
          "Reserved inventory does not match this order; reconcile stock first.",
        );
      if (status === "shipped")
        await tx.insert(t.inventoryMovements).values({
          variantId: i.variantId,
          change: -i.quantity,
          reason: "sale",
          orderId: id,
          createdBy: actor,
        });
    }
  }
  await tx
    .update(t.orders)
    .set({
      status,
      ...(status === "shipped" ? { shippedAt: new Date() } : {}),
      ...(status === "delivered" ? { deliveredAt: new Date() } : {}),
      ...(status === "cancelled" ? { cancelledAt: new Date() } : {}),
    })
    .where(eq(t.orders.id, id));
  await tx.insert(t.orderStatusHistory).values({
    orderId: id,
    fromStatus: o.status,
    toStatus: status,
    note,
    changedBy: actor,
  });
}
async function saveProduct(
  tx: Tx,
  p: z.infer<typeof schemas.saveProduct>,
  actor: string,
) {
  const existing = (
    await tx
      .select()
      .from(t.products)
      .where(eq(t.products.id, p.id))
      .for("update")
  )[0];
  if (
    existing &&
    (existing.deletedAt || existing.updatedAt.toISOString() !== p.updatedAt)
  )
    throw new HttpError(409, "Product changed. Reload before saving.");
  const row = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId || null,
    brand: p.brand,
    gender: p.gender,
    material: p.material,
    status: p.status,
    isEngravable: p.engraveable,
  };
  await tx
    .insert(t.products)
    .values(row)
    .onConflictDoUpdate({ target: t.products.id, set: row });
  for (const [order, c] of p.colors.entries()) {
    const other = (
      await tx
        .select()
        .from(t.productColors)
        .where(eq(t.productColors.id, c.id))
    )[0];
    if (other && other.productId !== p.id)
      throw new HttpError(409, "Color belongs to another product.");
    const row = {
      id: c.id,
      productId: p.id,
      name: c.name,
      hexCode: c.hex,
      sortOrder: order,
    };
    await tx
      .insert(t.productColors)
      .values(row)
      .onConflictDoUpdate({ target: t.productColors.id, set: row });
  }
  for (const [order, v] of p.variants.entries()) {
    const other = (
      await tx
        .select()
        .from(t.productVariants)
        .where(eq(t.productVariants.id, v.id))
    )[0];
    if (other && other.productId !== p.id)
      throw new HttpError(409, "Variant belongs to another product.");
    const row = {
      id: v.id,
      productId: p.id,
      colorId: v.colorId,
      name: v.name,
      sku: v.sku,
      size: v.size,
      sizeSortOrder: order,
      price: String(v.price),
      compareAtPrice:
        v.compareAtPrice === null ? null : String(v.compareAtPrice),
      isActive: v.active,
    };
    await tx
      .insert(t.productVariants)
      .values(row)
      .onConflictDoUpdate({ target: t.productVariants.id, set: row });
    const inv = (
      await tx
        .select()
        .from(t.inventory)
        .where(eq(t.inventory.variantId, v.id))
        .for("update")
    )[0];
    if (inv && inv.quantityOnHand !== v.stock)
      throw new HttpError(
        409,
        "Use the Inventory page to adjust existing stock; reload the product if inventory changed.",
      );
    if (v.stock < (inv?.quantityReserved || 0))
      throw new HttpError(409, "Stock cannot fall below reserved quantity.");
    await tx
      .insert(t.inventory)
      .values({
        variantId: v.id,
        quantityOnHand: v.stock,
        reorderLevel: v.reorderLevel,
      })
      .onConflictDoUpdate({
        target: t.inventory.variantId,
        set: { quantityOnHand: v.stock, reorderLevel: v.reorderLevel },
      });
    const delta = v.stock - (inv?.quantityOnHand || 0);
    if (delta)
      await tx.insert(t.inventoryMovements).values({
        variantId: v.id,
        change: delta,
        reason: "adjustment",
        createdBy: actor,
      });
  }
  const missing = and(
    eq(t.productVariants.productId, p.id),
    p.variants.length
      ? notInArray(
          t.productVariants.id,
          p.variants.map((v) => v.id),
        )
      : undefined,
  );
  await tx.update(t.productVariants).set({ isActive: false }).where(missing);
  // Preserve historical variants and their colors. Image metadata is managed separately from file storage.
  await tx.delete(t.productImages).where(
    and(
      eq(t.productImages.productId, p.id),
      p.images.length
        ? notInArray(
            t.productImages.id,
            p.images.map((i) => i.id),
          )
        : undefined,
    ),
  );
  for (const [order, i] of p.images.entries()) {
    const other = (
      await tx
        .select()
        .from(t.productImages)
        .where(eq(t.productImages.id, i.id))
    )[0];
    if (other && other.productId !== p.id)
      throw new HttpError(409, "Image belongs to another product.");
    if (!i.imagekitFileId && !other)
      throw new HttpError(
        400,
        "ImageKit file ID is required for new images. Upload images to ImageKit first.",
      );
    const row = {
      id: i.id,
      productId: p.id,
      colorId: i.colorId,
      imagekitFileId: i.imagekitFileId || other!.imagekitFileId,
      url: i.url,
      altText: i.alt,
      sortOrder: i.isMain ? 0 : order + 1,
    };
    await tx
      .insert(t.productImages)
      .values(row)
      .onConflictDoUpdate({ target: t.productImages.id, set: row });
  }
}
export async function mutate(
  operation: Operation,
  input: unknown,
  actor: string,
  database = getDb(),
) {
  // Each branch parses independently so validated types stay precise.
  return database.transaction(async (tx) => {
    switch (operation) {
      case "saveProduct":
        return saveProduct(tx, schemas.saveProduct.parse(input), actor);
      case "deleteProduct": {
        const p = schemas.deleteProduct.parse(input);
        found(
          await tx
            .update(t.products)
            .set({ deletedAt: new Date(), status: "archived" })
            .where(eq(t.products.id, p.id))
            .returning(),
        );
        return;
      }
      case "setProductStatus": {
        const p = schemas.setProductStatus.parse(input);
        found(
          await tx
            .update(t.products)
            .set({ status: p.status })
            .where(eq(t.products.id, p.id))
            .returning(),
        );
        return;
      }
      case "saveCategory": {
        const p = schemas.saveCategory.parse(input);
        if (p.parentId) {
          const rows = await tx.select().from(t.productCategories);
          let parent: string | null = p.parentId;
          const seen = new Set([p.id]);
          while (parent) {
            if (seen.has(parent))
              throw new HttpError(
                400,
                "Category hierarchy cannot contain cycles.",
              );
            seen.add(parent);
            parent = rows.find((c) => c.id === parent)?.parentId || null;
          }
        }
        const row = {
          id: p.id,
          name: p.name,
          slug: p.slug,
          parentId: p.parentId,
          description: p.description,
          imageUrl: p.image || null,
          isActive: p.status === "active",
          sortOrder: p.sortOrder,
        };
        await tx
          .insert(t.productCategories)
          .values(row)
          .onConflictDoUpdate({ target: t.productCategories.id, set: row });
        return;
      }
      case "toggleCategoryStatus": {
        const p = schemas.toggleCategoryStatus.parse(input);
        found(
          await tx
            .update(t.productCategories)
            .set({ isActive: sql`NOT ${t.productCategories.isActive}` })
            .where(eq(t.productCategories.id, p.id))
            .returning(),
        );
        return;
      }
      case "deleteCategory": {
        const p = schemas.deleteCategory.parse(input);
        found(
          await tx
            .delete(t.productCategories)
            .where(eq(t.productCategories.id, p.id))
            .returning(),
        );
        return;
      }
      case "setOrderStatus": {
        const p = schemas.setOrderStatus.parse(input);
        return changeOrder(tx, p.id, dbStatus(p.status)!, actor, p.note);
      }
      case "setOrderCourier": {
        const p = schemas.setOrderCourier.parse(input);
        found(
          await tx
            .update(t.orders)
            .set({ courier: p.courier, trackingNumber: p.trackingNumber })
            .where(eq(t.orders.id, p.id))
            .returning(),
        );
        return;
      }
      case "addOrderNote": {
        const p = schemas.addOrderNote.parse(input);
        const o = found(
          await tx
            .select()
            .from(t.orders)
            .where(eq(t.orders.id, p.id))
            .for("update"),
        );
        await tx
          .update(t.orders)
          .set({
            notes: [o.notes, `[${new Date().toISOString()} ${actor}] ${p.text}`]
              .filter(Boolean)
              .join("\n"),
          })
          .where(eq(t.orders.id, p.id));
        return;
      }
      case "addCustomerNote": {
        const p = schemas.addCustomerNote.parse(input);
        found(
          await tx
            .update(t.customers)
            .set({
              notes: sql`concat_ws(E'\n', ${t.customers.notes}, ${`[${new Date().toISOString()} ${actor}] ${p.text}`})`,
            })
            .where(eq(t.customers.id, p.id))
            .returning(),
        );
        return;
      }
      case "approvePayment":
      case "rejectPayment": {
        const p =
          operation === "approvePayment"
            ? schemas.approvePayment.parse(input)
            : schemas.rejectPayment.parse(input);
        const initial = found(
          await tx.select().from(t.payments).where(eq(t.payments.id, p.id)),
        ); // consistent lock order: order, then payment
        const order = found(
          await tx
            .select()
            .from(t.orders)
            .where(eq(t.orders.id, initial.orderId))
            .for("update"),
        );
        const payment = found(
          await tx
            .select()
            .from(t.payments)
            .where(eq(t.payments.id, p.id))
            .for("update"),
        );
        if (
          payment.status !== "awaiting_verification" ||
          order.status !== "payment_submitted"
        )
          throw new HttpError(
            409,
            "Payment is already reviewed or order is not awaiting verification.",
          );
        const approved = operation === "approvePayment";
        if (approved && Number(payment.amount) !== Number(order.total))
          throw new HttpError(
            409,
            "Payment amount does not match order total.",
          );
        await tx
          .update(t.payments)
          .set({
            status: approved ? "paid" : "rejected",
            verifiedBy: actor,
            verifiedAt: new Date(),
            paidAt: approved ? new Date() : null,
            rejectionReason: "reason" in p ? String(p.reason) : null,
          })
          .where(eq(t.payments.id, p.id));
        await changeOrder(
          tx,
          order.id,
          approved ? "confirmed" : "awaiting_payment",
          actor,
          approved
            ? "Payment verified"
            : `Payment rejected: ${"reason" in p ? p.reason : ""}`,
          true,
        );
        return;
      }
      case "setVariantStock": {
        const p = schemas.setVariantStock.parse(input);
        found(
          await tx
            .select()
            .from(t.productVariants)
            .where(
              and(
                eq(t.productVariants.id, p.variantId),
                eq(t.productVariants.productId, p.productId),
              ),
            ),
        );
        const s = found(
          await tx
            .select()
            .from(t.inventory)
            .where(eq(t.inventory.variantId, p.variantId))
            .for("update"),
        );
        if (s.quantityOnHand !== p.expectedStock)
          throw new HttpError(409, "Stock changed. Reload and retry.");
        if (p.newStock < s.quantityReserved)
          throw new HttpError(
            409,
            "Stock cannot be lower than reserved stock.",
          );
        await tx
          .update(t.inventory)
          .set({ quantityOnHand: p.newStock })
          .where(eq(t.inventory.id, s.id));
        await tx.insert(t.inventoryMovements).values({
          variantId: p.variantId,
          change: p.newStock - s.quantityOnHand,
          reason: p.type === "cancellation" ? "cancel" : p.type,
          createdBy: actor,
        });
        return;
      }
      case "saveCoupon": {
        const p = schemas.saveCoupon.parse(input);
        const row = {
          id: p.id,
          code: p.code.toUpperCase(),
          description: p.description,
          discountType:
            p.type === "fixed"
              ? ("fixed_amount" as const)
              : ("percentage" as const),
          discountValue: String(p.value),
          minimumOrderAmount: String(p.minOrderAmount),
          maximumDiscountAmount:
            p.maxDiscount === null ? null : String(p.maxDiscount),
          usageLimit: p.usageLimit,
          usageLimitPerCustomer: p.perCustomerLimit,
          firstOrderOnly: p.firstOrderOnly,
          startsAt: new Date(p.startsAt),
          expiresAt: p.expiresAt ? new Date(p.expiresAt) : null,
          isActive: p.status === "active",
        };
        await tx
          .insert(t.coupons)
          .values(row)
          .onConflictDoUpdate({ target: t.coupons.id, set: row });
        return;
      }
      case "deleteCoupon": {
        const p = schemas.deleteCoupon.parse(input);
        found(
          await tx.delete(t.coupons).where(eq(t.coupons.id, p.id)).returning(),
        );
        return;
      }
      case "savePaymentMethod": {
        const p = schemas.savePaymentMethod.parse(input);
        const row = {
          code: p.id,
          name: p.name,
          type:
            p.id === "cod"
              ? "cod"
              : p.id === "bank"
                ? "bank_transfer"
                : "wallet",
          accountTitle: p.accountTitle,
          accountNumber: p.accountNumber,
          bankName: p.bankName,
          iban: p.iban,
          instructions: p.instructions,
          allowedWithEngraving: p.allowEngraving,
          isActive: p.active,
          sortOrder: p.displayOrder,
        };
        await tx
          .insert(t.paymentMethods)
          .values(row)
          .onConflictDoUpdate({ target: t.paymentMethods.code, set: row });
        return;
      }
      case "saveEngravingOption": {
        const p = schemas.saveEngravingOption.parse(input);
        const row = {
          id: p.id,
          name: p.name,
          type: p.type,
          description: p.description,
          price: String(p.price),
          maxCharacters: p.maxCharacters,
          isActive: p.active,
        };
        await tx
          .insert(t.engravingOptions)
          .values(row)
          .onConflictDoUpdate({ target: t.engravingOptions.id, set: row });
        return;
      }
      case "deleteEngravingOption": {
        const p = schemas.deleteEngravingOption.parse(input);
        found(
          await tx
            .delete(t.engravingOptions)
            .where(eq(t.engravingOptions.id, p.id))
            .returning(),
        );
        return;
      }
      case "saveShippingMethod": {
        const p = schemas.saveShippingMethod.parse(input);
        const row = {
          id: p.id,
          name: p.name,
          description: p.description,
          price: String(p.price),
          freeAbove:
            p.freeShippingThreshold === null
              ? null
              : String(p.freeShippingThreshold),
          estimatedDays: p.maxDays,
          isActive: p.active,
          sortOrder: p.displayOrder,
        };
        await tx
          .insert(t.shippingMethods)
          .values(row)
          .onConflictDoUpdate({ target: t.shippingMethods.id, set: row });
        return;
      }
      case "deleteShippingMethod": {
        const p = schemas.deleteShippingMethod.parse(input);
        found(
          await tx
            .delete(t.shippingMethods)
            .where(eq(t.shippingMethods.id, p.id))
            .returning(),
        );
        return;
      }
      case "updateSettings": {
        const p = schemas.updateSettings.parse(input);
        for (const [key, value] of Object.entries(p))
          await tx
            .insert(t.storeSettings)
            .values({ key, value, updatedBy: actor })
            .onConflictDoUpdate({
              target: t.storeSettings.key,
              set: { value, updatedBy: actor },
            });
        return;
      }
    }
  });
}
