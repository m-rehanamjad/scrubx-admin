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
  productColors,
  productImages,
} from "../db/schema/catalog.ts";
import { inventory, inventoryMovements } from "../db/schema/inventory.ts";
import { categoryService, type CategoryTreeNode } from "../server/services/category.service.ts";
import { productService } from "../server/services/product.service.ts";
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

async function runCatalogTests() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(" 🩺 ScrubX Product & Category Catalog Backend Test Suite");
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

  let parentCatId: string | null = null;
  let childCatId: string | null = null;
  let reassignTargetCatId: string | null = null;
  let createdProductId: string | null = null;

  try {
    // =========================================================================
    // 1. Category Service Tests
    // =========================================================================
    console.log("Category 1: Category Management & Hierarchy");

    // 1.1 Create Root Category
    const parentSlug = `test-cat-parent-${timestamp}`;
    const parentCategory = await categoryService.createCategory(
      {
        name: `Test Parent Uniforms ${timestamp}`,
        slug: parentSlug,
        description: "Parent category for scrubs suite testing",
        sortOrder: 1,
        isActive: true,
      },
      superAdmin
    );

    parentCatId = parentCategory.id;
    assert(Boolean(parentCategory.id), "createCategory creates root category", parentCategory.id);
    assert(parentCategory.slug === parentSlug, "Category slug matches input");

    // 1.2 Create Child Category
    const childSlug = `test-cat-child-${timestamp}`;
    const childCategory = await categoryService.createCategory(
      {
        name: `Test Men Tops ${timestamp}`,
        slug: childSlug,
        parentId: parentCatId,
        description: "Child subcategory for scrubs suite testing",
        sortOrder: 2,
        isActive: true,
      },
      superAdmin
    );

    childCatId = childCategory.id;
    assert(childCategory.parentId === parentCatId, "Child category correctly references parent");

    // 1.3 Hierarchy Tree Retrieval
    const tree = (await categoryService.getAllCategories(superAdmin, {
      tree: true,
    })) as CategoryTreeNode[];

    const parentInTree = tree.find((c) => c.id === parentCatId);
    assert(Boolean(parentInTree), "Category hierarchy tree contains root category");
    const childInParent = parentInTree?.children.some((c) => c.id === childCatId);
    assert(Boolean(childInParent), "Category hierarchy tree properly nests child category");

    // 1.4 Duplicate Slug Conflict
    let threwDuplicateCatSlug = false;
    try {
      await categoryService.createCategory(
        {
          name: "Duplicate Category",
          slug: parentSlug,
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ConflictError) threwDuplicateCatSlug = true;
    }
    assert(threwDuplicateCatSlug, "createCategory rejects duplicate slug with ConflictError");

    // 1.5 Circular Hierarchy Prevention
    let threwCircularHierarchy = false;
    try {
      await categoryService.updateCategory(
        {
          id: parentCatId,
          parentId: childCatId, // Attempting to make child the parent of its own parent
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ValidationError) threwCircularHierarchy = true;
    }
    assert(threwCircularHierarchy, "updateCategory rejects circular parent assignment with ValidationError");

    // 1.6 Category Status Toggle
    const toggled = await categoryService.toggleCategoryStatus(childCatId, superAdmin);
    assert(toggled?.isActive === false, "toggleCategoryStatus toggles active to false");
    const toggledBack = await categoryService.toggleCategoryStatus(childCatId, superAdmin);
    assert(toggledBack?.isActive === true, "toggleCategoryStatus toggles active back to true");

    // =========================================================================
    // 2. Product Creation & Deep Bundle Verification
    // =========================================================================
    console.log("\nCategory 2: Product Creation & Atomic Matrix Operations");

    const productSlug = `test-scrub-set-${timestamp}`;
    const skuNavyS = `SX-${timestamp}-NV-S`;
    const skuNavyM = `SX-${timestamp}-NV-M`;
    const skuTealM = `SX-${timestamp}-TL-M`;

    const createdProduct = await productService.createProduct(
      {
        name: `Signature Scrub Set ${timestamp}`,
        slug: productSlug,
        description: "Four-way stretch antimicrobial medical scrub set",
        categoryId: childCatId,
        brand: "ScrubX Signature",
        gender: "unisex",
        material: "72% Polyester, 21% Rayon, 7% Spandex",
        status: "active",
        isEngravable: true,
        isFeatured: true,
        colors: [
          { id: "temp-navy", name: "Royal Navy", hexCode: "#000080", sortOrder: 0 },
          { id: "temp-teal", name: "Deep Teal", hexCode: "#008080", sortOrder: 1 },
        ],
        variants: [
          {
            colorId: "temp-navy",
            sku: skuNavyS,
            name: "Signature Set - Royal Navy - Small",
            size: "S",
            price: 4950,
            compareAtPrice: 5500,
            stock: 25,
            reorderLevel: 5,
            isActive: true,
            attributes: { manual: false },
          },
          {
            colorId: "temp-navy",
            sku: skuNavyM,
            name: "Signature Set - Royal Navy - Medium",
            size: "M",
            price: 4950,
            compareAtPrice: 5500,
            stock: 40,
            reorderLevel: 10,
            isActive: true,
            attributes: { manual: false },
          },
          {
            colorId: "temp-teal",
            sku: skuTealM,
            name: "Signature Set - Deep Teal - Medium",
            size: "M",
            price: 5200,
            compareAtPrice: null,
            stock: 15,
            reorderLevel: 5,
            isActive: true,
            attributes: { manual: false },
          },
        ],
        images: [
          {
            imagekitFileId: `file-navy-${timestamp}`,
            url: "https://ik.imagekit.io/scrubx/products/navy-front.jpg",
            thumbnailUrl: "https://ik.imagekit.io/scrubx/products/tr:w-150/navy-front.jpg",
            altText: "Royal Navy Front View",
            colorId: "temp-navy",
            sortOrder: 0,
          },
          {
            imagekitFileId: `file-teal-${timestamp}`,
            url: "https://ik.imagekit.io/scrubx/products/teal-front.jpg",
            thumbnailUrl: "https://ik.imagekit.io/scrubx/products/tr:w-150/teal-front.jpg",
            altText: "Deep Teal Front View",
            colorId: "temp-teal",
            sortOrder: 1,
          },
        ],
      },
      superAdmin
    );

    createdProductId = createdProduct.id;
    assert(Boolean(createdProduct.id), "createProduct succeeds in atomic transaction", createdProduct.id);
    assert(createdProduct.colors.length === 2, "Product has 2 colors mapped and inserted");
    assert(createdProduct.variants.length === 3, "Product has 3 variants generated");
    assert(createdProduct.images.length === 2, "Product has 2 images linked");

    // 2.2 Verify Inventory Rows and Movements
    const variantNavyS = createdProduct.variants.find((v) => v.sku === skuNavyS);
    assert(variantNavyS?.stock === 25, "Variant S inventory quantity on hand matches 25");
    assert(variantNavyS?.reserved === 0, "Variant S reserved quantity initialized to 0");
    assert(variantNavyS?.price === 4950, "Variant S price matches numeric 4950");

    const [restockMovement] = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, variantNavyS!.id))
      .limit(1);

    assert(Boolean(restockMovement), "inventory_movements row created automatically on stock creation");
    assert(restockMovement?.change === 25, "Initial inventory movement change matches initial stock (+25)");
    assert(restockMovement?.reason === "restock", "Initial inventory movement reason is 'restock'");
    assert(restockMovement?.createdBy === superAdmin.id, "Inventory movement createdBy tracks admin ID");

    // 2.3 Verify Category Product Count
    const updatedChildCat = await categoryService.getCategoryById(childCatId, superAdmin);
    assert(updatedChildCat.productCount === 1, "Child category product count reflects newly created product (1)");

    // =========================================================================
    // 3. Search, Filtering, and Pagination
    // =========================================================================
    console.log("\nCategory 3: Catalog Listing, Filtering & Pagination");

    // 3.1 Search by keyword
    const searchResult = await productService.getProducts(
      {
        q: "Signature Scrub Set",
        page: 1,
        limit: 10,
      },
      superAdmin
    );

    const foundInSearch = searchResult.items.some((p) => p.id === createdProductId);
    assert(foundInSearch, "getProducts finds product by title keyword in search");
    assert(searchResult.pagination.totalItems >= 1, "Search returns valid total count");

    // 3.2 Filter by Category
    const catFiltered = await productService.getProducts(
      {
        categoryId: childCatId,
      },
      superAdmin
    );
    assert(
      catFiltered.items.every((p) => p.category?.id === childCatId),
      "getProducts categoryId filter restricts strictly to matching category"
    );

    // 3.3 Faceted filtering (Gender & InStock)
    const faceted = await productService.getProducts(
      {
        gender: "unisex",
        inStock: true,
        sortBy: "price",
        sortOrder: "asc",
      },
      superAdmin
    );
    assert(faceted.items.length > 0, "Faceted query returns matching in-stock unisex scrubs");

    // =========================================================================
    // 4. Product Updates & Stock Adjustment Reconciliation
    // =========================================================================
    console.log("\nCategory 4: Product Updates & Stock Reconciliation");

    const navySId = variantNavyS!.id;
    const newStockQuantity = 35; // +10 stock adjustment
    const otherVariants = createdProduct.variants.filter((v) => v.id !== navySId);

    const updatedProduct = await productService.updateProduct(
      {
        id: createdProductId,
        name: `Signature Scrub Set Updated ${timestamp}`,
        variants: [
          // Existing variant with updated stock:
          {
            id: navySId,
            sku: skuNavyS,
            name: "Signature Set - Royal Navy - Small (Adjusted)",
            size: "S",
            price: 5100, // Updated price
            stock: newStockQuantity,
            reorderLevel: 8,
          },
          // Keep other existing variants:
          ...otherVariants.map((v) => ({
            id: v.id,
            sku: v.sku,
            name: v.name,
            size: v.size || "M",
            price: v.price,
            stock: v.stock,
          })),
          // Add a brand new variant:
          {
            sku: `SX-${timestamp}-NV-L`,
            name: "Signature Set - Royal Navy - Large",
            size: "L",
            price: 5300,
            stock: 12,
            reorderLevel: 5,
          },
        ],
      },
      superAdmin
    );

    const updatedNavyS = updatedProduct.variants.find((v) => v.id === navySId);
    assert(updatedNavyS?.stock === 35, "Variant S updated stock reflected in product bundle (35)");
    assert(updatedNavyS?.price === 5100, "Variant S updated price reflected (5100)");
    assert(updatedProduct.variants.length === 4, "New variant added, bringing total variants to 4");

    // Verify stock adjustment movement
    const adjustmentMovements = await db
      .select()
      .from(inventoryMovements)
      .where(eq(inventoryMovements.variantId, navySId))
      .orderBy(inventoryMovements.createdAt);

    const lastMovement = adjustmentMovements[adjustmentMovements.length - 1];
    assert(lastMovement?.reason === "adjustment", "Inventory movement for stock change logged as 'adjustment'");
    assert(lastMovement?.change === 10, "Inventory adjustment delta calculated accurately (+10)");

    // =========================================================================
    // 5. Safe Category Deletion & Reassignment
    // =========================================================================
    console.log("\nCategory 5: Safe Category Deletion & Product Reassignment");

    // 5.1 Attempt delete without reassignment when products exist
    let threwSafeDeleteBlocked = false;
    try {
      await categoryService.deleteCategory(childCatId, { id: childCatId }, superAdmin);
    } catch (err) {
      if (err instanceof ConflictError) threwSafeDeleteBlocked = true;
    }
    assert(
      threwSafeDeleteBlocked,
      "deleteCategory blocks deletion of category with active products when reassignToCategoryId is missing"
    );

    // 5.2 Create reassignment target category
    const reassignCategory = await categoryService.createCategory(
      {
        name: `Reassignment Target ${timestamp}`,
        slug: `test-cat-reassign-${timestamp}`,
      },
      superAdmin
    );
    reassignTargetCatId = reassignCategory.id;

    // 5.3 Delete with reassignment
    const deleteResult = await categoryService.deleteCategory(
      childCatId,
      {
        id: childCatId,
        reassignToCategoryId: reassignTargetCatId,
      },
      superAdmin
    );

    assert(deleteResult.success, "deleteCategory with reassignment succeeds");
    assert(deleteResult.reassignedProductsCount === 1, "deleteCategory reports 1 reassigned product");

    // Verify product category is now updated
    const reassignedProduct = await productService.getProductById(createdProductId, superAdmin);
    assert(
      reassignedProduct.category?.id === reassignTargetCatId,
      "Product category reassigned to new target category successfully"
    );

    // =========================================================================
    // 6. Archival, Deletion & Transaction Atomicity
    // =========================================================================
    console.log("\nCategory 6: Archival, Deletion & Transaction Atomicity");

    // 6.1 Archive product
    const archived = await productService.archiveProduct(createdProductId, superAdmin);
    assert(archived.success, "archiveProduct succeeds");
    const archivedProduct = await productService.getProductById(createdProductId, superAdmin);
    assert(archivedProduct.status === "archived", "Archived product status is 'archived'");
    assert(Boolean(archivedProduct.deletedAt), "Archived product has deletedAt timestamp");

    // 6.2 Permanent delete product
    const hardDeleted = await productService.deleteProduct(createdProductId, superAdmin);
    assert(hardDeleted.success, "deleteProduct permanently deletes product");

    let productNotFound = false;
    try {
      await productService.getProductById(createdProductId, superAdmin);
    } catch (err) {
      if (err instanceof NotFoundError) productNotFound = true;
    }
    assert(productNotFound, "Deleted product is no longer queryable");

    // 6.3 Atomicity / Rollback on duplicate SKU
    const rollbackSlug = `test-rollback-${timestamp}`;
    let threwDuplicateSku = false;
    try {
      await productService.createProduct(
        {
          name: "Rollback Test Product",
          slug: rollbackSlug,
          variants: [
            {
              sku: "DUP-SKU-001",
              name: "Duplicate Variant 1",
              size: "S",
              price: 3000,
              stock: 10,
            },
            {
              sku: "DUP-SKU-001", // Duplicate SKU inside payload
              name: "Duplicate Variant 2",
              size: "M",
              price: 3000,
              stock: 10,
            },
          ],
        },
        superAdmin
      );
    } catch (err) {
      if (err instanceof ValidationError) threwDuplicateSku = true;
    }
    assert(threwDuplicateSku, "createProduct validates and catches duplicate SKUs before commit");

    const [strayProduct] = await db
      .select()
      .from(products)
      .where(eq(products.slug, rollbackSlug))
      .limit(1);
    assert(!strayProduct, "Failed transaction committed zero rows to products table");

    // =========================================================================
    // 7. Role Authorization Enforcement
    // =========================================================================
    console.log("\nCategory 7: Role Authorization Enforcement");

    let staffCategoryBlocked = false;
    try {
      await categoryService.createCategory(
        {
          name: "Staff Attempt Category",
          slug: `staff-cat-${timestamp}`,
        },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffCategoryBlocked = true;
    }
    assert(staffCategoryBlocked, "Staff role prohibited from creating categories");

    let staffProductBlocked = false;
    try {
      await productService.createProduct(
        {
          name: "Staff Attempt Product",
          slug: `staff-prod-${timestamp}`,
          variants: [
            {
              sku: `STAFF-${timestamp}`,
              name: "Staff Variant",
              size: "M",
              price: 1000,
              stock: 1,
            },
          ],
        },
        staffAdmin
      );
    } catch (err) {
      if (err instanceof AuthorizationError) staffProductBlocked = true;
    }
    assert(staffProductBlocked, "Staff role prohibited from creating products");
  } catch (err: any) {
    console.error("❌ Critical test execution error:", err);
    failed++;
  } finally {
    // Clean up temporary categories created for testing
    console.log("\nPerforming test data cleanup...");
    const catIdsToClean = [parentCatId, childCatId, reassignTargetCatId].filter(Boolean) as string[];
    if (catIdsToClean.length > 0) {
      try {
        await db.delete(productCategories).where(inArray(productCategories.id, catIdsToClean));
        console.log(`  Cleaned up ${catIdsToClean.length} test category records.`);
      } catch (cleanErr) {
        console.warn("  Failed to clean up test categories:", cleanErr);
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

runCatalogTests();
