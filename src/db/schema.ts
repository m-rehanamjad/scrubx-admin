import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  numeric,
  jsonb,
  pgEnum,
  unique,
  index,
  primaryKey,
  bigint,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

// ============================================================================
// 1. ENUMS
// ============================================================================

export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "active",
  "archived",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "awaiting_payment",
  "payment_submitted",
  "pending", // COD only
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "awaiting_verification",
  "paid",
  "rejected",
  "failed",
  "refunded",
]);

export const discountTypeEnum = pgEnum("discount_type", [
  "percentage",
  "fixed_amount",
]);

export const engravingTypeEnum = pgEnum("engraving_type", ["name", "logo"]);

// ============================================================================
// 2. BETTER AUTH TABLES
// ============================================================================

export const baUser = pgTable("ba_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("customer"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const baSession = pgTable(
  "ba_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => baUser.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_ba_session_user_id").on(table.userId)],
);

export const baAccount = pgTable(
  "ba_account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => baUser.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_ba_account_user_id").on(table.userId)],
);

export const baVerification = pgTable("ba_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// 3. CATALOG
// ============================================================================

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  parentId: uuid("parent_id").references(
    (): AnyPgColumn => productCategories.id,
    { onDelete: "set null" },
  ),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    status: productStatusEnum("status").notNull().default("draft"),
    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "set null",
    }),
    brand: text("brand"),
    gender: text("gender"), // 'men' | 'women' | 'unisex'
    material: text("material"),
    isEngravable: boolean("is_engravable").notNull().default(false),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_products_category_id").on(table.categoryId),
    index("idx_products_status").on(table.status),
  ],
);

export const productColors = pgTable(
  "product_colors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hexCode: text("hex_code"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_product_colors_product_name").on(table.productId, table.name),
    index("idx_product_colors_product_id").on(table.productId),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colorId: uuid("color_id").references(() => productColors.id, {
      onDelete: "set null",
    }),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    size: text("size"),
    sizeSortOrder: integer("size_sort_order").notNull().default(0),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    compareAtPrice: numeric("compare_at_price", { precision: 12, scale: 2 }),
    attributes: jsonb("attributes").notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_product_variants_combo").on(
      table.productId,
      table.colorId,
      table.size,
    ),
    index("idx_product_variants_product_id").on(table.productId),
    index("idx_product_variants_color_id").on(table.colorId),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    colorId: uuid("color_id").references(() => productColors.id, {
      onDelete: "cascade",
    }),
    imagekitFileId: text("imagekit_file_id").notNull().unique(),
    url: text("url").notNull(),
    thumbnailUrl: text("thumbnail_url"),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_product_images_lookup").on(
      table.productId,
      table.colorId,
      table.sortOrder,
    ),
  ],
);

// ============================================================================
// 4. INVENTORY
// ============================================================================

export const inventory = pgTable("inventory", {
  id: uuid("id").primaryKey().defaultRandom(),
  variantId: uuid("variant_id")
    .notNull()
    .unique()
    .references(() => productVariants.id, { onDelete: "cascade" }),
  quantityOnHand: integer("quantity_on_hand").notNull().default(0),
  quantityReserved: integer("quantity_reserved").notNull().default(0),
  reorderLevel: integer("reorder_level").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    change: integer("change").notNull(),
    reason: text("reason").notNull(),
    orderId: uuid("order_id").references((): AnyPgColumn => orders.id, {
      onDelete: "set null",
    }),
    createdBy: text("created_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_inventory_movements_variant").on(table.variantId)],
);

// ============================================================================
// 5. ENGRAVING OPTIONS
// ============================================================================

