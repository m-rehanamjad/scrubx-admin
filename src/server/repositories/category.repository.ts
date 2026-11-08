import { eq, and, isNull, sql, count } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { productCategories, products } from "../../db/schema/catalog.ts";
import type { DatabaseExecutor } from "./base.repository.ts";

export type CategoryWithProductCount = typeof productCategories.$inferSelect & {
  productCount: number;
};

export class CategoryRepository {
  /**
   * Retrieves all categories, optionally filtered by active status,
   * with calculated product counts.
   */
  async findAll(
    options: { activeOnly?: boolean } = {},
    executor: DatabaseExecutor = db
  ): Promise<CategoryWithProductCount[]> {
    const conditions = [];

    if (options.activeOnly) {
      conditions.push(eq(productCategories.isActive, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Left join with products to count active, non-archived products per category
    const rows = await executor
      .select({
        id: productCategories.id,
        parentId: productCategories.parentId,
        name: productCategories.name,
        slug: productCategories.slug,
        description: productCategories.description,
        imageUrl: productCategories.imageUrl,
        imageFileId: productCategories.imageFileId,
        sortOrder: productCategories.sortOrder,
        isActive: productCategories.isActive,
        createdAt: productCategories.createdAt,
        updatedAt: productCategories.updatedAt,
        productCount: sql<number>`cast(count(${products.id}) filter (where ${products.deletedAt} is null) as integer)`,
      })
      .from(productCategories)
      .leftJoin(products, eq(products.categoryId, productCategories.id))
      .where(whereClause)
      .groupBy(productCategories.id)
      .orderBy(productCategories.sortOrder, productCategories.name);

    return rows.map((r) => ({
      ...r,
      productCount: Number(r.productCount) || 0,
    }));
  }

  /**
   * Retrieves a single category by UUID with its product count.
   */
  async findById(
    id: string,
    executor: DatabaseExecutor = db
  ): Promise<CategoryWithProductCount | null> {
    const [row] = await executor
      .select({
        id: productCategories.id,
        parentId: productCategories.parentId,
        name: productCategories.name,
        slug: productCategories.slug,
        description: productCategories.description,
        imageUrl: productCategories.imageUrl,
        imageFileId: productCategories.imageFileId,
        sortOrder: productCategories.sortOrder,
        isActive: productCategories.isActive,
        createdAt: productCategories.createdAt,
        updatedAt: productCategories.updatedAt,
        productCount: sql<number>`cast(count(${products.id}) filter (where ${products.deletedAt} is null) as integer)`,
      })
      .from(productCategories)
      .leftJoin(products, eq(products.categoryId, productCategories.id))
      .where(eq(productCategories.id, id))
      .groupBy(productCategories.id)
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      productCount: Number(row.productCount) || 0,
    };
  }

  /**
   * Retrieves a category by unique slug.
   */
  async findBySlug(
    slug: string,
    executor: DatabaseExecutor = db
  ): Promise<CategoryWithProductCount | null> {
    const [row] = await executor
      .select({
        id: productCategories.id,
        parentId: productCategories.parentId,
        name: productCategories.name,
        slug: productCategories.slug,
        description: productCategories.description,
        imageUrl: productCategories.imageUrl,
        imageFileId: productCategories.imageFileId,
        sortOrder: productCategories.sortOrder,
        isActive: productCategories.isActive,
        createdAt: productCategories.createdAt,
        updatedAt: productCategories.updatedAt,
        productCount: sql<number>`cast(count(${products.id}) filter (where ${products.deletedAt} is null) as integer)`,
      })
      .from(productCategories)
      .leftJoin(products, eq(products.categoryId, productCategories.id))
      .where(eq(productCategories.slug, slug))
      .groupBy(productCategories.id)
      .limit(1);

    if (!row) return null;

    return {
      ...row,
      productCount: Number(row.productCount) || 0,
    };
  }

  /**
   * Inserts a new category into the database.
   */
  async create(
    data: {
      name: string;
      slug: string;
      parentId?: string | null;
      description?: string | null;
      imageUrl?: string | null;
      imageFileId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
    executor: DatabaseExecutor = db
  ) {
    const [created] = await executor
      .insert(productCategories)
      .values({
        name: data.name,
        slug: data.slug,
        parentId: data.parentId || null,
        description: data.description || null,
        imageUrl: data.imageUrl || null,
        imageFileId: data.imageFileId || null,
        sortOrder: data.sortOrder ?? 0,
        isActive: data.isActive ?? true,
      })
      .returning();

    return created;
  }

  /**
   * Updates an existing category by ID.
   */
  async update(
    id: string,
    data: {
      name?: string;
      slug?: string;
      parentId?: string | null;
      description?: string | null;
      imageUrl?: string | null;
      imageFileId?: string | null;
      sortOrder?: number;
      isActive?: boolean;
    },
    executor: DatabaseExecutor = db
  ) {
    const [updated] = await executor
      .update(productCategories)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(productCategories.id, id))
      .returning();

    return updated;
  }

  /**
   * Deletes a category by ID.
   */
  async delete(id: string, executor: DatabaseExecutor = db) {
    const [deleted] = await executor
      .delete(productCategories)
      .where(eq(productCategories.id, id))
      .returning();

    return deleted;
  }

  /**
   * Counts active (non-deleted) products referencing this category.
   */
  async getProductCount(categoryId: string, executor: DatabaseExecutor = db): Promise<number> {
    const [result] = await executor
      .select({ val: count() })
      .from(products)
      .where(and(eq(products.categoryId, categoryId), isNull(products.deletedAt)));

    return Number(result?.val) || 0;
  }

  /**
   * Reassigns all active products from one category to another.
   */
  async reassignProducts(
    fromCategoryId: string,
    toCategoryId: string | null,
    executor: DatabaseExecutor = db
  ): Promise<number> {
    const updated = await executor
      .update(products)
      .set({ categoryId: toCategoryId, updatedAt: new Date() })
      .where(eq(products.categoryId, fromCategoryId))
      .returning({ id: products.id });

    return updated.length;
  }

  /**
   * Unparents direct children of a category (sets parentId to null or a new parent).
   */
  async unparentChildren(
    categoryId: string,
    newParentId: string | null = null,
    executor: DatabaseExecutor = db
  ): Promise<number> {
    const updated = await executor
      .update(productCategories)
      .set({ parentId: newParentId, updatedAt: new Date() })
      .where(eq(productCategories.parentId, categoryId))
      .returning({ id: productCategories.id });

    return updated.length;
  }
}

export const categoryRepository = new CategoryRepository();
