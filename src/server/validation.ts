import { z } from "zod";
const id = z.uuid();
const text = z.string().trim().max(10000);
const name = z.string().trim().min(1).max(200);
const money = z.number().finite().min(0).max(9999999999.99);
const count = z.number().int().min(0).max(10000000);
const url = z.union([
  z.literal(""),
  z.url().refine((v) => v.startsWith("https://"), "Use an HTTPS URL"),
]);
const variant = z.object({
  id,
  colorId: id,
  name,
  sku: name,
  size: name,
  price: money,
  compareAtPrice: money.nullable(),
  stock: count,
  reserved: count,
  reorderLevel: count,
  active: z.boolean(),
});
export const productSchema = z
  .object({
    id,
    name,
    slug: name.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: text,
    categoryId: z.union([id, z.literal("")]),
    brand: text,
    gender: z.enum(["men", "women", "unisex"]),
    material: text,
    status: z.enum(["draft", "active", "archived"]),
    engraveable: z.boolean(),
    updatedAt: z.iso.datetime(),
    colors: z
      .array(z.object({ id, name, hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
      .max(100),
    images: z
      .array(
        z.object({
          id,
          url,
          alt: text,
          colorId: id.nullable(),
          isMain: z.boolean(),
          imagekitFileId: z.string().min(1).max(500).optional(),
        }),
      )
      .max(100),
    variants: z.array(variant).max(1000),
  })
  .superRefine((p, ctx) => {
    const colors = new Set(p.colors.map((c) => c.id));
    if (
      colors.size !== p.colors.length ||
      new Set(p.variants.map((v) => v.id)).size !== p.variants.length
    )
      ctx.addIssue({ code: "custom", message: "Duplicate IDs" });
    for (const v of p.variants)
      if (!colors.has(v.colorId) || v.reserved > v.stock)
        ctx.addIssue({
          code: "custom",
          message: "Invalid variant color or stock",
        });
    for (const i of p.images)
      if (i.colorId && !colors.has(i.colorId))
        ctx.addIssue({ code: "custom", message: "Invalid image color" });
  });
export const schemas = {
  saveProduct: productSchema,
  deleteProduct: z.object({ id }),
  setProductStatus: z.object({
    id,
    status: z.enum(["draft", "active", "archived"]),
  }),
  saveCategory: z.object({
    id,
    name,
    slug: name.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    parentId: id.nullable(),
    description: text,
    image: url,
    status: z.enum(["active", "inactive"]),
    sortOrder: count,
  }),
  deleteCategory: z.object({ id }),
  toggleCategoryStatus: z.object({ id }),
  setOrderStatus: z.object({
    id,
    status: z.enum([
      "awaiting_payment",
      "payment_submitted",
      "pending_cod",
      "confirmed",
      "processing",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ]),
    note: text.optional(),
  }),
  setOrderCourier: z.object({ id, courier: name, trackingNumber: name }),
  addOrderNote: z.object({ id, text: name }),
  addCustomerNote: z.object({ id, text: name }),
  approvePayment: z.object({ id }),
  rejectPayment: z.object({ id, reason: name }),
  setVariantStock: z.object({
    productId: id,
    variantId: id,
    newStock: count,
    expectedStock: count,
    type: z.enum(["restock", "sale", "cancellation", "return", "adjustment"]),
    reason: name,
    note: text.optional(),
  }),
  saveCoupon: z
    .object({
      id,
      code: name,
      description: text,
      type: z.enum(["percentage", "fixed"]),
      value: money,
      minOrderAmount: money,
      maxDiscount: money.nullable(),
      usageLimit: count.nullable(),
      perCustomerLimit: count.nullable(),
      firstOrderOnly: z.boolean(),
      startsAt: z.iso.datetime(),
      expiresAt: z.union([z.iso.datetime(), z.literal("")]),
      status: z.enum(["active", "inactive", "expired"]),
    })
    .refine(
      (c) => c.type !== "percentage" || c.value <= 100,
      "Percentage cannot exceed 100",
    )
    .refine(
      (c) => !c.expiresAt || c.expiresAt > c.startsAt,
      "Expiry must be after start date",
    ),
  deleteCoupon: z.object({ id }),
  savePaymentMethod: z
    .object({
      id: z.enum([
        "jazzcash",
        "easypaisa",
        "sadapay",
        "nayapay",
        "bank",
        "cod",
      ]),
      name,
      accountTitle: text,
      accountNumber: text,
      bankName: text,
      iban: text,
      instructions: text,
      active: z.boolean(),
      displayOrder: count,
      allowEngraving: z.boolean(),
    })
    .refine(
      (m) => m.id !== "cod" || !m.allowEngraving,
      "COD cannot allow engraving",
    ),
  saveEngravingOption: z.object({
    id,
    name,
    type: z.enum(["name", "logo"]),
    description: text,
    price: money,
    maxCharacters: count.nullable(),
    active: z.boolean(),
  }),
  deleteEngravingOption: z.object({ id }),
  saveShippingMethod: z
    .object({
      id,
      name,
      description: text,
      price: money,
      freeShippingThreshold: money.nullable(),
      minDays: count,
      maxDays: count,
      active: z.boolean(),
      displayOrder: count,
    })
    .refine((s) => s.minDays <= s.maxDays, "Invalid delivery range"),
  deleteShippingMethod: z.object({ id }),
  updateSettings: z
    .object({
      storeName: name,
      tagline: text,
      supportEmail: z.union([z.email(), z.literal("")]),
      supportPhone: text,
      whatsapp: text,
      address: text,
      city: text,
      province: text,
      postcode: text,
      currency: z.literal("PKR"),
      paymentDeadlineHours: z.number().int().min(1).max(720),
      orderConfirmationAuto: z.boolean(),
      lowStockAlerts: z.boolean(),
      newOrderEmail: z.boolean(),
      newOrderWhatsapp: z.boolean(),
      paymentSubmittedAlert: z.boolean(),
      dailySummary: z.boolean(),
      defaultShippingMethodId: z.union([id, z.literal("")]),
    })
    .partial(),
};
export type Operation = keyof typeof schemas;
