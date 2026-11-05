import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword } from "better-auth/crypto";
import { configureAuth } from "../src/lib/auth-config";
import * as schema from "../src/db/schema";
import { schemas } from "../src/server/validation";
import { isAdmin } from "../src/lib/roles";

const pg = new PGlite();
let auth: ReturnType<typeof configureAuth>;
before(async () => {
  for (const file of (await readdir("supabase/migrations")).sort()) {
    const sql = (await readFile(`supabase/migrations/${file}`, "utf8")).replace(
      'CREATE EXTENSION IF NOT EXISTS "pgcrypto";',
      "",
    );
    await pg.exec(sql);
  }
  process.env.BETTER_AUTH_SECRET =
    "test-only-secret-that-is-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  auth = configureAuth(
    drizzleAdapter(drizzle(pg), {
      provider: "pg",
      schema: {
        user: schema.baUser,
        session: schema.baSession,
        account: schema.baAccount,
        verification: schema.baVerification,
        rateLimit: schema.baRateLimit,
      },
    }),
  );
  const hash = await hashPassword("test-only-password-123");
  for (const role of ["admin", "customer"]) {
    await pg.query(
      "INSERT INTO ba_user (id, name, email, role) VALUES ($1, $1, $2, $1)",
      [role, `${role}@example.com`],
    );
    await pg.query(
      "INSERT INTO ba_account (id, account_id, user_id, provider_id, password) VALUES ($1, $1, $1, 'credential', $2)",
      [role, hash],
    );
  }
});
after(async () => {
  await pg.close();
});

