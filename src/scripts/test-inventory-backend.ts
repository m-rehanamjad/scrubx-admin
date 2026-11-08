import fs from "node:fs";

// Load environment variables for local testing
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

import { eq, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { baUser } from "../db/schema/auth.ts";
import {
  products,
  productCategories,
  productVariants,
} from "../db/schema/catalog.ts";
import { inventory, inventoryMovements } from "../db/schema/inventory.ts";
import { categoryService } from "../server/services/category.service.ts";
import { productService } from "../server/services/product.service.ts";
import { inventoryService } from "../server/services/inventory.service.ts";
import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
} from "../server/errors.ts";
import type { AdminContext } from "../server/auth.ts";

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
    failed++;
  }
}

async function runInventoryTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 📦 ScrubX Inventory Management Backend Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  const timestamp = Date.now();

  // Find real seeded super_admin in database or fallback
  let realAdminId: string | undefined = undefined;
  try {
    const [dbUser] = await db
      .select({ id: baUser.id })
      .from(baUser)
      .where(eq(baUser.email, "admin@scrubx.pk"))
      .limit(1);
    if (dbUser) realAdminId = dbUser.id;
  } catch {}

  const superAdmin: AdminContext = {
    id: realAdminId || "user_admin_01",
    email: "admin@scrubx.pk",
    name: "Super Admin",
    role: "super_admin",
  };

  const staffAdmin: AdminContext = {
    id: "user_staff_01",
    email: "staff@scrubx.pk",
    name: "Staff Member",
    role: "staff",
  };

  let testCatId: string | null = null;
  let testProductId: string | null = null;
  let healthyVariantId: string | null = null;
  let lowVariantId: string | null = null;
  let outVariantId: string | null = null;

  try {
    // =========================================================================
    // 0. Test Catalog Data Setup
    // =========================================================================
    console.log("Setup: Provisioning Isolated Test Catalog Data...");

    const testCategory = await categoryService.createCategory(
      {
        name: `Test Inv Category ${timestamp}`,
        slug: `test-inv-cat-${timestamp}`,
      },
      superAdmin
    );
    testCatId = testCategory.id;

    const skuHealthy = `SX-INV-${timestamp}-HL`;
    const skuLow = `SX-INV-${timestamp}-LW`;
    const skuOut = `SX-INV-${timestamp}-OT`;

    const testProduct = await productService.createProduct(
      {
        name: `Inventory Test Scrubs ${timestamp}`,
        slug: `test-inv-scrubs-${timestamp}`,
        categoryId: testCatId,
        gender: "unisex",
        status: "active",
        colors: [
          { id: "c-navy", name: "Steel Navy", hexCode: "#1B2A4A" },
        ],
        variants: [
          // 1. Healthy stock: 50 units (reorder level 10 -> healthy)
          {
            colorId: "c-navy",
            sku: skuHealthy,
            name: "Test Scrubs - Steel Navy - S",
            size: "S",
            price: 4500,
            stock: 50,
            reorderLevel: 10,
          },
          // 2. Low stock: 8 units (reorder level 10 -> low)
          {
            colorId: "c-navy",
            sku: skuLow,
            name: "Test Scrubs - Steel Navy - M",
            size: "M",
            price: 4500,
            stock: 8,
            reorderLevel: 10,
          },
          // 3. Out of stock: 0 units (reorder level 5 -> out)
          {
            colorId: "c-navy",
            sku: skuOut,
            name: "Test Scrubs - Steel Navy - L",
            size: "L",
            price: 4800,
            stock: 0,
            reorderLevel: 5,
          },
        ],
      },
      superAdmin
    );

    testProductId = testProduct.id;
    healthyVariantId = testProduct.variants.find((v) => v.sku === skuHealthy)!.id;
    lowVariantId = testProduct.variants.find((v) => v.sku === skuLow)!.id;
    outVariantId = testProduct.variants.find((v) => v.sku === skuOut)!.id;

    assert(Boolean(healthyVariantId && lowVariantId && outVariantId), "Catalog setup successfully generated 3 variants");

    // =========================================================================
    // 1. Fetch Inventory & Verify Computed Stock Statuses
    // =========================================================================
    console.log("\nCategory 1: Inventory Queries & Stock Status Computation");

    // 1.1 Fetch single variant
    const healthyInv = await inventoryService.getVariantInventory(healthyVariantId, superAdmin);
    assert(healthyInv.quantityOnHand === 50, "Healthy variant on hand is 50");
    assert(healthyInv.availableStock === 50, "Healthy variant available stock is 50");
    assert(healthyInv.stockStatus === "healthy", "Healthy variant computed status is 'healthy'");
    assert(healthyInv.stockValue === 50 * 4500, "Healthy variant stock value is PKR 225,000");

    const lowInv = await inventoryService.getVariantInventory(lowVariantId, superAdmin);
    assert(lowInv.quantityOnHand === 8, "Low variant on hand is 8");
    assert(lowInv.stockStatus === "low", "Low variant computed status is 'low' (8 <= 10)");

    const outInv = await inventoryService.getVariantInventory(outVariantId, superAdmin);
    assert(outInv.quantityOnHand === 0, "Out variant on hand is 0");
    assert(outInv.stockStatus === "out", "Out variant computed status is 'out'");

    // 1.2 Fetch all variants for product
    const productInv = await inventoryService.getProductInventory(testProductId, superAdmin);
    assert(productInv.length === 3, "getProductInventory returns all 3 variants");

    // 1.3 Global Inventory Summary Metrics
    const summary = await inventoryService.getInventorySummary(superAdmin);
    assert(summary.totalUnitsInStock >= 58, "Summary totalUnitsInStock reflects inserted units");
    assert(summary.totalStockValue >= 58 * 4500, "Summary totalStockValue reflects PKR value");
    assert(summary.lowStockCount >= 1, "Summary lowStockCount identifies low stock SKU");
    assert(summary.outOfStockCount >= 1, "Summary outOfStockCount identifies out of stock SKU");

    // =========================================================================
    // 2. Search & Status Filtering
    // =========================================================================
    console.log("\nCategory 2: Search, Filter & Pagination");

    // 2.1 Search by exact SKU
    const skuSearch = await inventoryService.getInventory(
      { q: skuLow },
      superAdmin
    );
    assert(skuSearch.items.length === 1 && skuSearch.items[0].variant.sku === skuLow, "Search by SKU returns exact target variant");

    // 2.2 Filter by Category
    const catSearch = await inventoryService.getInventory(
      { categoryId: testCatId },
      superAdmin
    );
    assert(catSearch.items.length === 3, "Filter by categoryId returns all 3 test variants");

    // 2.3 Filter by 'low' status
    const lowFilterResult = await inventoryService.getInventory(
      { categoryId: testCatId, status: "low" },
      superAdmin
    );
    assert(lowFilterResult.items.length === 1 && lowFilterResult.items[0].variant.sku === skuLow, "Filter status='low' returns only low stock variant");

    // 2.4 Filter by 'out' status
    const outFilterResult = await inventoryService.getInventory(
      { categoryId: testCatId, status: "out" },
      superAdmin
    );
    assert(outFilterResult.items.length === 1 && outFilterResult.items[0].variant.sku === skuOut, "Filter status='out' returns only out of stock variant");

    // 2.5 Filter by 'healthy' status
    const healthyFilterResult = await inventoryService.getInventory(
      { categoryId: testCatId, status: "healthy" },
      superAdmin
    );
    assert(healthyFilterResult.items.length === 1 && healthyFilterResult.items[0].variant.sku === skuHealthy, "Filter status='healthy' returns only healthy variant");

    // =========================================================================
    // 3. Manual Stock Adjustments & Restocking
    // =========================================================================
    console.log("\nCategory 3: Manual Stock Adjustments & Audit Movements");

    // 3.1 Mode 'add': Positive adjustment (+15)
    const addedInv = await inventoryService.adjustStock(
      {
        variantId: healthyVariantId,
        mode: "add",
        quantity: 15,
        reason: "adjustment",
      },
      superAdmin
    );
    assert(addedInv.quantityOnHand === 65, "Mode 'add' increases quantityOnHand to 65 (50 + 15)");

    // 3.2 Mode 'remove': Negative adjustment (-10)
    const removedInv = await inventoryService.adjustStock(
      {
        variantId: healthyVariantId,
        mode: "remove",
        quantity: 10,
        reason: "adjustment",
      },
      superAdmin
    );
    assert(removedInv.quantityOnHand === 55, "Mode 'remove' decreases quantityOnHand to 55 (65 - 10)");

    // 3.3 Mode 'set': Direct stock correction (set to 40)
    const setInv = await inventoryService.adjustStock(
      {
        variantId: healthyVariantId,
        mode: "set",
        quantity: 40,
        reason: "adjustment",
      },
      superAdmin
    );
    assert(setInv.quantityOnHand === 40, "Mode 'set' updates quantityOnHand directly to 40");

    // 3.4 Restocking: restock out-of-stock variant
    const restockedInv = await inventoryService.restock(
      {
        variantId: outVariantId,
        quantity: 30,
        notes: "Supplier shipment arrived",
      },
      superAdmin
    );
    assert(restockedInv.quantityOnHand === 30, "restock increases out-of-stock variant to 30");
    assert(restockedInv.stockStatus === "healthy", "Restocked variant status updated to 'healthy'");

    // 3.5 Verify Movement Log
    const movements = await inventoryService.getMovements(
      { variantId: outVariantId, reason: "restock" },
      superAdmin
    );
    assert(movements.items.length >= 1, "Movement history records restock entry");
    assert(movements.items[0].change === 30, "Movement change matches restocked quantity (+30)");
    assert(movements.items[0].createdByUser?.id === superAdmin.id, "Movement tracks admin user ID");

    // =========================================================================
    // 4. Order-Driven Stock Lifecycle Primitives
    // =========================================================================
    console.log("\nCategory 4: Order Lifecycle (Reserve, Commit, Cancel, Return)");

    // 4.1 Reserve stock (5 units on healthyVariantId = 40 on hand)
    const reserveRes = await inventoryService.reserveStock(healthyVariantId, 5);
    assert(reserveRes.success, "reserveStock succeeds");
    assert(reserveRes.reserved === 5, "reserveStock reports 5 units reserved");
    assert(reserveRes.available === 35, "Available stock dynamically decremented to 35 (40 - 5)");

    const postReserveInv = await inventoryService.getVariantInventory(healthyVariantId, superAdmin);
    assert(postReserveInv.quantityOnHand === 40, "OnHand unchanged upon reservation (40)");
    assert(postReserveInv.quantityReserved === 5, "QuantityReserved updated to 5");
    assert(postReserveInv.availableStock === 35, "Available stock computes to 35");

    // 4.2 Insufficient stock reservation rejection
    let threwOverReserve = false;
    try {
      await inventoryService.reserveStock(healthyVariantId, 100);
    } catch (err) {
      if (err instanceof ConflictError) threwOverReserve = true;
    }
    assert(threwOverReserve, "reserveStock rejects over-reservation with ConflictError");

    // 4.3 Release partial reserved stock (release 2 units)
    const releaseRes = await inventoryService.releaseReservedStock(healthyVariantId, 2);
    assert(releaseRes.newReserved === 3, "releaseReservedStock reduces reserved to 3 (5 - 2)");

    // 4.4 Commit order sale (commit 3 units sale)
    const commitRes = await inventoryService.commitOrderSale(
      healthyVariantId,
      3,
      undefined,
      superAdmin.id
    );
    assert(commitRes.newOnHand === 37, "commitOrderSale decrements quantityOnHand to 37 (40 - 3)");
    assert(commitRes.newReserved === 0, "commitOrderSale clears reserved units to 0");

    const [saleMovement] = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, healthyVariantId))
      .orderBy(inventoryMovements.createdAt);

    const latestMovements = await inventoryService.getMovements({ variantId: healthyVariantId }, superAdmin);
    assert(latestMovements.items[0].reason === "sale", "Movement log records 'sale' entry");
    assert(latestMovements.items[0].change === -3, "Movement change records negative sale (-3)");

    // 4.5 Cancel committed order (restore 1 unit)
    const cancelRes = await inventoryService.cancelOrderStock(
      healthyVariantId,
      1,
      undefined,
      true, // wasCommitted
      superAdmin.id
    );
    assert(cancelRes.success, "cancelOrderStock succeeds for committed order");

    const postCancelInv = await inventoryService.getVariantInventory(healthyVariantId, superAdmin);
    assert(postCancelInv.quantityOnHand === 38, "cancelOrderStock restores quantityOnHand to 38 (37 + 1)");

    // 4.6 Return item (customer return 1 unit)
    const returnRes = await inventoryService.returnOrderStock(
      healthyVariantId,
      1,
      undefined,
      superAdmin.id
    );
    assert(returnRes.newOnHand === 39, "returnOrderStock restores quantityOnHand to 39 (38 + 1)");

    // =========================================================================
    // 5. Invariant & Safety Guards (Negative Stock & Reservation Underflow)
    // =========================================================================
    console.log("\nCategory 5: Invariant & Negative Stock Safety Guards");

    // 5.1 Rejection of negative stock via remove
    let threwNegativeStock = false;
    try {
      await inventoryService.adjustStock(
        {
          variantId: healthyVariantId,
          mode: "remove",
          quantity: 1000,
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ValidationError) threwNegativeStock = true;
    }
    assert(threwNegativeStock, "adjustStock rejects removing more than current on-hand stock with ValidationError");

    // 5.2 Rejection of reducing stock below reserved quantity
    await inventoryService.reserveStock(healthyVariantId, 25);
    let threwReservedViolation = false;
    try {
      await inventoryService.adjustStock(
        {
          variantId: healthyVariantId,
          mode: "set",
          quantity: 10, // Attempting to set to 10 when 25 are reserved across open orders
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ValidationError) threwReservedViolation = true;
    }
    assert(threwReservedViolation, "adjustStock rejects setting stock below active reserved orders with ValidationError");

    // Release reservation
    await inventoryService.releaseReservedStock(healthyVariantId, 25);

    // =========================================================================
    // 6. Concurrency & Transactional Row-Level Locking Test
    // =========================================================================
    console.log("\nCategory 6: Concurrency & Transactional Row-Level Locking");

    const initialStockBeforeParallel = (await inventoryService.getVariantInventory(healthyVariantId, superAdmin)).quantityOnHand;

    // Execute 5 concurrent additions in parallel (+5 each = +25 total)
    const parallelAdjustments = Array.from({ length: 5 }).map(() =>
      inventoryService.adjustStock(
        {
          variantId: healthyVariantId!,
          mode: "add",
          quantity: 5,
          reason: "adjustment",
        },
        superAdmin
      )
    );

    await Promise.all(parallelAdjustments);
    const postParallelInv = await inventoryService.getVariantInventory(healthyVariantId, superAdmin);

    assert(
      postParallelInv.quantityOnHand === initialStockBeforeParallel + 25,
      `Parallel concurrent adjustments execute without lost updates (${initialStockBeforeParallel} -> ${postParallelInv.quantityOnHand})`
    );

    // =========================================================================
    // 7. Role Authorization Enforcement
    // =========================================================================
    console.log("\nCategory 7: Role Authorization Enforcement");

    let staffAdjustmentBlocked = false;
    try {
      await inventoryService.adjustStock(
        {
          variantId: healthyVariantId,
          mode: "add",
          quantity: 5,
        },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffAdjustmentBlocked = true;
    }
    assert(staffAdjustmentBlocked, "Staff role prohibited from manual stock adjustments");

    let staffRestockBlocked = false;
    try {
      await inventoryService.restock(
        {
          variantId: healthyVariantId,
          quantity: 10,
        },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffRestockBlocked = true;
    }
    assert(staffRestockBlocked, "Staff role prohibited from restocking");
  } catch (err: any) {
    console.error("❌ Critical test execution error:", err);
    failed++;
  } finally {
    console.log("\nPerforming test data cleanup...");
    if (testProductId) {
      try {
        await productService.deleteProduct(testProductId, superAdmin);
        console.log(`  Cleaned up test product '${testProductId}'.`);
      } catch (cleanErr) {
        console.warn("  Failed to clean up test product:", cleanErr);
      }
    }

    if (testCatId) {
      try {
        await db.delete(productCategories).where(eq(productCategories.id, testCatId));
        console.log(`  Cleaned up test category '${testCatId}'.`);
      } catch (cleanErr) {
        console.warn("  Failed to clean up test category:", cleanErr);
      }
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("═══════════════════════════════════════════════════════════");

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runInventoryTests();
