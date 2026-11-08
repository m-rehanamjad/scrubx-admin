import { db } from "../../db/index.ts";
import {
  paymentRepository,
  PaymentRepository,
  type PaymentListItem,
  type PaymentDetail,
} from "../repositories/payment.repository.ts";
import { orderRepository, OrderRepository } from "../repositories/order.repository.ts";
import {
  paymentMethodRepository,
  PaymentMethodRepository,
} from "../repositories/payment-method.repository.ts";
import { inventoryService, InventoryService } from "./inventory.service.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import { NotFoundError, ValidationError } from "../errors.ts";
import type {
  PaymentFilterInput,
  SubmitPaymentProofInput,
  VerifyPaymentInput,
  RefundPaymentInput,
} from "../validation/payments.ts";
import type { PaginatedResult } from "../types.ts";
import type { Payment } from "../../db/schema/index.ts";
import type { OrderStatus } from "../validation/orders.ts";

export class PaymentService {
  private readonly paymentRepo: PaymentRepository;
  private readonly orderRepo: OrderRepository;
  private readonly invService: InventoryService;
  private readonly paymentMethodRepo: PaymentMethodRepository;

  constructor(
    paymentRepo: PaymentRepository = paymentRepository,
    orderRepo: OrderRepository = orderRepository,
    invService: InventoryService = inventoryService,
    paymentMethodRepo: PaymentMethodRepository = paymentMethodRepository
  ) {
    this.paymentRepo = paymentRepo;
    this.orderRepo = orderRepo;
    this.invService = invService;
    this.paymentMethodRepo = paymentMethodRepo;
  }

  /**
   * Retrieves paginated payment records matching filters.
   * Requires at least staff role.
   */
  async getPayments(
    filter: PaymentFilterInput,
    admin: AdminContext
  ): Promise<PaginatedResult<PaymentListItem>> {
    assertRole(admin, ["staff"]);
    return this.paymentRepo.findPaginated(filter);
  }

  /**
   * Retrieves single deep payment record with order overview and verification info.
   * Requires at least staff role.
   */
  async getPaymentById(id: string, admin: AdminContext): Promise<PaymentDetail> {
    assertRole(admin, ["staff"]);
    const payment = await this.paymentRepo.findById(id);
    if (!payment) {
      throw new NotFoundError("Payment", id);
    }
    return payment;
  }

  /**
   * Retrieves count of pending payment verifications for dashboard badge.
   * Requires at least staff role.
   */
  async getPendingCount(admin: AdminContext): Promise<number> {
    assertRole(admin, ["staff"]);
    return this.paymentRepo.getPendingCount();
  }

