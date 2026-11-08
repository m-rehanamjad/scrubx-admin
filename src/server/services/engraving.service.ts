import { engravingRepository, EngravingRepository } from "../repositories/engraving.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { db } from "../../db/index.ts";
import { ValidationError, NotFoundError } from "../errors.ts";
import {
  type CreateEngravingOptionInput,
  type UpdateEngravingOptionInput,
  type EngravingOptionFilter,
  createEngravingOptionSchema,
  updateEngravingOptionSchema,
} from "../validation/engraving.ts";
import type { EngravingOption } from "../../db/schema/types.ts";

export class EngravingService {
  private readonly repo: EngravingRepository;

  constructor(repo: EngravingRepository = engravingRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves all engraving options.
   * Requires at least staff role.
   */
  async getEngravingOptions(
    filter?: EngravingOptionFilter,
    admin?: AdminContext
  ): Promise<EngravingOption[]> {
    if (admin) {
      assertRole(admin, ["staff"]);
    }
    return this.repo.findAll(filter);
  }

  /**
   * Retrieves a single engraving option by ID.
   * Requires at least staff role.
   */
  async getEngravingOptionById(id: string, admin: AdminContext): Promise<EngravingOption> {
    assertRole(admin, ["staff"]);
    const option = await this.repo.findById(id);
    if (!option) {
      throw new NotFoundError("EngravingOption", id);
    }
    return option;
  }

  /**
   * Creates a new personalization engraving option.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async createEngravingOption(
    input: CreateEngravingOptionInput,
    admin: AdminContext
  ): Promise<EngravingOption> {
    assertRole(admin, ["admin"]);

    const parseRes = createEngravingOptionSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    return this.repo.create({
      type: data.type,
      name: data.name.trim(),
      description: data.description ?? null,
      price: String(data.price),
      maxCharacters: data.type === "name" ? data.maxCharacters : null,
      isActive: data.isActive,
    });
  }

  /**
   * Updates an existing engraving option with complete merged entity validation.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async updateEngravingOption(
    input: UpdateEngravingOptionInput,
    admin: AdminContext
  ): Promise<EngravingOption> {
    assertRole(admin, ["admin"]);

    const parseRes = updateEngravingOptionSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    const existing = await this.repo.findById(data.id);
    if (!existing) {
      throw new NotFoundError("EngravingOption", data.id);
    }

    // Merge partial update with existing record
    const merged = {
      ...existing,
      ...data,
      type: data.type ?? existing.type,
      maxCharacters: data.maxCharacters !== undefined ? data.maxCharacters : existing.maxCharacters,
      price: data.price !== undefined ? String(data.price) : existing.price,
    };

    // Validate merged entity invariants
    if (merged.type === "name" && (merged.maxCharacters == null || merged.maxCharacters <= 0)) {
      throw new ValidationError("Name engraving options require a positive maximum character limit.");
    }

    const updated = await this.repo.update(data.id, {
      type: merged.type,
      name: data.name !== undefined ? data.name.trim() : existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      price: merged.price,
      maxCharacters: merged.type === "name" ? merged.maxCharacters : null,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
    });

    return updated!;
  }

  /**
   * Toggles the active status of an engraving option.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async toggleEngravingOptionStatus(
    id: string,
    isActive: boolean,
    admin: AdminContext
  ): Promise<EngravingOption> {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("EngravingOption", id);
    }

    const updated = await this.repo.update(id, { isActive });
    return updated!;
  }

  /**
   * Safely deletes or deactivates an engraving option.
   * If historical order_item_engraving records exist, safely deactivates to preserve foreign keys.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async deleteEngravingOption(
    id: string,
    admin: AdminContext
  ): Promise<{ deleted: boolean; deactivated: boolean; message: string }> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      const existing = await this.repo.findById(id, tx);
      if (!existing) {
        throw new NotFoundError("EngravingOption", id);
      }

      const usages = await this.repo.checkHasOrderUsages(id, tx);
      if (usages > 0) {
        await this.repo.update(id, { isActive: false }, tx);
        return {
          deleted: false,
          deactivated: true,
          message: `Engraving option '${existing.name}' is referenced by ${usages} historical order items and was deactivated instead of deleted.`,
        };
      }

      await this.repo.delete(id, tx);
      return {
        deleted: true,
        deactivated: false,
        message: `Engraving option '${existing.name}' was permanently deleted.`,
      };
    });
  }
}

export const engravingService = new EngravingService();
