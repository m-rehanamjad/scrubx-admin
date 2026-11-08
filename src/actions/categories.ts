"use server";

import { revalidatePath } from "next/cache";
import { createSafeAction } from "../server/action-client.ts";
import { categoryService } from "../server/services/category.service.ts";
import {
  categoryFilterSchema,
  getCategoryByIdSchema,
  createCategorySchema,
  updateCategorySchema,
  deleteCategorySchema,
  toggleCategoryStatusSchema,
} from "../server/validation/catalog.ts";

/**
 * Server Action: Retrieve all categories, flat or as a tree.
 * Requires at least staff privileges.
 */
export const getCategoriesAction = createSafeAction(
  {
    schema: categoryFilterSchema.optional(),
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return categoryService.getAllCategories(admin, {
      activeOnly: input?.activeOnly,
      tree: input?.tree,
    });
  }
);

/**
 * Server Action: Retrieve a single category by ID with its product count.
 * Requires at least staff privileges.
 */
export const getCategoryByIdAction = createSafeAction(
  {
    schema: getCategoryByIdSchema,
    requiredRole: "staff",
  },
  async ({ input, admin }) => {
    return categoryService.getCategoryById(input.id, admin);
  }
);

/**
 * Server Action: Create a new category.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const createCategoryAction = createSafeAction(
  {
    schema: createCategorySchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const created = await categoryService.createCategory(input, admin);
    revalidatePath("/categories");
    revalidatePath("/products");
    return created;
  }
);

/**
 * Server Action: Update an existing category.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const updateCategoryAction = createSafeAction(
  {
    schema: updateCategorySchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await categoryService.updateCategory(input, admin);
    revalidatePath("/categories");
    revalidatePath("/products");
    return updated;
  }
);

/**
 * Server Action: Safely delete a category.
 * Checks active product counts and handles optional reassignment.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const deleteCategoryAction = createSafeAction(
  {
    schema: deleteCategorySchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const result = await categoryService.deleteCategory(input.id, input, admin);
    revalidatePath("/categories");
    revalidatePath("/products");
    return result;
  }
);

/**
 * Server Action: Toggle active status for a category.
 * Strictly requires administrator (admin or super_admin) privileges.
 */
export const toggleCategoryStatusAction = createSafeAction(
  {
    schema: toggleCategoryStatusSchema,
    requiredRole: "admin",
  },
  async ({ input, admin }) => {
    const updated = await categoryService.toggleCategoryStatus(input.id, admin);
    revalidatePath("/categories");
    revalidatePath("/products");
    return updated;
  }
);