test("migrations enable RLS on every application table with no public policies", async () => {
  const tables = await pg.query<{ relname: string; relrowsecurity: boolean }>(
    "SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind='r'",
  );
  assert.ok(tables.rows.length >= 25);
  assert.ok(tables.rows.every((t) => t.relrowsecurity));
  assert.equal(
    (await pg.query("SELECT * FROM pg_policies WHERE schemaname='public'")).rows
      .length,
    0,
  );
});
test("Better Auth signs in, resolves a session, and revokes it on sign-out", async () => {
  const response = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost:3000",
      },
      body: JSON.stringify({
        email: "admin@example.com",
        password: "test-only-password-123",
      }),
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  const cookie = response.headers.get("set-cookie")!;
  assert.ok(cookie.includes("HttpOnly"));
  const headers = new Headers({ cookie, origin: "http://localhost:3000" });
  const session = await auth.api.getSession({ headers });
  assert.equal(session?.user.role, "admin");
  assert.ok(isAdmin(session?.user));
  await auth.api.signOut({ headers });
  assert.equal(await auth.api.getSession({ headers }), null);
});
test("public sign-up, bad passwords, and untrusted auth origins are rejected", async () => {
  for (const [path, origin, body] of [
    [
      "sign-up/email",
      "http://localhost:3000",
      {
        name: "Intruder",
        email: "new@example.com",
        password: "password-long-enough",
        role: "admin",
      },
    ],
    [
      "sign-in/email",
      "http://localhost:3000",
      { email: "admin@example.com", password: "wrong-password" },
    ],
    [
      "sign-in/email",
      "https://untrusted.example",
      { email: "admin@example.com", password: "test-only-password-123" },
    ],
  ] as const) {
    const response = await auth.handler(
      new Request(`http://localhost:3000/api/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      }),
    );
    assert.ok(response.status >= 400, `${path} must fail`);
  }
});
test("role guard denies customers, banned administrators, and anonymous users", () => {
  assert.equal(isAdmin({ role: "customer" }), false);
  assert.equal(isAdmin({ role: "admin", banned: true }), false);
  assert.equal(isAdmin(null), false);
  assert.equal(isAdmin({ role: "admin", banned: false }), true);
});
test("validation rejects negative stock, illegal status, hierarchy identifiers and unsafe URLs", () => {
  assert.equal(
    schemas.setProductStatus.safeParse({
      id: crypto.randomUUID(),
      status: "published",
    }).success,
    false,
  );
  assert.equal(
    schemas.setVariantStock.safeParse({
      productId: crypto.randomUUID(),
      variantId: crypto.randomUUID(),
      newStock: -1,
      expectedStock: 0,
      type: "restock",
      reason: "test",
    }).success,
    false,
  );
  assert.equal(
    schemas.saveCategory.safeParse({
      id: "not-a-uuid",
      name: "test",
      slug: "test",
      parentId: null,
      description: "",
      image: "javascript:alert(1)",
      status: "active",
      sortOrder: 0,
    }).success,
    false,
  );
});
test("database rejects oversold stock and calculates immutable line totals", async () => {
  const [{ id: product }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO products (name, slug) VALUES ('Test', 'test') RETURNING id",
    )
  ).rows;
  const [{ id: variant }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO product_variants (product_id, sku, name, price) VALUES ($1, 'TEST-M', 'M', 100) RETURNING id",
      [product],
    )
  ).rows;
  await pg.query(
    "INSERT INTO inventory (variant_id, quantity_on_hand) VALUES ($1, 5)",
    [variant],
  );
  await assert.rejects(() =>
    pg.query("UPDATE inventory SET quantity_reserved=6 WHERE variant_id=$1", [
      variant,
    ]),
  );
  const [{ id: customer }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO customers (email) VALUES ('buyer@example.com') RETURNING id",
    )
  ).rows;
  const [{ id: order }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO orders (customer_id) VALUES ($1) RETURNING id",
      [customer],
    )
  ).rows;
  const line = await pg.query<{ line_total: string }>(
    "INSERT INTO order_items (order_id, variant_id, sku, product_name, variant_name, unit_price, quantity) VALUES ($1, $2, 'TEST-M', 'Test', 'M', 100, 3) RETURNING line_total",
    [order, variant],
  );
  assert.equal(Number(line.rows[0].line_total), 300);
  await assert.rejects(() =>
    pg.query("UPDATE orders SET total=1 WHERE id=$1", [order]),
  );
  await assert.rejects(() =>
    pg.query(
      "UPDATE orders SET has_engraving=true, payment_method_id=(SELECT id FROM payment_methods WHERE code='cod') WHERE id=$1",
      [order],
    ),
  );
});

test("admin mutations persist normalized data, audit stock and atomically review payments", async () => {
  const { mutate } = await import("../src/server/mutations");
  const { getSnapshot } = await import("../src/server/snapshot");
  // PGlite implements the same Drizzle transaction/query operations used by the repository.
  const db = drizzle(pg) as unknown as ReturnType<
    typeof import("../src/db").getDb
  >;
  const categoryId = crypto.randomUUID();
  const productId = crypto.randomUUID();
  const colorId = crypto.randomUUID();
  const variantId = crypto.randomUUID();
  await mutate(
    "saveCategory",
    {
      id: categoryId,
      name: "Scrubs",
      slug: "scrubs",
      parentId: null,
      description: "",
      image: "",
      status: "active",
      sortOrder: 0,
    },
    "admin",
    db,
  );
  const product = {
    id: productId,
    name: "Navy scrub",
    slug: "navy-scrub",
    description: "",
    categoryId,
    brand: "ScrubX",
    gender: "unisex",
    material: "Cotton",
    status: "active",
    engraveable: true,
    updatedAt: new Date().toISOString(),
    colors: [{ id: colorId, name: "Navy", hex: "#123456" }],
    images: [],
    variants: [
      {
        id: variantId,
        colorId,
        name: "Navy / M",
        sku: "NAVY-M",
        size: "M",
        price: 200,
        compareAtPrice: null,
        stock: 10,
        reserved: 0,
        reorderLevel: 5,
        active: true,
      },
    ],
  };
  await mutate("saveProduct", product, "admin", db);
  let state = await getSnapshot(db);
  assert.equal(
    state.products.find((p) => p.id === productId)?.variants[0].stock,
    10,
  );
  assert.equal(
    state.inventoryMovements.filter((m) => m.variantId === variantId).length,
    1,
  );
  await mutate(
    "setVariantStock",
    {
      productId,
      variantId,
      newStock: 12,
      expectedStock: 10,
      type: "restock",
      reason: "Delivery",
    },
    "admin",
    db,
  );
  await assert.rejects(
    () =>
      mutate(
        "setVariantStock",
        {
          productId,
          variantId,
          newStock: 13,
          expectedStock: 10,
          type: "restock",
          reason: "Stale update",
        },
        "admin",
        db,
      ),
    /Stock changed/,
  );
  // A stale product form cannot overwrite a later stock adjustment.
  await assert.rejects(
    () =>
      mutate(
        "saveProduct",
        {
          ...product,
          updatedAt: state.products.find((p) => p.id === productId)!.updatedAt,
        },
        "admin",
        db,
      ),
    /Inventory page/,
  );
  const [{ id: customerId }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO customers (email, first_name) VALUES ('payment@example.com', 'Buyer') RETURNING id",
    )
  ).rows;
  const [{ id: orderId }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO orders (customer_id, status, subtotal, total, payment_method_id) VALUES ($1, 'payment_submitted', 400, 400, (SELECT id FROM payment_methods WHERE code='bank')) RETURNING id",
      [customerId],
    )
  ).rows;
  await pg.query(
    "INSERT INTO order_items (order_id, variant_id, sku, product_name, variant_name, unit_price, quantity) VALUES ($1, $2, 'NAVY-M', 'Navy scrub', 'M', 200, 2)",
    [orderId, variantId],
  );
  await pg.query(
    "UPDATE inventory SET quantity_reserved=2 WHERE variant_id=$1",
    [variantId],
  );
  const [{ id: paymentId }] = (
    await pg.query<{ id: string }>(
      "INSERT INTO payments (order_id, payment_method_id, status, amount) VALUES ($1, (SELECT id FROM payment_methods WHERE code='bank'), 'awaiting_verification', 400) RETURNING id",
      [orderId],
    )
  ).rows;
  await mutate("approvePayment", { id: paymentId }, "admin", db);
  await assert.rejects(
    () => mutate("approvePayment", { id: paymentId }, "admin", db),
    /already reviewed/,
  );
  state = await getSnapshot(db);
  assert.equal(state.orders.find((o) => o.id === orderId)?.status, "confirmed");
  assert.equal(
    state.orders.find((o) => o.id === orderId)?.paymentStatus,
    "approved",
  );
  await mutate(
    "setOrderStatus",
    { id: orderId, status: "processing" },
    "admin",
    db,
  );
  await mutate(
    "setOrderStatus",
    { id: orderId, status: "shipped" },
    "admin",
    db,
  );
  await assert.rejects(
    () =>
      mutate(
        "setOrderStatus",
        { id: orderId, status: "cancelled" },
        "admin",
        db,
      ),
    /Cannot change/,
  );
  state = await getSnapshot(db);
  assert.equal(
    state.products.find((p) => p.id === productId)?.variants[0].stock,
    10,
  );
  assert.equal(
    state.products.find((p) => p.id === productId)?.variants[0].reserved,
    0,
  );
  await mutate("deleteProduct", { id: productId }, "admin", db);
  assert.equal(
    (await getSnapshot(db)).products.some((p) => p.id === productId),
    false,
  );
  assert.equal(
    (await pg.query("SELECT id FROM products WHERE id=$1", [productId])).rows
      .length,
    1,
  );
});

test("API guard validates real Better Auth sessions and rejects cross-origin writes", async () => {
  await pg.query("DELETE FROM ba_rate_limit");
  const { requireAdmin, checkOrigin, HttpError } =
    await import("../src/server/access");
  await assert.rejects(
    () => requireAdmin(new Headers(), auth),
    (e: unknown) => e instanceof HttpError && e.status === 401,
  );
  for (const role of ["admin", "customer"]) {
    const response = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          email: `${role}@example.com`,
          password: "test-only-password-123",
        }),
      }),
    );
    assert.equal(response.status, 200);
    const headers = new Headers({
      cookie: response.headers.get("set-cookie")!,
    });
    if (role === "admin")
      assert.equal((await requireAdmin(headers, auth)).user.role, "admin");
    else
      await assert.rejects(
        () => requireAdmin(headers, auth),
        (e: unknown) => e instanceof HttpError && e.status === 403,
      );
  }
  assert.throws(
    () =>
      checkOrigin(
        new Request("http://localhost:3000/api/admin/saveProduct", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    /Untrusted/,
  );
  assert.throws(
    () =>
      checkOrigin(new Request("http://localhost:3000/api/admin/saveProduct")),
    /Untrusted/,
  );
  assert.doesNotThrow(() =>
    checkOrigin(
      new Request("http://localhost:3000/api/admin/saveProduct", {
        headers: { origin: "http://localhost:3000" },
      }),
    ),
  );
});