  /**
   * Submits payment screenshot proof and TID, moving payment to awaiting_verification.
   */
  async submitPaymentProof(input: SubmitPaymentProofInput): Promise<Payment> {
    const existing = await this.paymentRepo.findById(input.paymentId);
    if (!existing) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing uniform lock ordering: 1. orders -> 2. payments)
      const order = await this.orderRepo.findForUpdate(existing.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", existing.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      const existingMetadata = payment.metadata || {};
      const updatedMetadata = {
        ...existingMetadata,
        imagekitFileId: input.imagekitFileId || existingMetadata.imagekitFileId,
        proofUploadedAt: new Date().toISOString(),
        customerNotes: input.customerNotes || existingMetadata.customerNotes,
      };

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "awaiting_verification",
          senderName: input.senderName || payment.senderName,
          senderAccountLast4: input.senderAccountLast4 || payment.senderAccountLast4,
          transactionReference: input.transactionReference || payment.transactionReference,
          proofUrl: input.proofUrl || payment.proofUrl,
          metadata: updatedMetadata,
        },
        tx
      );

      // Advance order from awaiting_payment to payment_submitted
      if (order.status === "awaiting_payment") {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "payment_submitted",
          "awaiting_payment",
          `Customer submitted payment proof (TID: ${input.transactionReference || "N/A"}).`,
          "system",
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Approves payment proof, advances order status to confirmed, and idempotently commits stock sale.
   * Strictly requires administrator (admin or super_admin) role.
   */
  async approvePayment(
    input: VerifyPaymentInput,
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    const targetPayment = await this.paymentRepo.findById(input.paymentId);
    if (!targetPayment) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing global lock order: 1. orders -> 2. payments -> 3. inventory)
      const order = await this.orderRepo.findForUpdate(targetPayment.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", targetPayment.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      // Idempotency: if already paid, return without duplicating side-effects
      if (payment.status === "paid") {
        return payment;
      }

      const now = new Date();
      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "paid",
          verifiedBy: admin.id,
          verifiedAt: now,
          paidAt: now,
          rejectionReason: null,
        },
        tx
      );

      // 3. Advance Order to Confirmed
      if (["awaiting_payment", "payment_submitted"].includes(order.status)) {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "confirmed",
          order.status as OrderStatus,
          `Payment of PKR ${payment.amount} verified and approved.`,
          admin.id,
          tx
        );

        // 4. Idempotently commit inventory reservation (locks inventory third)
        const orderBundle = await this.orderRepo.findById(order.id, tx);
        if (orderBundle?.items) {
          for (const item of orderBundle.items) {
            if (item.variantId) {
              await this.invService.commitOrderSale(
                item.variantId,
                item.quantity,
                order.id,
                admin.id,
                tx
              );
            }
          }
        }
      }

      return updatedPayment!;
    });
  }

  /**
   * Rejects payment proof, reverts order to awaiting_payment, and retains audit history.
   * Strictly requires administrator (admin or super_admin) role.
   */
  async rejectPayment(
    input: VerifyPaymentInput,
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    const targetPayment = await this.paymentRepo.findById(input.paymentId);
    if (!targetPayment) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First (uniform lock order: 1. orders -> 2. payments)
      const order = await this.orderRepo.findForUpdate(targetPayment.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", targetPayment.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      const now = new Date();
      const reasonText = input.rejectionReason || "Payment proof could not be verified.";

      const existingMetadata = payment.metadata || {};
      const rejectionHistory = [
        ...(existingMetadata.rejectionHistory || []),
        {
          rejectedBy: admin.id,
          rejectedAt: now.toISOString(),
          reason: reasonText,
        },
      ];

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "rejected",
          verifiedBy: admin.id,
          verifiedAt: now,
          rejectionReason: reasonText,
          metadata: {
            ...existingMetadata,
            rejectionHistory,
          },
        },
        tx
      );

      // Revert order status to awaiting_payment so customer can retry
      if (order.status === "payment_submitted") {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "awaiting_payment",
          "payment_submitted",
          `Payment proof rejected: ${reasonText}`,
          admin.id,
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Records a processed monetary refund.
   * Strictly requires administrator (admin or super_admin) role.
   */
  async refundPayment(
    input: RefundPaymentInput,
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    const targetPayment = await this.paymentRepo.findById(input.paymentId);
    if (!targetPayment) {
      throw new NotFoundError("Payment", input.paymentId);
    }

    return db.transaction(async (tx) => {
      // 1. Lock Order First
      const order = await this.orderRepo.findForUpdate(targetPayment.orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", targetPayment.orderId);
      }

      // 2. Lock Payment Second
      const payment = await this.paymentRepo.findForUpdate(input.paymentId, tx);
      if (!payment) {
        throw new NotFoundError("Payment", input.paymentId);
      }

      if (payment.status !== "paid") {
        throw new ValidationError(
          `Cannot refund payment with status '${payment.status}'. Only paid payments can be refunded.`
        );
      }

      const updatedPayment = await this.paymentRepo.update(
        payment.id,
        {
          status: "refunded",
        },
        tx
      );

      // Check if all order payments are now refunded
      const allPayments = await this.paymentRepo.findByOrderId(order.id, tx);
      const allRefunded = allPayments.every((p) =>
        p.id === payment.id ? true : p.status === "refunded"
      );

      if (allRefunded) {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "refunded",
          order.status as OrderStatus,
          `Payment of PKR ${payment.amount} refunded. Reason: ${input.reason}`,
          admin.id,
          tx
        );
      }

      return updatedPayment!;
    });
  }

  /**
   * Directly marks payment for an order as paid (for COD cash collections, manual bank transfers).
   * Creates a payment row if none exists yet, updates status to 'paid', locks order, and commits sale.
   */
  async markOrderPaymentPaid(
    orderId: string,
    details: { paymentId?: string; transactionReference?: string; note?: string } = {},
    admin: AdminContext
  ): Promise<Payment> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing uniform lock order: 1. orders -> 2. payments -> 3. inventory)
      const order = await this.orderRepo.findForUpdate(orderId, tx);
      if (!order) {
        throw new NotFoundError("Order", orderId);
      }

      const now = new Date();
      let payment: Payment | null = null;

      if (details.paymentId) {
        payment = await this.paymentRepo.findForUpdate(details.paymentId, tx);
      } else {
        const orderPayments = await this.paymentRepo.findByOrderId(orderId, tx);
        if (orderPayments.length > 0) {
          payment = await this.paymentRepo.findForUpdate(orderPayments[0].id, tx);
        }
      }

      let updatedPayment: Payment;

      if (payment) {
        if (payment.status === "paid") {
          return payment;
        }
        updatedPayment = (await this.paymentRepo.update(
          payment.id,
          {
            status: "paid",
            verifiedBy: admin.id,
            verifiedAt: now,
            paidAt: now,
            transactionReference: details.transactionReference || payment.transactionReference,
            rejectionReason: null,
          },
          tx
        ))!;
      } else {
        // Create new paid payment record (e.g. COD order upon delivery)
        let paymentMethodId = order.paymentMethodId;
        if (!paymentMethodId) {
          const defaultMethod =
            (await this.paymentMethodRepo.findByCode("cod", tx)) ||
            (await this.paymentMethodRepo.findAll(tx))[0];
          if (!defaultMethod) {
            throw new ValidationError(
              "No payment method available to associate with this payment."
            );
          }
          paymentMethodId = defaultMethod.id;
        }

        updatedPayment = await this.paymentRepo.create(
          {
            orderId: order.id,
            paymentMethodId,
            status: "paid",
            amount: order.total,
            currency: order.currency || "PKR",
            transactionReference: details.transactionReference || null,
            verifiedBy: admin.id,
            verifiedAt: now,
            paidAt: now,
            metadata: {},
          },
          tx
        );
      }

      // 2. Advance Order to Confirmed if still in initial payment stages
      if (["awaiting_payment", "payment_submitted", "pending"].includes(order.status)) {
        await this.orderRepo.updateOrderStatus(
          order.id,
          "confirmed",
          order.status as OrderStatus,
          details.note || `Payment of PKR ${order.total} marked as paid.`,
          admin.id,
          tx
        );

        // Commit stock reservation into committed sale
        const orderDetails = await this.orderRepo.findById(order.id, tx);
        if (orderDetails?.items) {
          for (const item of orderDetails.items) {
            if (item.variantId) {
              await this.invService.commitOrderSale(
                item.variantId,
                item.quantity,
                order.id,
                admin.id,
                tx
              );
            }
          }
        }
      }

      return updatedPayment;
    });
  }

  /**
   * Resets an order's payment status to pending / unpaid.
   */
  async markOrderPaymentPending(
    orderId: string,
    details: { paymentId?: string; note?: string } = {},
    admin: AdminContext
  ): Promise<Payment | null> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      const order = await this.orderRepo.findForUpdate(orderId, tx);
      if (!order) throw new NotFoundError("Order", orderId);

      let payment: Payment | null = null;
      if (details.paymentId) {
        payment = await this.paymentRepo.findForUpdate(details.paymentId, tx);
      } else {
        const orderPayments = await this.paymentRepo.findByOrderId(orderId, tx);
        if (orderPayments.length > 0) {
          payment = await this.paymentRepo.findForUpdate(orderPayments[0].id, tx);
        }
      }

      if (payment) {
        return this.paymentRepo.update(
          payment.id,
          {
            status: "pending",
            paidAt: null,
            verifiedAt: null,
            verifiedBy: null,
          },
          tx
        );
      }

      return null;
    });
  }
}

export const paymentService = new PaymentService();
