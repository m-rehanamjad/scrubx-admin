import { db } from "../../db/index.ts";
import {
  categoryRepository,
  CategoryRepository,
  type CategoryWithProductCount,
} from "../repositories/category.repository.ts";
import { imagekit } from "../../lib/imagekit.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { NotFoundError, ConflictError, ValidationError } from "../errors.ts";
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
  DeleteCategoryInput,
} from "../validation/catalog.ts";

export interface CategoryTreeNode extends CategoryWithProductCount {
  children: CategoryTreeNode[];
}

/**
 * Safely deletes a file from ImageKit without throwing unhandled exceptions
 * that could break post-transaction operations.
 */
async function safeDeleteImageKitFile(fileId: string | null | undefined): Promise<void> {
  if (!fileId) return;
  try {
    await imagekit.deleteFile(fileId);
  } catch (err) {
    console.warn(`[ImageKit Purge Warning]: Failed to delete file '${fileId}':`, err);
  }
}

/**
 * Checks whether potentialParentId is a descendant of ancestorId to prevent circular category hierarchies.
 */
async function isDescendant(
  potentialParentId: string,
  ancestorId: string,
  repo: CategoryRepository
): Promise<boolean> {
  let currentId: string | null = potentialParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === ancestorId) return true;
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const cat = await repo.findById(currentId);
    currentId = cat?.parentId ?? null;
  }

  return false;
}

export class CategoryService {
  private readonly repo: CategoryRepository;

  constructor(repo: CategoryRepository = categoryRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves categories, optionally structured as a hierarchical tree with children.
   * Requires at least staff privileges.
   */
  async getAllCategories(
    admin: AdminContext,
    options: { activeOnly?: boolean; tree?: boolean } = {}
  ): Promise<CategoryWithProductCount[] | CategoryTreeNode[]> {
    assertRole(admin, ["staff"]);

    const flatCategories = await this.repo.findAll({ activeOnly: options.activeOnly });

    if (!options.tree) {
      return flatCategories;
    }

    // Assemble category hierarchy tree
    const map = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    for (const cat of flatCategories) {
      map.set(cat.id, { ...cat, children: [] });
    }

    for (const cat of flatCategories) {
      const node = map.get(cat.id)!;
      if (cat.parentId && map.has(cat.parentId)) {
        map.get(cat.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  /**
   * Retrieves a single category by UUID with product count.
   * Requires at least staff privileges.
   */
  async getCategoryById(id: string, admin: AdminContext): Promise<CategoryWithProductCount> {
    assertRole(admin, ["staff"]);

    const category = await this.repo.findById(id);
    if (!category) {
      throw new NotFoundError("Category", id);
    }

    return category;
  }

  /**
   * Retrieves a category by slug.
   * Requires at least staff privileges.
   */
  async getCategoryBySlug(slug: string, admin: AdminContext): Promise<CategoryWithProductCount> {
    assertRole(admin, ["staff"]);

    const category = await this.repo.findBySlug(slug);
    if (!category) {
      throw new NotFoundError("Category with slug", slug);
    }

    return category;
  }

  /**
   * Creates a new category.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async createCategory(input: CreateCategoryInput, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    // Verify slug uniqueness
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      throw new ConflictError(`A category with slug '${input.slug}' already exists.`);
    }

    // Verify parent category exists if specified
    if (input.parentId) {
      const parent = await this.repo.findById(input.parentId);
      if (!parent) {
        throw new NotFoundError("Parent Category", input.parentId);
      }
    }

    const created = await this.repo.create(input);
    return created;
  }

  /**
   * Updates an existing category.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async updateCategory(input: UpdateCategoryInput, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(input.id);
    if (!existing) {
      throw new NotFoundError("Category", input.id);
    }

    // Check slug uniqueness if changed
    if (input.slug && input.slug !== existing.slug) {
      const slugOwner = await this.repo.findBySlug(input.slug);
      if (slugOwner && slugOwner.id !== input.id) {
        throw new ConflictError(`A category with slug '${input.slug}' already exists.`);
      }
    }

    // Check parent hierarchy constraints
    if (input.parentId !== undefined) {
      if (input.parentId === input.id) {
        throw new ValidationError("A category cannot be its own parent.");
      }

      if (input.parentId !== null) {
        const parent = await this.repo.findById(input.parentId);
        if (!parent) {
          throw new NotFoundError("Parent Category", input.parentId);
        }

        const isCircular = await isDescendant(input.parentId, input.id, this.repo);
        if (isCircular) {
          throw new ValidationError(
            "Circular hierarchy error: Cannot assign a descendant category as parent."
          );
        }
      }
    }

    // Check if image is being replaced or removed
    let oldImageFileIdToPurge: string | null = null;
    if (
      input.imageFileId !== undefined &&
      existing.imageFileId &&
      existing.imageFileId !== input.imageFileId
    ) {
      oldImageFileIdToPurge = existing.imageFileId;
    }

    const { id, ...data } = input;
    const updated = await this.repo.update(id, data);

    // Clean up replaced asset from ImageKit
    if (oldImageFileIdToPurge) {
      await safeDeleteImageKitFile(oldImageFileIdToPurge);
    }

    return updated;
  }

  /**
   * Deletes a category with safe deletion enforcement.
   * If products reference this category:
   *  - Throws ConflictError if reassignToCategoryId is not provided.
   *  - Reassigns products if reassignToCategoryId is specified.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async deleteCategory(id: string, options: DeleteCategoryInput, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Category", id);
    }

    const productCount = await this.repo.getProductCount(id);

    if (productCount > 0) {
      if (!options.reassignToCategoryId) {
        throw new ConflictError(
          `Cannot delete category '${existing.name}'. It is currently referenced by ${productCount} product(s). Please specify a target 'reassignToCategoryId' to reassign them before deletion.`
        );
      }

      if (options.reassignToCategoryId === id) {
        throw new ValidationError("Cannot reassign products to the category being deleted.");
      }

      const target = await this.repo.findById(options.reassignToCategoryId);
      if (!target) {
        throw new NotFoundError("Reassignment Category", options.reassignToCategoryId);
      }
    }

    // Execute deletion and reassignments in atomic transaction
    await db.transaction(async (tx) => {
      // Reassign products if requested
      if (options.reassignToCategoryId) {
        await this.repo.reassignProducts(id, options.reassignToCategoryId, tx);
      }

      // Unparent direct child categories to avoid broken references
      await this.repo.unparentChildren(id, null, tx);

      // Delete the category row
      await this.repo.delete(id, tx);
    });

    // Clean up image from ImageKit after transaction commits
    if (existing.imageFileId) {
      await safeDeleteImageKitFile(existing.imageFileId);
    }

    return {
      success: true,
      deletedId: id,
      reassignedProductsCount: options.reassignToCategoryId ? productCount : 0,
    };
  }

  /**
   * Toggles category active status.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async toggleCategoryStatus(id: string, admin: AdminContext) {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("Category", id);
    }

    const updated = await this.repo.update(id, {
      isActive: !existing.isActive,
    });

    return updated;
  }
}

export const categoryService = new CategoryService();
