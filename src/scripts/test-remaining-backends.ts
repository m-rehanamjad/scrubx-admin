import fs from "node:fs";

// Load environment variables for local testing
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { baUser } from "../db/schema/auth.ts";
import {
  products,
  productCategories,
  productVariants,
  productColors,
} from "../db/schema/catalog.ts";
import { inventory, inventoryMovements } from "../db/schema/inventory.ts";
import { customers, addresses } from "../db/schema/customers.ts";
import { orders, orderItems, orderItemEngraving, orderNotes, orderCoupons } from "../db/schema/orders.ts";
import { coupons } from "../db/schema/coupons.ts";
import { shippingMethods } from "../db/schema/shipping.ts";
import { engravingOptions } from "../db/schema/engraving.ts";
import { paymentMethods } from "../db/schema/payment-methods.ts";
import { storeSettings } from "../db/schema/settings.ts";
import { payments } from "../db/schema/payments.ts";

import { couponService } from "../server/services/coupon.service.ts";
import { shippingService } from "../server/services/shipping.service.ts";
import { engravingService } from "../server/services/engraving.service.ts";
import { paymentMethodService } from "../server/services/payment-method.service.ts";
import { settingsService } from "../server/services/settings.service.ts";
import { orderService } from "../server/services/order.service.ts";