export const engravingOptions = pgTable("engraving_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: engravingTypeEnum("type").notNull().default("name"),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  maxCharacters: integer("max_characters"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// 6. CUSTOMERS & ADDRESSES
// ============================================================================

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .unique()
      .references(() => baUser.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_customers_email").on(table.email)],
);

export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    label: text("label"),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    province: text("province"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("PK"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_addresses_customer_id").on(table.customerId)],
);

// ============================================================================
// 7. SHIPPING METHODS
// ============================================================================

export const shippingMethods = pgTable("shipping_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  freeAbove: numeric("free_above", { precision: 12, scale: 2 }),
  estimatedDays: integer("estimated_days"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// 8. COUPONS
// ============================================================================

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    description: text("description"),
    discountType: discountTypeEnum("discount_type").notNull(),
    discountValue: numeric("discount_value").notNull(),
    minimumOrderAmount: numeric("minimum_order_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    maximumDiscountAmount: numeric("maximum_discount_amount", {
      precision: 12,
      scale: 2,
    }),
    usageLimit: integer("usage_limit"),
    usageLimitPerCustomer: integer("usage_limit_per_customer"),
    usageCount: integer("usage_count").notNull().default(0),
    firstOrderOnly: boolean("first_order_only").notNull().default(false),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_coupons_code").on(table.code)],
);

// ============================================================================
// 9. PAYMENT METHODS
// ============================================================================

export const paymentMethods = pgTable("payment_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'wallet' | 'bank_transfer' | 'cod'
  accountTitle: text("account_title"),
  accountNumber: text("account_number"),
  bankName: text("bank_name"),
  iban: text("iban"),
  instructions: text("instructions"),
  allowedWithEngraving: boolean("allowed_with_engraving")
    .notNull()
    .default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ============================================================================
// 10. ORDERS
// ============================================================================

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderNumber: text("order_number").notNull().unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    status: orderStatusEnum("status").notNull().default("awaiting_payment"),
    currency: text("currency").notNull().default("PKR"),
    subtotal: numeric("subtotal", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    engravingTotal: numeric("engraving_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    discountTotal: numeric("discount_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    shippingTotal: numeric("shipping_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    taxTotal: numeric("tax_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
    hasEngraving: boolean("has_engraving").notNull().default(false),
    paymentMethodId: uuid("payment_method_id").references(
      () => paymentMethods.id,
      {
        onDelete: "set null",
      },
    ),
    shippingMethodId: uuid("shipping_method_id").references(
      () => shippingMethods.id,
      {
        onDelete: "set null",
      },
    ),
    shippingMethodName: text("shipping_method_name"),
    contactPhone: text("contact_phone"),
    shippingAddress: jsonb("shipping_address").notNull().default({}),
    notes: text("notes"),
    courier: text("courier"),
    trackingNumber: text("tracking_number"),
    paymentDueAt: timestamp("payment_due_at", { withTimezone: true }),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_orders_customer_id").on(table.customerId),
    index("idx_orders_status_placed_at").on(table.status, table.placedAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "restrict" }),
    sku: text("sku").notNull(),
    productName: text("product_name").notNull(),
    variantName: text("variant_name").notNull(),
    imageUrl: text("image_url"),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: numeric("line_total", {
      precision: 12,
      scale: 2,
    }).generatedAlwaysAs(sql`unit_price * quantity`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_order_items_order_id").on(table.orderId)],
);

export const orderItemEngraving = pgTable(
  "order_item_engraving",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => orderItems.id, { onDelete: "cascade" }),
    engravingOptionId: uuid("engraving_option_id")
      .notNull()
      .references(() => engravingOptions.id, {
        onDelete: "restrict",
      }),
    text: text("text"),
    logoUrl: text("logo_url"),
    logoImagekitFileId: text("logo_imagekit_file_id"),
    placement: text("placement"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_order_item_engraving").on(
      table.orderItemId,
      table.engravingOptionId,
    ),
    index("idx_order_item_engraving_item").on(table.orderItemId),
  ],
);

export const orderCoupons = pgTable(
  "order_coupons",
  {
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    couponId: uuid("coupon_id")
      .notNull()
      .references(() => coupons.id, { onDelete: "restrict" }),
    discountAmount: numeric("discount_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.orderId, table.couponId] })],
);

export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    note: text("note"),
    changedBy: text("changed_by"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("idx_order_status_history_order").on(table.orderId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id, { onDelete: "restrict" }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("PKR"),
    senderName: text("sender_name"),
    senderAccountLast4: text("sender_account_last4"),
    transactionReference: text("transaction_reference"),
    proofUrl: text("proof_url"),
    providerPaymentId: text("provider_payment_id"),
    metadata: jsonb("metadata").notNull().default({}),
    verifiedBy: text("verified_by").references(() => baUser.id, {
      onDelete: "set null",
    }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_payments_order_id").on(table.orderId),
    index("idx_payments_status").on(table.status),
  ],
);

// ============================================================================
// 11. STORE SETTINGS
// ============================================================================

export const storeSettings = pgTable("store_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: text("updated_by").references(() => baUser.id, {
    onDelete: "set null",
  }),
});

// ============================================================================
// 12. RELATIONS DEFINITIONS (DRIZZLE QUERY API)
// ============================================================================

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, {
    fields: [products.categoryId],
    references: [productCategories.id],
  }),
  colors: many(productColors),
  variants: many(productVariants),
  images: many(productImages),
}));

export const productCategoriesRelations = relations(
  productCategories,
  ({ one, many }) => ({
    parent: one(productCategories, {
      fields: [productCategories.parentId],
      references: [productCategories.id],
      relationName: "categoryHierarchy",
    }),
    children: many(productCategories, { relationName: "categoryHierarchy" }),
    products: many(products),
  }),
);

export const productVariantsRelations = relations(
  productVariants,
  ({ one, many }) => ({
    product: one(products, {
      fields: [productVariants.productId],
      references: [products.id],
    }),
    color: one(productColors, {
      fields: [productVariants.colorId],
      references: [productColors.id],
    }),
    inventory: one(inventory, {
      fields: [productVariants.id],
      references: [inventory.variantId],
    }),
    movements: many(inventoryMovements),
  }),
);

export const ordersRelations = relations(orders, ({ one, many }) => ({
  customer: one(customers, {
    fields: [orders.customerId],
    references: [customers.id],
  }),
  paymentMethod: one(paymentMethods, {
    fields: [orders.paymentMethodId],
    references: [paymentMethods.id],
  }),
  shippingMethod: one(shippingMethods, {
    fields: [orders.shippingMethodId],
    references: [shippingMethods.id],
  }),
  items: many(orderItems),
  payments: many(payments),
  coupons: many(orderCoupons),
  statusHistory: many(orderStatusHistory),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
  engravings: many(orderItemEngraving),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  user: one(baUser, {
    fields: [customers.userId],
    references: [baUser.id],
  }),
  addresses: many(addresses),
  orders: many(orders),
}));

export const baRateLimit = pgTable("ba_rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull().default(0),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
