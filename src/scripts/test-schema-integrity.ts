import fs from "node:fs";
import postgres from "postgres";

// Load environment variables
if (fs.existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
} else if (fs.existsSync(".env")) {
  process.loadEnvFile(".env");
}

interface TestAssertion {
  name: string;
  passed: boolean;
  message: string;
}

async function runIntegrityTests() {
  console.log("\n========================================================");
  console.log("   ScrubX Live Schema Integrity & Business Rule Tests  ");
  console.log("     (All operations execute inside ROLLED-BACK TX)     ");
  console.log("========================================================\n");

  const connectionString =
    process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL || "";

  if (!connectionString.trim()) {
    console.error("Error: DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 1,
    connect_timeout: 15,
  });

  const assertions: TestAssertion[] = [];

  try {
    // Begin transaction
    await client.begin(async (tx) => {
      // Helper for negative testing using savepoints
      async function expectRejection(
        testName: string,
        operation: () => Promise<unknown>,
        expectedErrorKeyword: string
      ) {
        await tx`SAVEPOINT test_savepoint`;
        try {
          await operation();
          await tx`RELEASE SAVEPOINT test_savepoint`;
          assertions.push({
            name: testName,
            passed: false,
            message: "Expected operation to fail, but it succeeded unexpectedly.",
          });
        } catch (err: unknown) {
          await tx`ROLLBACK TO SAVEPOINT test_savepoint`;
          const msg = (err as Error).message;
          const matched = msg
            .toLowerCase()
            .includes(expectedErrorKeyword.toLowerCase());
          assertions.push({
            name: testName,
            passed: matched,
            message: matched
              ? `Correctly rejected: ${msg}`
              : `Threw unexpected error message: ${msg}`,
          });
        }
      }

      // ----------------------------------------------------------------------
      // 0. SEED FIXTURES FOR TRANSACTION
      // ----------------------------------------------------------------------
      const [testUser] = await tx<{ id: string }[]>`
        INSERT INTO ba_user (id, name, email, role)
        VALUES ('test_usr_' || gen_random_uuid(), 'Test Staff', 'staff_test@scrubx.pk', 'staff')
        RETURNING id;
      `;

      const [testCustomer] = await tx<{ id: string }[]>`
        INSERT INTO customers (user_id, email, first_name, last_name, phone)
        VALUES (${testUser.id}, 'customer_test@scrubx.pk', 'Dr. Ahmed', 'Raza', '+923001234567')
        RETURNING id;
      `;

      const [codPaymentMethod] = await tx<{ id: string }[]>`
        INSERT INTO payment_methods (code, name, type, allowed_with_engraving)
        VALUES ('test_cod_' || gen_random_uuid(), 'Test Cash on Delivery', 'cod', false)
        RETURNING id;
      `;

      const [onlinePaymentMethod] = await tx<{ id: string }[]>`
        INSERT INTO payment_methods (code, name, type, allowed_with_engraving)
        VALUES ('test_jazzcash_' || gen_random_uuid(), 'Test JazzCash', 'wallet', true)
        RETURNING id;
      `;

      const [testCategory] = await tx<{ id: string }[]>`
        INSERT INTO product_categories (name, slug)
        VALUES ('Test Category ' || gen_random_uuid(), 'test-category-' || gen_random_uuid())
        RETURNING id;
      `;

      const [testProduct] = await tx<{ id: string }[]>`
        INSERT INTO products (name, slug, category_id, is_engravable, status)
        VALUES ('Test Classic Scrub', 'test-classic-scrub-' || gen_random_uuid(), ${testCategory.id}, true, 'active')
        RETURNING id;
      `;

      const [testColor] = await tx<{ id: string }[]>`
        INSERT INTO product_colors (product_id, name, hex_code)
        VALUES (${testProduct.id}, 'Navy Blue', '#000080')
        RETURNING id;
      `;

      // ----------------------------------------------------------------------
      // TEST 1: Business Rule Trigger - Reject COD with Engraved Orders
      // ----------------------------------------------------------------------
      console.log("1. Testing COD + Engraving Trigger Prohibition...");
      await expectRejection(
        "1. COD with Engraving Trigger Prohibition",
        async () => {
          await tx`
            INSERT INTO orders (
              customer_id, 
              status, 
              has_engraving, 
              payment_method_id, 
              subtotal, 
              engraving_total, 
              total,
              shipping_address
            ) VALUES (
              ${testCustomer.id},
              'awaiting_payment',
              true,
              ${codPaymentMethod.id},
              2500.00,
              500.00,
              3000.00,
              '{"fullName": "Dr. Ahmed", "phone": "03001234567", "addressLine1": "Aga Khan Hospital", "city": "Karachi", "country": "PK"}'::jsonb
            );
          `;
        },
        "Custom engraved orders cannot be placed with Cash on Delivery"
      );

      // ----------------------------------------------------------------------
      // TEST 2: Order Number Trigger & Sequence SX-XXXX Generation
      // ----------------------------------------------------------------------
      console.log("2. Testing Order Number Sequence Default Generation...");
      const [orderResult] = await tx<{ id: string; order_number: string }[]>`
        INSERT INTO orders (
          customer_id, 
          status, 
          has_engraving, 
          payment_method_id, 
          subtotal, 
          total,
          shipping_address
        ) VALUES (
          ${testCustomer.id},
          'awaiting_payment',
          false,
          ${onlinePaymentMethod.id},
          2500.00,
          2500.00,
          '{"fullName": "Dr. Ahmed", "phone": "03001234567", "addressLine1": "Aga Khan Hospital", "city": "Karachi", "country": "PK"}'::jsonb
        )
        RETURNING id, order_number;
      `;

      const orderNumberGenerated =
        Boolean(orderResult?.order_number) &&
        orderResult.order_number.startsWith("SX-");

      assertions.push({
        name: "2. Order Number Default Sequence (SX-XXXX)",
        passed: orderNumberGenerated,
        message: orderNumberGenerated
          ? `Generated human-readable order number: '${orderResult.order_number}'`
          : `Failed: order_number was '${orderResult?.order_number}'`,
      });

      // ----------------------------------------------------------------------
      // TEST 3: Stored Generated Column line_total on order_items
      // ----------------------------------------------------------------------
      console.log("3. Testing order_items.line_total Generated Column...");
      // Part A: Explicit insertion into generated column MUST be rejected by PostgreSQL
      await expectRejection(
        "3a. Reject Explicit Insert into Stored Generated Column (line_total)",
        async () => {
          await tx`
            INSERT INTO order_items (
              order_id, sku, product_name, variant_name, unit_price, quantity, line_total
            ) VALUES (
              ${orderResult.id}, 'SX-TEST-SKU', 'Test Scrub Top', 'Navy / M', 1500.00, 3, 9999.00
            );
          `;
        },
        "cannot insert a non-default value into column \"line_total\""
      );

      // Part B: Omitting line_total computes unit_price * quantity automatically
      const [insertedItem] = await tx<{ line_total: string }[]>`
        INSERT INTO order_items (
          order_id, sku, product_name, variant_name, unit_price, quantity
        ) VALUES (
          ${orderResult.id}, 'SX-TEST-SKU', 'Test Scrub Top', 'Navy / M', 1500.00, 3
        )
        RETURNING line_total;
      `;

      const lineTotalCorrect = parseFloat(insertedItem.line_total) === 4500.0;
      assertions.push({
        name: "3b. Automatic Calculation of line_total (1500.00 * 3 = 4500.00)",
        passed: lineTotalCorrect,
        message: lineTotalCorrect
          ? `PostgreSQL computed line_total: Rs. ${insertedItem.line_total}`
          : `Calculation failed: got ${insertedItem.line_total}`,
      });

      // ----------------------------------------------------------------------
      // TEST 4: Inventory CHECK Constraint (Reserved > On Hand Rejection)
      // ----------------------------------------------------------------------
      console.log("4. Testing Inventory CHECK Constraint (Reserved <= On Hand)...");
      const [testVariant] = await tx<{ id: string }[]>`
        INSERT INTO product_variants (
          product_id, color_id, sku, name, size, price
        ) VALUES (
          ${testProduct.id}, ${testColor.id}, 'SX-TEST-M-' || gen_random_uuid(), 'Navy / M', 'M', 2500.00
        )
        RETURNING id;
      `;

      await expectRejection(
        "4. Inventory CHECK Constraint (reserved > on_hand rejected)",
        async () => {
          await tx`
            INSERT INTO inventory (variant_id, quantity_on_hand, quantity_reserved)
            VALUES (${testVariant.id}, 5, 10);
          `;
        },
        "violates check constraint"
      );

      // ----------------------------------------------------------------------
      // TEST 5: Composite Unique Constraint (product_id, color_id, size)
      // ----------------------------------------------------------------------
      console.log("5. Testing Composite Unique Constraint on product_variants...");
      await expectRejection(
        "5. Unique Constraint on (product, color, size)",
        async () => {
          // Attempt to insert duplicate variant with identical (product_id, color_id, size)
          await tx`
            INSERT INTO product_variants (
              product_id, color_id, sku, name, size, price
            ) VALUES (
              ${testProduct.id}, ${testColor.id}, 'SX-TEST-M-DUPE-' || gen_random_uuid(), 'Navy / M Duplicate', 'M', 2500.00
            );
          `;
        },
        "violates unique constraint"
      );

      // ----------------------------------------------------------------------
      // 6. ROLLBACK TO GUARANTEE ZERO POLLUTION
      // ----------------------------------------------------------------------
      console.log("\nRolling back transaction to ensure database stays 100% clean...");
      throw new Error("ROLLBACK_VERIFICATION_COMPLETE");
    });
  } catch (err: unknown) {
    const error = err as Error;
    if (error.message !== "ROLLBACK_VERIFICATION_COMPLETE") {
      console.error("Unexpected Transaction Failure:", error.message);
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  // --------------------------------------------------------------------------
  // PRINT RESULTS
  // --------------------------------------------------------------------------
  console.log("\n--------------------------------------------------------");
  let allPassed = true;
  for (const a of assertions) {
    const symbol = a.passed ? "✅ PASS" : "❌ FAIL";
    if (!a.passed) allPassed = false;
    console.log(`[${symbol}] ${a.name}`);
    console.log(`       -> ${a.message}`);
  }
  console.log("--------------------------------------------------------\n");

  if (!allPassed) {
    console.error("Schema Integrity Tests FAILED! Check results above.");
    process.exit(1);
  } else {
    console.log("All 5 Schema Integrity & Business Rule Tests PASSED with 100% SUCCESS!");
  }
}

runIntegrityTests();
