import { paymentMethodRepository, PaymentMethodRepository } from "../repositories/payment-method.repository.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { db } from "../../db/index.ts";
import { ValidationError, NotFoundError } from "../errors.ts";
import {
  type UpdatePaymentMethodInput,
  updatePaymentMethodSchema,
} from "../validation/payment-methods.ts";
import type { PaymentMethod } from "../../db/schema/types.ts";

export class PaymentMethodService {
  private readonly repo: PaymentMethodRepository;

  constructor(repo: PaymentMethodRepository = paymentMethodRepository) {
    this.repo = repo;
  }

  /**
   * Retrieves all configured payment methods.
   * Requires at least staff role.
   */
  async getPaymentMethods(admin?: AdminContext): Promise<PaymentMethod[]> {
    if (admin) {
      assertRole(admin, ["staff"]);
    }
    return this.repo.findAll();
  }

  /**
   * Retrieves a single payment method by ID.
   * Requires at least staff role.
   */
  async getPaymentMethodById(id: string, admin: AdminContext): Promise<PaymentMethod> {
    assertRole(admin, ["staff"]);
    const method = await this.repo.findById(id);
    if (!method) {
      throw new NotFoundError("PaymentMethod", id);
    }
    return method;
  }

  /**
   * Updates an existing payment method.
   * Strictly enforces the business rule and database trigger invariant:
   * Cash on Delivery (COD) MUST NEVER be allowed with custom engraving.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async updatePaymentMethod(
    input: UpdatePaymentMethodInput,
    admin: AdminContext
  ): Promise<PaymentMethod> {
    assertRole(admin, ["admin"]);

    const parseRes = updatePaymentMethodSchema.safeParse(input);
    if (!parseRes.success) {
      throw new ValidationError(parseRes.error.issues.map((i) => i.message).join(", "));
    }
    const data = parseRes.data;

    const existing = await this.repo.findById(data.id);
    if (!existing) {
      throw new NotFoundError("PaymentMethod", data.id);
    }

    // Critical invariant check: Cash on Delivery cannot be enabled for custom engraving
    if (existing.code === "cod") {
      if (data.allowedWithEngraving === true) {
        throw new ValidationError("Cash on Delivery cannot be enabled for custom engraved orders.");
      }
    }

    const updated = await this.repo.update(data.id, {
      name: data.name !== undefined ? data.name.trim() : existing.name,
      accountTitle: data.accountTitle !== undefined ? (data.accountTitle ? data.accountTitle.trim() : null) : existing.accountTitle,
      accountNumber: data.accountNumber !== undefined ? (data.accountNumber ? data.accountNumber.trim() : null) : existing.accountNumber,
      bankName: data.bankName !== undefined ? (data.bankName ? data.bankName.trim() : null) : existing.bankName,
      iban: data.iban !== undefined ? (data.iban ? data.iban.trim() : null) : existing.iban,
      instructions: data.instructions !== undefined ? data.instructions : existing.instructions,
      // For COD, always enforce false regardless of patch
      allowedWithEngraving: existing.code === "cod" ? false : (data.allowedWithEngraving !== undefined ? data.allowedWithEngraving : existing.allowedWithEngraving),
      supportsProof: data.supportsProof !== undefined ? data.supportsProof : existing.supportsProof,
      isActive: data.isActive !== undefined ? data.isActive : existing.isActive,
      sortOrder: data.sortOrder !== undefined ? data.sortOrder : existing.sortOrder,
    });

    return updated!;
  }

  /**
   * Toggles the active status of a payment method.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async togglePaymentMethodStatus(
    id: string,
    isActive: boolean,
    admin: AdminContext
  ): Promise<PaymentMethod> {
    assertRole(admin, ["admin"]);

    const existing = await this.repo.findById(id);
    if (!existing) {
      throw new NotFoundError("PaymentMethod", id);
    }

    const updated = await this.repo.update(id, { isActive });
    return updated!;
  }

  /**
   * Atomically reorders payment methods within a transaction.
   * Strictly requires administrator (admin or super_admin) privileges.
   */
  async reorderPaymentMethods(
    items: Array<{ id: string; sortOrder: number }>,
    admin: AdminContext
  ): Promise<void> {
    assertRole(admin, ["admin"]);

    // Check for duplicate IDs in payload
    const idSet = new Set<string>();
    for (const item of items) {
      if (idSet.has(item.id)) {
        throw new ValidationError(`Duplicate payment method ID '${item.id}' in reorder payload.`);
      }
      idSet.add(item.id);
    }

    return db.transaction(async (tx) => {
      // Validate all IDs exist in database
      for (const item of items) {
        const method = await this.repo.findById(item.id, tx);
        if (!method) {
          throw new NotFoundError("PaymentMethod", item.id);
        }
      }

      await this.repo.updateSortOrders(items, tx);
    });
  }
}

export const paymentMethodService = new PaymentMethodService();
