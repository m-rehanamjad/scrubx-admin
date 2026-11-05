import "server-only";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { isNull } from "drizzle-orm";
import type {
  AppState,
  Address,
  OrderStatus,
  PaymentStatus,
  PaymentMethodId,
} from "@/lib/types";
import { defaultSettings } from "@/data/empty";
import { ORDER_STATUS_LABEL } from "@/data/constants";
export const uiOrderStatus = (s: string) =>
  (s === "pending" ? "pending_cod" : s) as OrderStatus;
export const uiPaymentStatus = (s: string) =>
  (({ awaiting_verification: "submitted", paid: "approved" })[s] ||
    s) as PaymentStatus;
export async function getSnapshot(db = getDb()): Promise<AppState> {
  const [
    products,
    categories,
    colors,
    variants,
    images,
    stock,
    movements,
    customers,
    addresses,
    orders,
    items,
    engravings,
    options,
    history,
    payments,
    methods,
    shipping,
    coupons,
    settings,
  ] = await Promise.all([
    db.select().from(t.products).where(isNull(t.products.deletedAt)),
    db.select().from(t.productCategories),
    db.select().from(t.productColors),
    db.select().from(t.productVariants),
    db.select().from(t.productImages),
    db.select().from(t.inventory),
    db.select().from(t.inventoryMovements),
    db.select().from(t.customers),
    db.select().from(t.addresses),
    db.select().from(t.orders),
    db.select().from(t.orderItems),
    db.select().from(t.orderItemEngraving),
    db.select().from(t.engravingOptions),
    db.select().from(t.orderStatusHistory),
    db.select().from(t.payments),
    db.select().from(t.paymentMethods),
    db.select().from(t.shippingMethods),
    db.select().from(t.coupons),
    db.select().from(t.storeSettings),
  ]);
  const name = (id: string) => {
    const c = customers.find((c) => c.id === id);
    return c
      ? [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email
      : "Unknown customer";
  };
  const method = (id: string | null) =>
    (methods.find((m) => m.id === id)?.code || "bank") as PaymentMethodId;
  const notes = (text: string | null, fallback: Date) =>
    (text || "")
      .split("\n")
      .filter(Boolean)
      .map((line, index) => {
        const match = line.match(/^\[([^ ]+) ([^\]]+)\] (.*)$/);
        return {
          id: `note-${index}`,
          text: match?.[3] || line,
          at: match?.[1] || fallback.toISOString(),
          by: match?.[2] || "Admin",
        };
      });
  return {
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description || "",
      categoryId: p.categoryId || "",
      brand: p.brand || "",
      gender: (p.gender || "unisex") as "men" | "women" | "unisex",
      material: p.material || "",
      status: p.status,
      engraveable: p.isEngravable,
      featured: false,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      colors: colors
        .filter((c) => c.productId === p.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => ({ id: c.id, name: c.name, hex: c.hexCode || "#000000" })),
      images: images
        .filter((i) => i.productId === p.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.altText || "",
          colorId: i.colorId,
          isMain: i.sortOrder === 0,
          imagekitFileId: i.imagekitFileId,
        })),
      variants: variants
        .filter((v) => v.productId === p.id)
        .sort((a, b) => a.sizeSortOrder - b.sizeSortOrder)
        .map((v) => {
          const c = colors.find((c) => c.id === v.colorId);
          const s = stock.find((s) => s.variantId === v.id);
          return {
            id: v.id,
            colorId: v.colorId || "",
            colorName: c?.name || "",
            colorHex: c?.hexCode || "#000000",
            size: v.size || "",
            name: v.name,
            sku: v.sku,
            price: Number(v.price),
            compareAtPrice:
              v.compareAtPrice === null ? null : Number(v.compareAtPrice),
            stock: s?.quantityOnHand || 0,
            reserved: s?.quantityReserved || 0,
            reorderLevel: s?.reorderLevel ?? 5,
            active: v.isActive,
          };
        }),
    })),
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      description: c.description || "",
      image: c.imageUrl || "",
      status: c.isActive ? "active" : "inactive",
      sortOrder: c.sortOrder,
    })),
    customers: customers.map((c) => ({
      id: c.id,
      name: name(c.id),
      email: c.email,
      phone: c.phone || "",
      city: addresses.find((a) => a.customerId === c.id)?.city || "",
      type: c.userId ? "registered" : "guest",
      registeredAt: c.createdAt.toISOString(),
      notes: notes(c.notes, c.updatedAt),
      addresses: addresses
        .filter((a) => a.customerId === c.id)
        .map((a) => ({
          label: a.label || "",
          recipient: a.fullName,
          phone: a.phone,
          line1: a.addressLine1,
          line2: a.addressLine2 || "",
          city: a.city,
          province: a.province || "",
          postcode: a.postalCode || "",
          country: a.country,
        })),
    })),
    orders: orders
      .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime())
      .map((o) => {
        const c = customers.find((c) => c.id === o.customerId);
        const payment = payments
          .filter((p) => p.orderId === o.id)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
        return {
          id: o.id,
          orderNumber: o.orderNumber,
          customerId: o.customerId,
          customerName: name(o.customerId),
          customerEmail: c?.email || "",
          customerPhone: o.contactPhone || c?.phone || "",
          customerType: c?.userId ? "registered" : "guest",
          date: o.placedAt.toISOString(),
          subtotal: Number(o.subtotal),
          engravingCharges: Number(o.engravingTotal),
          discount: Number(o.discountTotal),
          shipping: Number(o.shippingTotal),
          total: Number(o.total),
          status: uiOrderStatus(o.status),
          paymentStatus: uiPaymentStatus(payment?.status || "pending"),
          paymentMethod: method(o.paymentMethodId),
          transactionRef: payment?.transactionReference || "",
          shippingAddress: o.shippingAddress as Address,
          courier: o.courier || "",
          trackingNumber: o.trackingNumber || "",
          internalNotes: notes(o.notes, o.updatedAt),
          engraving: items
            .filter((i) => i.orderId === o.id)
            .flatMap((i) =>
              engravings
                .filter((e) => e.orderItemId === i.id)
                .map((e) => {
                  const op = options.find(
                    (op) => op.id === e.engravingOptionId,
                  );
                  return {
                    optionId: e.engravingOptionId!,
                    optionName: op?.name || "Engraving",
                    type: op?.type || "name",
                    text: e.text || undefined,
                    logoUrl: e.logoUrl || undefined,
                    price: Number(e.price),
                  };
                }),
            ),
          timeline: history
            .filter((h) => h.orderId === o.id)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((h) => ({
              status: uiOrderStatus(h.toStatus),
              label: ORDER_STATUS_LABEL[uiOrderStatus(h.toStatus)],
              at: h.createdAt.toISOString(),
              note: h.note || "",
              by: h.changedBy || "system",
            })),
          items: items
            .filter((i) => i.orderId === o.id)
            .map((i) => {
              const v = variants.find((v) => v.id === i.variantId);
              const e = engravings.find((e) => e.orderItemId === i.id);
              const option = options.find(
                (op) => op.id === e?.engravingOptionId,
              );
              return {
                id: i.id,
                productId: v?.productId || "",
                productName: i.productName,
                variantId: i.variantId || "",
                variantName: i.variantName,
                colorName: colors.find((c) => c.id === v?.colorId)?.name || "",
                size: v?.size || "",
                sku: i.sku,
                image: i.imageUrl || "",
                price: Number(i.unitPrice),
                quantity: i.quantity,
                engraving:
                  e && option
                    ? {
                        optionId: option.id,
                        optionName: option.name,
                        type: option.type,
                        text: e.text || undefined,
                        logoUrl: e.logoUrl || undefined,
                        price: Number(e.price),
                      }
                    : undefined,
              };
            }),
        };
      }),
    paymentSubmissions: payments
      .filter((p) =>
        ["awaiting_verification", "paid", "rejected"].includes(p.status),
      )
      .map((p) => {
        const o = orders.find((o) => o.id === p.orderId);
        return {
          id: p.id,
          orderId: p.orderId,
          orderNumber: o?.orderNumber || "",
          customerName: o ? name(o.customerId) : "",
          customerPhone: o?.contactPhone || "",
          amount: Number(p.amount),
          method: method(p.paymentMethodId),
          transactionRef: p.transactionReference || "",
          proofUrl: p.proofUrl || "",
          submittedAt: p.createdAt.toISOString(),
          status: uiPaymentStatus(p.status) as
            "submitted" | "approved" | "rejected",
          rejectionReason: p.rejectionReason || undefined,
          reviewedAt: p.verifiedAt?.toISOString(),
        };
      }),
    paymentMethods: methods
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => ({
        id: m.code as PaymentMethodId,
        name: m.name,
        description: "",
        accountTitle: m.accountTitle || "",
        accountNumber: m.accountNumber || "",
        bankName: m.bankName || "",
        iban: m.iban || "",
        instructions: m.instructions || "",
        active: m.isActive,
        displayOrder: m.sortOrder,
        allowEngraving: m.allowedWithEngraving,
        supportsProof: m.type !== "cod",
      })),
    engravingOptions: options.map((o) => ({
      id: o.id,
      name: o.name,
      type: o.type,
      description: o.description || "",
      price: Number(o.price),
      maxCharacters: o.maxCharacters,
      active: o.isActive,
    })),
    shippingMethods: shipping.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description || "",
      price: Number(s.price),
      freeShippingThreshold: s.freeAbove === null ? null : Number(s.freeAbove),
      minDays: s.estimatedDays || 0,
      maxDays: s.estimatedDays || 0,
      active: s.isActive,
      displayOrder: s.sortOrder,
    })),
    coupons: coupons.map((c) => ({
      id: c.id,
      code: c.code,
      description: c.description || "",
      type: c.discountType === "fixed_amount" ? "fixed" : "percentage",
      value: Number(c.discountValue),
      minOrderAmount: Number(c.minimumOrderAmount),
      maxDiscount:
        c.maximumDiscountAmount === null
          ? null
          : Number(c.maximumDiscountAmount),
      usageLimit: c.usageLimit,
      perCustomerLimit: c.usageLimitPerCustomer,
      firstOrderOnly: c.firstOrderOnly,
      startsAt: c.startsAt.toISOString(),
      expiresAt: c.expiresAt?.toISOString() || "",
      usedCount: c.usageCount,
      status: !c.isActive
        ? "inactive"
        : c.expiresAt && c.expiresAt < new Date()
          ? "expired"
          : "active",
    })),
    inventoryMovements: movements
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((m) => {
        const v = variants.find((v) => v.id === m.variantId);
        return {
          id: m.id,
          productId: v?.productId || "",
          productName: products.find((p) => p.id === v?.productId)?.name || "",
          variantId: m.variantId,
          variantName: v?.name || "",
          sku: v?.sku || "",
          type: (m.reason === "cancel"
            ? "cancellation"
            : m.reason) as AppState["inventoryMovements"][number]["type"],
          quantity: m.change,
          reason: m.reason,
          at: m.createdAt.toISOString(),
          by: m.createdBy || "system",
        };
      }),
    settings: {
      ...defaultSettings,
      ...Object.fromEntries(settings.map((s) => [s.key, s.value])),
    },
  };
}