import {
  ValidationError,
  ConflictError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
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

async function runRemainingBackendsTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 📦 ScrubX Phase 6D Remaining Backends Test Suite");
  console.log("═══════════════════════════════════════════════════════════\n");

  const timestamp = Date.now();

  // 1. Identify Seeded Admin
  let realAdminId: string | undefined = undefined;
  try {
    const [existingUser] = await db
      .select()
      .from(baUser)
      .where(eq(baUser.email, "admin@scrubx.pk"))
      .limit(1);

    if (existingUser) {
      realAdminId = existingUser.id;
    }
  } catch (err) {
    console.warn("Could not query ba_user, using fallback UUID for test contexts.");
  }

  const superAdmin: AdminContext = {
    id: realAdminId || "00000000-0000-0000-0000-000000000001",
    email: "admin@scrubx.pk",
    name: "Master Admin",
    role: "super_admin",
  };

  const staffAdmin: AdminContext = {
    id: realAdminId || "00000000-0000-0000-0000-000000000001",
    email: "staff@scrubx.pk",
    name: "Staff Member",
    role: "staff",
  };

  // Test tracking for cleanup
  const createdCouponIds: string[] = [];
  const createdShippingIds: string[] = [];
  const createdEngravingIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdCustomerIds: string[] = [];
  let testProductId: string | null = null;
  let testVariantId: string | null = null;
  let testCategoryId: string | null = null;

  try {
    console.log("Setup: Provisioning Isolated Test Data...");

    // Create Category & Product for Order integration tests
    const [category] = await db
      .insert(productCategories)
      .values({
        name: `Test Scrub Category ${timestamp}`,
        slug: `test-cat-${timestamp}`,
      })
      .returning();
    testCategoryId = category.id;

    const [product] = await db
      .insert(products)
      .values({
        name: `Test Scrub Suit ${timestamp}`,
        slug: `test-scrub-${timestamp}`,
        categoryId: category.id,
        status: "active",
      })
      .returning();
    testProductId = product.id;

    const [variant] = await db
      .insert(productVariants)
      .values({
        productId: product.id,
        name: `Test Scrub - M - ${timestamp}`,
        sku: `SKU-6D-${timestamp}`,
        size: "M",
        price: "4000.00",
        isActive: true,
      })
      .returning();
    testVariantId = variant.id;

    await db.insert(inventory).values({
      variantId: variant.id,
      quantityOnHand: 50,
      quantityReserved: 0,
    });

    // Create a registered customer for order tests
    const [customer] = await db
      .insert(customers)
      .values({
        email: `customer6d_${timestamp}@example.com`,
        firstName: "Test",
        lastName: "Customer",
        phone: "+923001112233",
      })
      .returning();
    createdCustomerIds.push(customer.id);

    // Ensure canonical payment methods exist
    let bankMethod = (
      await db.select().from(paymentMethods).where(eq(paymentMethods.code, "bank_transfer")).limit(1)
    )[0];
    if (!bankMethod) {
      const [newBank] = await db
        .insert(paymentMethods)
        .values({
          code: "bank_transfer",
          name: "Bank Transfer",
          type: "bank_transfer",
          allowedWithEngraving: true,
          supportsProof: true,
        })
        .returning();
      bankMethod = newBank;
    }

    let codMethod = (
      await db.select().from(paymentMethods).where(eq(paymentMethods.code, "cod")).limit(1)
    )[0];
    if (!codMethod) {
      const [newCod] = await db
        .insert(paymentMethods)
        .values({
          code: "cod",
          name: "Cash on Delivery",
          type: "cod",
          allowedWithEngraving: false,
          supportsProof: false,
        })
        .returning();
      codMethod = newCod;
    }

    assert(Boolean(bankMethod && codMethod), "System payment methods (bank_transfer and cod) verified in database");

    // =========================================================================
    // Category 1: Coupon Management & Authoritative Redemption
    // =========================================================================
    console.log("\nCategory 1: Coupon Management & Authoritative Redemption");

    // 1. Create percentage coupon (15% off, max 1000 PKR, min order 2500)
    const pctCode = `TESTPCT${timestamp}`;
    const pctCoupon = await couponService.createCoupon(
      {
        code: pctCode,
        description: "15% off up to 1000 PKR",
        discountType: "percentage",
        discountValue: 15,
        minimumOrderAmount: 2500,
        maximumDiscountAmount: 1000,
        usageLimit: 5,
        usageLimitPerCustomer: 1,
        firstOrderOnly: false,
        startsAt: new Date(Date.now() - 3600000), // 1 hour ago
        expiresAt: new Date(Date.now() + 86400000 * 7), // 7 days from now
        isActive: true,
      },
      superAdmin
    );
    createdCouponIds.push(pctCoupon.id);

    assert(pctCoupon.code === pctCode, "Percentage coupon created with uppercase normalized code");
    assert(pctCoupon.discountType === "percentage", "Coupon discount type is percentage");
    assert(Number(pctCoupon.discountValue) === 15, "Coupon discount value is 15%");
    assert(Number(pctCoupon.maximumDiscountAmount) === 1000, "Coupon maximum discount is 1000 PKR");

    // 2. Create fixed discount coupon (500 PKR off, min order 3000)
    const fixedCode = `TESTFIX${timestamp}`;
    const fixedCoupon = await couponService.createCoupon(
      {
        code: fixedCode,
        description: "500 PKR flat discount",
        discountType: "fixed_amount",
        discountValue: 500,
        minimumOrderAmount: 3000,
        firstOrderOnly: true,
        startsAt: new Date(Date.now() - 3600000),
        isActive: true,
      },
      superAdmin
    );
    createdCouponIds.push(fixedCoupon.id);

    assert(fixedCoupon.code === fixedCode, "Fixed amount coupon created successfully");
    assert(Number(fixedCoupon.discountValue) === 500, "Fixed discount value matches 500 PKR");

    // 3. Reject duplicate coupon code with ConflictError (case-insensitive)
    let duplicateRejected = false;
    try {
      await couponService.createCoupon(
        {
          code: pctCode.toLowerCase(),
          discountType: "percentage",
          discountValue: 10,
        },
        superAdmin
      );
    } catch (err) {
      duplicateRejected = err instanceof ConflictError;
    }
    assert(duplicateRejected, "Duplicate coupon code rejected with ConflictError (case-insensitive)");

    // 4. Reject percentage > 100% with ValidationError
    let over100Rejected = false;
    try {
      await couponService.createCoupon(
        {
          code: `OVER100_${timestamp}`,
          discountType: "percentage",
          discountValue: 120,
        },
        superAdmin
      );
    } catch (err) {
      over100Rejected = err instanceof ValidationError;
    }
    assert(over100Rejected, "Percentage discount > 100% rejected with ValidationError");

    // 5. Future scheduled coupon handling
    const futureCode = `FUTURE_${timestamp}`;
    const futureCoupon = await couponService.createCoupon(
      {
        code: futureCode,
        discountType: "percentage",
        discountValue: 10,
        startsAt: new Date(Date.now() + 86400000), // starts tomorrow
        isActive: true,
      },
      superAdmin
    );
    createdCouponIds.push(futureCoupon.id);

    const futureRetrieved = await couponService.getCouponById(futureCoupon.id, staffAdmin);
    assert(futureRetrieved.computedStatus === "scheduled", "Future coupon correctly classified as 'scheduled'");

    let futureRedeemRejected = false;
    try {
      await db.transaction(async (tx) => {
        await couponService.validateAndLockForOrder(futureCode, 5000, customer.id, tx);
      });
    } catch (err) {
      futureRedeemRejected = err instanceof ValidationError && err.message.includes("scheduled");
    }
    assert(futureRedeemRejected, "Premature redemption of scheduled coupon strictly rejected with ValidationError");

    // 6. Expired coupon handling
    const expiredCode = `EXPIRED_${timestamp}`;
    const expiredCoupon = await couponService.createCoupon(
      {
        code: expiredCode,
        discountType: "percentage",
        discountValue: 10,
        startsAt: new Date(Date.now() - 86400000 * 10),
        expiresAt: new Date(Date.now() - 86400000), // expired yesterday
        isActive: true,
      },
      superAdmin
    );
    createdCouponIds.push(expiredCoupon.id);

    const expiredRetrieved = await couponService.getCouponById(expiredCoupon.id, staffAdmin);
    assert(expiredRetrieved.computedStatus === "expired", "Past expiry coupon correctly classified as 'expired'");

    let expiredRedeemRejected = false;
    try {
      await db.transaction(async (tx) => {
        await couponService.validateAndLockForOrder(expiredCode, 5000, customer.id, tx);
      });
    } catch (err) {
      expiredRedeemRejected = err instanceof ValidationError && err.message.includes("expired");
    }
    assert(expiredRedeemRejected, "Redemption of expired coupon strictly rejected with ValidationError");

    // 7. Partial update entity validation (check expiresAt > startsAt on existing record)
    let invalidPartialDateRejected = false;
    try {
      await couponService.updateCoupon(
        {
          id: pctCoupon.id,
          expiresAt: new Date(Date.now() - 86400000 * 2), // before existing startsAt
        },
        superAdmin
      );
    } catch (err) {
      invalidPartialDateRejected = err instanceof ValidationError;
    }
    assert(invalidPartialDateRejected, "Partial update validating merged entity rejects expiresAt <= startsAt");

    // 8. Order below minimum order amount check
    let minOrderRejected = false;
    try {
      await db.transaction(async (tx) => {
        await couponService.validateAndLockForOrder(pctCode, 1500, customer.id, tx); // min is 2500
      });
    } catch (err) {
      minOrderRejected = err instanceof ValidationError && err.message.includes("minimum requirement");
    }
    assert(minOrderRejected, "Order below minimum amount rejected during validation & lock");

    // 9. Percentage cap calculation check
    await db.transaction(async (tx) => {
      // 15% of 10,000 = 1500, but capped at 1000
      const res = await couponService.validateAndLockForOrder(pctCode, 10000, customer.id, tx);
      assert(res.discountAmount === 1000, "Percentage discount cap enforced accurately (1000 PKR)");
    });

    // 10. Phase 6C Authoritative Order Creation Integration & Exactly-Once Usage Increment
    const order1 = await orderService.createOrder(
      {
        customerId: customer.id,
        paymentMethodId: bankMethod.id,
        couponCode: pctCode,
        items: [
          {
            variantId: variant.id,
            quantity: 1, // 4000 PKR subtotal
          },
        ],
        shippingAddress: {
          fullName: "Test Customer",
          phone: "+923001112233",
          addressLine1: "123 Test Street",
          city: "Lahore",
          country: "Pakistan",
        },
      },
      superAdmin
    );
    createdOrderIds.push(order1.id);

    assert(order1.discountTotal === "600.00", "Order discount accurately snapshots 15% of 4000 PKR (600 PKR)");
    assert(order1.total === "3400.00", "Order net total reflects 4000 - 600 = 3400 PKR");

    // Check usageCount incremented exactly once
    const pctUpdated = await couponService.getCouponById(pctCoupon.id, staffAdmin);
    assert(pctUpdated.usageCount === 1, "Coupon usageCount incremented exactly once (0 -> 1)");

    // 11. Per-Customer Usage Limit Enforcement
    let perCustomerRejected = false;
    try {
      // Customer tries to use pctCoupon again (limit is 1)
      await orderService.createOrder(
        {
          customerId: customer.id,
          paymentMethodId: bankMethod.id,
          couponCode: pctCode,
          items: [{ variantId: variant.id, quantity: 1 }],
          shippingAddress: {
            fullName: "Test Customer",
            phone: "+923001112233",
            addressLine1: "123 Test Street",
            city: "Lahore",
            country: "Pakistan",
          },
        },
        superAdmin
      );
    } catch (err) {
      perCustomerRejected = err instanceof ValidationError && err.message.includes("maximum usage limit");
    }
    assert(perCustomerRejected, "Per-customer usage limit (1 per customer) strictly enforced on second order attempt");

    // 12. First-Order-Only Restriction Enforcement
    let firstOrderRejected = false;
    try {
      // Customer already has order1 (non-cancelled), tries to use fixedCoupon (firstOrderOnly: true)
      await orderService.createOrder(
        {
          customerId: customer.id,
          paymentMethodId: bankMethod.id,
          couponCode: fixedCode,
          items: [{ variantId: variant.id, quantity: 1 }],
          shippingAddress: {
            fullName: "Test Customer",
            phone: "+923001112233",
            addressLine1: "123 Test Street",
            city: "Lahore",
            country: "Pakistan",
          },
        },
        superAdmin
      );
    } catch (err) {
      firstOrderRejected = err instanceof ValidationError && err.message.includes("first-time customer");
    }
    assert(firstOrderRejected, "firstOrderOnly coupon rejected for customer with existing non-cancelled order");

    // 13. Safe Deactivation Guard on Deletion
    const deleteResult = await couponService.deleteCoupon(pctCoupon.id, superAdmin);
    assert(deleteResult.deleted === false, "Coupon with order usages is NOT hard deleted");
    assert(deleteResult.deactivated === true, "Coupon with order usages is safely deactivated (isActive = false)");

    const deactivatedCoupon = await couponService.getCouponById(pctCoupon.id, staffAdmin);
    assert(deactivatedCoupon.isActive === false, "Deactivated coupon has isActive = false in database");

    // 14. Transaction Rollback Safety on Order Failure
    const initialUsageCount = fixedCoupon.usageCount; // 0
    let rollbackVerified = false;
    try {
      await db.transaction(async (tx) => {
        // Validate and lock fixed coupon
        const validRes = await couponService.validateAndLockForOrder(fixedCode, 4000, `00000000-0000-0000-0000-000000000099`, tx);
        // Simulate order placement error
        throw new Error("Simulated downstream payment gateway crash");
      });
    } catch (err) {
      rollbackVerified = true;
    }
    assert(rollbackVerified, "Simulated order failure aborted transaction");
    const fixedAfterRollback = await couponService.getCouponById(fixedCoupon.id, staffAdmin);
    assert(fixedAfterRollback.usageCount === initialUsageCount, "Failed order creation transaction rolled back coupon usage count");

    // =========================================================================
    // Category 2: Shipping Methods & Delivery Thresholds
    // =========================================================================
    console.log("\nCategory 2: Shipping Methods & Delivery Thresholds");

    // 1. Create shipping method with delivery window and free shipping threshold
    const shippingMethod = await shippingService.createShippingMethod(
      {
        name: `TCS Express ${timestamp}`,
        description: "Express 2-5 business days delivery across Pakistan",
        price: 350,
        freeAbove: 5000,
        estimatedDays: 3,
        minDays: 2,
        maxDays: 5,
        isActive: true,
        sortOrder: 1,
      },
      superAdmin
    );
    createdShippingIds.push(shippingMethod.id);

    assert(shippingMethod.name === `TCS Express ${timestamp}`, "Shipping method created successfully");
    assert(Number(shippingMethod.price) === 350, "Shipping standard price matches 350 PKR");
    assert(Number(shippingMethod.freeAbove) === 5000, "Shipping free threshold matches 5000 PKR");
    assert(shippingMethod.minDays === 2 && shippingMethod.maxDays === 5, "Shipping delivery window matches 2-5 days");

    // 2. Reject invalid delivery window (minDays > maxDays)
    let invalidWindowRejected = false;
    try {
      await shippingService.createShippingMethod(
        {
          name: `Invalid Courier ${timestamp}`,
          price: 200,
          minDays: 5,
          maxDays: 2,
        },
        superAdmin
      );
    } catch (err) {
      invalidWindowRejected = err instanceof ValidationError;
    }
    assert(invalidWindowRejected, "Shipping method with minDays > maxDays rejected with ValidationError");

    // 3. Partial update entity validation (update minDays to 7 when existing maxDays is 5)
    let invalidPartialWindowRejected = false;
    try {
      await shippingService.updateShippingMethod(
        {
          id: shippingMethod.id,
          minDays: 7, // existing maxDays is 5
        },
        superAdmin
      );
    } catch (err) {
      invalidPartialWindowRejected = err instanceof ValidationError;
    }
    assert(invalidPartialWindowRejected, "Partial shipping update validating merged entity rejects minDays > maxDays");

    // 4. Validate shipping cost calculation helper
    const costBelow = shippingService.calculateShippingCost(shippingMethod, 3500);
    assert(costBelow === 350, "Shipping fee is 350 PKR when subtotal (3500) < freeAbove (5000)");

    const costAbove = shippingService.calculateShippingCost(shippingMethod, 6500);
    assert(costAbove === 0, "Shipping fee is 0 PKR (Free) when subtotal (6500) >= freeAbove (5000)");

    // 5. Reorder shipping methods atomically
    const secondShipping = await shippingService.createShippingMethod(
      {
        name: `Leopard Standard ${timestamp}`,
        price: 250,
        sortOrder: 2,
      },
      superAdmin
    );
    createdShippingIds.push(secondShipping.id);

    await shippingService.reorderShippingMethods(
      [
        { id: shippingMethod.id, sortOrder: 10 },
        { id: secondShipping.id, sortOrder: 5 },
      ],
      superAdmin
    );

    const reorderedMethods = await shippingService.getShippingMethods(undefined, staffAdmin);
    const m1 = reorderedMethods.find((m) => m.id === shippingMethod.id);
    const m2 = reorderedMethods.find((m) => m.id === secondShipping.id);
    assert(m1?.sortOrder === 10 && m2?.sortOrder === 5, "Shipping methods reordered atomically in database");

    // 6. Reject reorder request containing duplicate or nonexistent IDs
    let duplicateReorderRejected = false;
    try {
      await shippingService.reorderShippingMethods(
        [
          { id: shippingMethod.id, sortOrder: 1 },
          { id: shippingMethod.id, sortOrder: 2 },
        ],
        superAdmin
      );
    } catch (err) {
      duplicateReorderRejected = err instanceof ValidationError;
    }
    assert(duplicateReorderRejected, "Shipping reorder with duplicate IDs rejected with ValidationError");

    // 7. Toggle shipping active status
    const toggledShipping = await shippingService.toggleShippingMethodStatus(shippingMethod.id, false, superAdmin);
    assert(toggledShipping.isActive === false, "Shipping method toggled to inactive");

    // 8. Safe deactivation guard when orders reference shipping method
    // Attach shipping method to order1
    await db.update(orders).set({ shippingMethodId: shippingMethod.id }).where(eq(orders.id, order1.id));
    const deleteShippingRes = await shippingService.deleteShippingMethod(shippingMethod.id, superAdmin);
    assert(deleteShippingRes.deleted === false && deleteShippingRes.deactivated === true, "Shipping method referenced by orders is safely deactivated instead of deleted");

    // =========================================================================
    // Category 3: Engraving Options & Add-On Rules
    // =========================================================================
    console.log("\nCategory 3: Engraving Options & Add-On Rules");

    // 1. Create name engraving option with maxCharacters = 12
    const nameEngraving = await engravingService.createEngravingOption(
      {
        type: "name",
        name: `Doctor Name Engraving ${timestamp}`,
        description: "Laser embroidered name on chest pocket",
        price: 350,
        maxCharacters: 12,
        isActive: true,
      },
      superAdmin
    );
    createdEngravingIds.push(nameEngraving.id);

    assert(nameEngraving.type === "name", "Name engraving option created with type 'name'");
    assert(Number(nameEngraving.price) === 350, "Engraving price matches 350 PKR");
    assert(nameEngraving.maxCharacters === 12, "Name engraving max characters matches 12");

    // 2. Create logo engraving option with maxCharacters = null
    const logoEngraving = await engravingService.createEngravingOption(
      {
        type: "logo",
        name: `Hospital Logo Engraving ${timestamp}`,
        description: "Vector hospital insignia on sleeve",
        price: 600,
        isActive: true,
      },
      superAdmin
    );
    createdEngravingIds.push(logoEngraving.id);

    assert(logoEngraving.type === "logo", "Logo engraving option created with type 'logo'");
    assert(logoEngraving.maxCharacters === null, "Logo engraving max characters is null");

    // 3. Reject text engraving without positive maxCharacters
    let textWithoutCharsRejected = false;
    try {
      await engravingService.createEngravingOption(
        {
          type: "name",
          name: `Invalid Text Option ${timestamp}`,
          price: 200,
        },
        superAdmin
      );
    } catch (err) {
      textWithoutCharsRejected = err instanceof ValidationError;
    }
    assert(textWithoutCharsRejected, "Name engraving without positive maxCharacters rejected with ValidationError");

    // 4. Partial update validation: switch type from logo to name without maxCharacters
    let switchTypeWithoutCharsRejected = false;
    try {
      await engravingService.updateEngravingOption(
        {
          id: logoEngraving.id,
          type: "name", // existing maxCharacters is null
        },
        superAdmin
      );
    } catch (err) {
      switchTypeWithoutCharsRejected = err instanceof ValidationError;
    }
    assert(switchTypeWithoutCharsRejected, "Partial update switching type to 'name' without maxCharacters rejected");

    // 5. Update price and description
    const updatedEngraving = await engravingService.updateEngravingOption(
      {
        id: nameEngraving.id,
        price: 450,
        description: "Updated surgical precision laser engraving",
      },
      superAdmin
    );
    assert(Number(updatedEngraving.price) === 450, "Engraving price updated to 450 PKR");

    // 6. Toggle active status
    const toggledEngraving = await engravingService.toggleEngravingOptionStatus(nameEngraving.id, false, superAdmin);
    assert(toggledEngraving.isActive === false, "Engraving option toggled to inactive");

    // 7. Safe deactivation guard when historical order items reference engraving option
    const [orderItem] = await db.select().from(orderItems).where(eq(orderItems.orderId, order1.id)).limit(1);
    if (orderItem) {
      await db.insert(orderItemEngraving).values({
        orderItemId: orderItem.id,
        engravingOptionId: nameEngraving.id,
        text: "Dr. Rehan",
        price: "450.00",
      });
    }

    const deleteEngravingRes = await engravingService.deleteEngravingOption(nameEngraving.id, superAdmin);
    assert(deleteEngravingRes.deleted === false && deleteEngravingRes.deactivated === true, "Engraving option referenced by order items is safely deactivated instead of deleted");

    // =========================================================================
    // Category 4: Payment Method Settings & COD Engraving Rule
    // =========================================================================
    console.log("\nCategory 4: Payment Method Settings & COD Engraving Rule");

    // 1. Query payment methods list
    const allMethods = await paymentMethodService.getPaymentMethods(staffAdmin);
    const codPm = allMethods.find((m) => m.code === "cod");
    const bankPm = allMethods.find((m) => m.code === "bank_transfer");
    assert(Boolean(codPm && bankPm), "All system payment methods retrieved successfully");
    assert(codPm?.allowedWithEngraving === false, "Database invariant verified: COD has allowedWithEngraving = false");

    // 2. Update wallet account title, number, instructions
    const updatedBank = await paymentMethodService.updatePaymentMethod(
      {
        id: bankPm!.id,
        accountTitle: "ScrubX Private Limited",
        accountNumber: "PK36MEZN00012345678901",
        bankName: "Meezan Bank Limited",
        instructions: "Transfer total amount and upload screenshot proof on order page.",
      },
      superAdmin
    );
    assert(updatedBank.accountTitle === "ScrubX Private Limited", "Bank transfer account title updated");
    assert(updatedBank.bankName === "Meezan Bank Limited", "Bank name updated");

    // 3. CRITICAL: Attempt to set allowedWithEngraving = true on COD is strictly rejected
    let codEngravingRejected = false;
    try {
      await paymentMethodService.updatePaymentMethod(
        {
          id: codPm!.id,
          allowedWithEngraving: true,
        },
        superAdmin
      );
    } catch (err) {
      codEngravingRejected = err instanceof ValidationError && err.message.includes("Cash on Delivery cannot be enabled");
    }
    assert(codEngravingRejected, "CRITICAL: Attempt to enable allowedWithEngraving = true on COD strictly rejected with ValidationError");

    // 4. Partial update of COD without allowedWithEngraving maintains allowedWithEngraving = false
    const codUpdated = await paymentMethodService.updatePaymentMethod(
      {
        id: codPm!.id,
        instructions: "Pay exact cash to courier upon package delivery.",
      },
      superAdmin
    );
    assert(codUpdated.allowedWithEngraving === false, "Partial update of COD preserves allowedWithEngraving = false");

    // 5. Reorder payment methods atomically in transaction
    await paymentMethodService.reorderPaymentMethods(
      [
        { id: codPm!.id, sortOrder: 1 },
        { id: bankPm!.id, sortOrder: 2 },
      ],
      superAdmin
    );
    const reorderedPm = await paymentMethodService.getPaymentMethods(staffAdmin);
    const newCod = reorderedPm.find((m) => m.id === codPm!.id);
    assert(newCod?.sortOrder === 1, "Payment methods reordered atomically in transaction");

    // 6. Reject reorder with duplicate or invalid IDs
    let duplicatePmReorderRejected = false;
    try {
      await paymentMethodService.reorderPaymentMethods(
        [
          { id: codPm!.id, sortOrder: 1 },
          { id: codPm!.id, sortOrder: 2 },
        ],
        superAdmin
      );
    } catch (err) {
      duplicatePmReorderRejected = err instanceof ValidationError;
    }
    assert(duplicatePmReorderRejected, "Payment method reorder with duplicate IDs rejected with ValidationError");

    // 7. Toggle active status
    const toggledPm = await paymentMethodService.togglePaymentMethodStatus(bankPm!.id, true, superAdmin);
    assert(toggledPm.isActive === true, "Payment method toggled status verified");

    // =========================================================================
    // Category 5: Store Settings Management & Batch Updates
    // =========================================================================
    console.log("\nCategory 5: Store Settings Management & Batch Updates");

    // 1. Query store settings
    const allSettings = await settingsService.getAllSettings(staffAdmin);
    assert(Boolean(allSettings.store_name), "Store name retrieved in store settings");
    assert(allSettings.currency === "PKR", "Default currency 'PKR' retrieved");
    assert(typeof allSettings.payment_deadline_hours === "number" && allSettings.payment_deadline_hours > 0, "Payment deadline hours retrieved as positive integer");

    // 2. Update single setting via updateSetting
    const singleUpdate = await settingsService.updateSetting("store_name", "ScrubX Official Pakistan", superAdmin);
    assert(singleUpdate.value === "ScrubX Official Pakistan", "Single store setting updated via updateSetting");

    // 3. Execute atomic batch update (updateSettingsBatch)
    const batchUpdateResult = await settingsService.updateSettingsBatch(
      {
        store_name: "ScrubX Medical Apparel",
        whatsapp_number: "+92 300 9998877",
        support_email: "help@scrubx.pk",
        currency: "PKR",
        payment_deadline_hours: 48,
        order_confirmation_auto: true,
        low_stock_alerts: true,
        new_order_whatsapp: true,
      },
      superAdmin
    );

    assert(batchUpdateResult.store_name === "ScrubX Medical Apparel", "Batch update store_name persisted");
    assert(batchUpdateResult.whatsapp_number === "+92 300 9998877", "Batch update whatsapp_number persisted");
    assert(batchUpdateResult.currency === "PKR", "Batch update currency persisted");
    assert(batchUpdateResult.payment_deadline_hours === 48, "Batch update payment_deadline_hours persisted");

    // 4. Verify updatedBy tracks authenticated admin user ID
    const [rowInDb] = await db.select().from(storeSettings).where(eq(storeSettings.key, "whatsapp_number")).limit(1);
    assert(rowInDb.updatedBy === superAdmin.id, "Store setting record updatedBy tracks authenticated admin ID");

    // 5. Verify atomic rollback: if an invalid value is in batch update, no changes persist
    let batchRollbackVerified = false;
    const preRollbackName = batchUpdateResult.store_name;
    try {
      await settingsService.updateSettingsBatch(
        {
          store_name: "Should Not Persist",
          payment_deadline_hours: -5 as any, // Invalid negative hours
        },
        superAdmin
      );
    } catch (err) {
      batchRollbackVerified = err instanceof ValidationError;
    }
    assert(batchRollbackVerified, "Invalid batch value throws ValidationError and aborts batch update");

    const afterRollbackSettings = await settingsService.getAllSettings(staffAdmin);
    assert(afterRollbackSettings.store_name === preRollbackName, "Failed batch update completely rolled back (no partial persistence)");

    // 6. Verify partial batch update preserves unrelated existing settings
    await settingsService.updateSettingsBatch(
      {
        tagline: "Precision Engineered Scrubs",
      },
      superAdmin
    );
    const preservedSettings = await settingsService.getAllSettings(staffAdmin);
    assert(preservedSettings.tagline === "Precision Engineered Scrubs", "Partial batch updated tagline");
    assert(preservedSettings.whatsapp_number === "+92 300 9998877", "Unrelated setting whatsapp_number preserved");

    // =========================================================================
    // Category 6: Role Authorization Enforcement
    // =========================================================================
    console.log("\nCategory 6: Role Authorization Enforcement");

    // 1. Staff role authorized to query all 5 modules
    const staffCoupons = await couponService.getCoupons({ status: "all", page: 1, limit: 10, sortBy: "createdAt", sortOrder: "desc" }, staffAdmin);
    const staffShipping = await shippingService.getShippingMethods(undefined, staffAdmin);
    const staffEngraving = await engravingService.getEngravingOptions(undefined, staffAdmin);
    const staffPm = await paymentMethodService.getPaymentMethods(staffAdmin);
    const staffSettings = await settingsService.getAllSettings(staffAdmin);

    assert(
      Array.isArray(staffCoupons.items) &&
        Array.isArray(staffShipping) &&
        Array.isArray(staffEngraving) &&
        Array.isArray(staffPm) &&
        typeof staffSettings === "object",
      "Staff role authorized to query coupons, shipping, engraving, payment methods, and settings"
    );

    // 2. Staff role strictly prohibited from creating coupons
    let staffCouponCreateBlocked = false;
    try {
      await couponService.createCoupon(
        {
          code: `STAFF_CPN_${timestamp}`,
          discountType: "percentage",
          discountValue: 10,
        },
        staffAdmin
      );
    } catch (err) {
      staffCouponCreateBlocked = err instanceof AuthorizationError;
    }
    assert(staffCouponCreateBlocked, "Staff role strictly prohibited from creating coupons (AuthorizationError)");

    // 3. Staff role strictly prohibited from updating shipping methods
    let staffShippingUpdateBlocked = false;
    try {
      await shippingService.updateShippingMethod({ id: shippingMethod.id, price: 999 }, staffAdmin);
    } catch (err) {
      staffShippingUpdateBlocked = err instanceof AuthorizationError;
    }
    assert(staffShippingUpdateBlocked, "Staff role strictly prohibited from updating shipping methods");

    // 4. Staff role strictly prohibited from modifying engraving options
    let staffEngravingUpdateBlocked = false;
    try {
      await engravingService.updateEngravingOption({ id: nameEngraving.id, price: 999 }, staffAdmin);
    } catch (err) {
      staffEngravingUpdateBlocked = err instanceof AuthorizationError;
    }
    assert(staffEngravingUpdateBlocked, "Staff role strictly prohibited from modifying engraving options");

    // 5. Staff role strictly prohibited from modifying payment methods
    let staffPmUpdateBlocked = false;
    try {
      await paymentMethodService.updatePaymentMethod({ id: bankPm!.id, instructions: "hacked" }, staffAdmin);
    } catch (err) {
      staffPmUpdateBlocked = err instanceof AuthorizationError;
    }
    assert(staffPmUpdateBlocked, "Staff role strictly prohibited from modifying payment methods");

    // 6. Staff role strictly prohibited from updating store settings
    let staffSettingsUpdateBlocked = false;
    try {
      await settingsService.updateSetting("store_name", "Hacked Store", staffAdmin);
    } catch (err) {
      staffSettingsUpdateBlocked = err instanceof AuthorizationError;
    }
    assert(staffSettingsUpdateBlocked, "Staff role strictly prohibited from updating store settings");

    // 7. Staff role strictly prohibited from batch updating store settings
    let staffBatchUpdateBlocked = false;
    try {
      await settingsService.updateSettingsBatch({ store_name: "Hacked Store" }, staffAdmin);
    } catch (err) {
      staffBatchUpdateBlocked = err instanceof AuthorizationError;
    }
    assert(staffBatchUpdateBlocked, "Staff role strictly prohibited from batch updating store settings");

    // 8. Admin / Super Admin authorized for mutations
    const adminCouponToggle = await couponService.toggleCouponStatus(fixedCoupon.id, false, superAdmin);
    assert(adminCouponToggle.isActive === false, "Super Admin authorized to toggle coupon status");

  } finally {
    console.log("\nPerforming test data cleanup...");

    // Clean up created orders
    if (createdOrderIds.length > 0) {
      await db.delete(payments).where(inArray(payments.orderId, createdOrderIds));
      await db.delete(orderCoupons).where(inArray(orderCoupons.orderId, createdOrderIds));
      await db.delete(orderItemEngraving).where(
        inArray(
          orderItemEngraving.orderItemId,
          db.select({ id: orderItems.id }).from(orderItems).where(inArray(orderItems.orderId, createdOrderIds))
        )
      );
      await db.delete(orderItems).where(inArray(orderItems.orderId, createdOrderIds));
      await db.delete(orderNotes).where(inArray(orderNotes.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
      console.log(`  Cleaned up ${createdOrderIds.length} test order(s).`);
    }

    // Clean up test customer
    if (createdCustomerIds.length > 0) {
      await db.delete(addresses).where(inArray(addresses.customerId, createdCustomerIds));
      await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
      console.log(`  Cleaned up ${createdCustomerIds.length} test customer(s).`);
    }

    // Clean up test product, variants, inventory, category
    if (testVariantId) {
      await db.delete(inventoryMovements).where(eq(inventoryMovements.variantId, testVariantId));
      await db.delete(inventory).where(eq(inventory.variantId, testVariantId));
      await db.delete(productVariants).where(eq(productVariants.id, testVariantId));
    }
    if (testProductId) {
      await db.delete(products).where(eq(products.id, testProductId));
    }
    if (testCategoryId) {
      await db.delete(productCategories).where(eq(productCategories.id, testCategoryId));
    }

    // Clean up coupons
    if (createdCouponIds.length > 0) {
      await db.delete(orderCoupons).where(inArray(orderCoupons.couponId, createdCouponIds));
      await db.delete(coupons).where(inArray(coupons.id, createdCouponIds));
      console.log(`  Cleaned up ${createdCouponIds.length} test coupon(s).`);
    }

    // Clean up shipping methods
    if (createdShippingIds.length > 0) {
      await db.delete(shippingMethods).where(inArray(shippingMethods.id, createdShippingIds));
      console.log(`  Cleaned up ${createdShippingIds.length} test shipping method(s).`);
    }

    // Clean up engraving options
    if (createdEngravingIds.length > 0) {
      await db.delete(orderItemEngraving).where(inArray(orderItemEngraving.engravingOptionId, createdEngravingIds));
      await db.delete(engravingOptions).where(inArray(engravingOptions.id, createdEngravingIds));
      console.log(`  Cleaned up ${createdEngravingIds.length} test engraving option(s).`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` Summary: ${passed} Passed, ${failed} Failed`);
  console.log("═══════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runRemainingBackendsTests().catch((err) => {
  console.error("Critical test execution failure:", err);
  process.exit(1);
});
