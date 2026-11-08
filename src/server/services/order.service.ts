import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  orderRepository,
  OrderRepository,
  type OrderListItem,
  type OrderDetailBundle,
  type OrderSummaryMetrics,
} from "../repositories/order.repository.ts";
import { customerRepository, CustomerRepository } from "../repositories/customer.repository.ts";
import { inventoryService, InventoryService } from "./inventory.service.ts";
import { couponService as defaultCouponService, CouponService } from "./coupon.service.ts";
import { assertRole, type AdminContext } from "../auth.ts";
import {
  NotFoundError,
  ValidationError,
  ConflictError,
} from "../errors.ts";
import type {
  OrderFilterInput,
  CreateOrderInput,
  UpdateOrderStatusInput,
  UpdateOrderShippingInput,
  AddOrderNoteInput,
  OrderStatus,
} from "../validation/orders.ts";
import type { PaginatedResult } from "../types.ts";
import {
  productVariants,
  products,
  productColors,
  paymentMethods,
  shippingMethods,
  engravingOptions,
  coupons,
  orders,
  inventory,
  type Order,
  type OrderNote,
} from "../../db/schema/index.ts";

/**
 * Finite State Machine of permitted order status transitions.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  awaiting_payment: ["payment_submitted", "confirmed", "cancelled"],
  payment_submitted: ["confirmed", "awaiting_payment", "cancelled"],
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export class OrderService {
  private readonly orderRepo: OrderRepository;
  private readonly customerRepo: CustomerRepository;
  private readonly invService: InventoryService;
  private readonly couponService: CouponService;

  constructor(
    orderRepo: OrderRepository = orderRepository,
    customerRepo: CustomerRepository = customerRepository,
    invService: InventoryService = inventoryService,
    couponService: CouponService = defaultCouponService
  ) {
    this.orderRepo = orderRepo;
    this.customerRepo = customerRepo;
    this.invService = invService;
    this.couponService = couponService;
  }

  /**
   * Retrieves paginated orders matching filters.
   * Requires at least staff role.
   */
  async getOrders(
    filter: OrderFilterInput,
    admin: AdminContext
  ): Promise<PaginatedResult<OrderListItem>> {
    assertRole(admin, ["staff"]);
    return this.orderRepo.findPaginated(filter);
  }

  /**
   * Retrieves single deep order details bundle.
   * Requires at least staff role.
   */
  async getOrderById(id: string, admin: AdminContext): Promise<OrderDetailBundle> {
    assertRole(admin, ["staff"]);
    const order = await this.orderRepo.findById(id);
    if (!order) {
      throw new NotFoundError("Order", id);
    }
    return order;
  }

  /**
   * KPI metrics for order queue dashboard.
   * Requires at least staff role.
   */
  async getOrderMetrics(admin: AdminContext): Promise<OrderSummaryMetrics> {
    assertRole(admin, ["staff"]);
    return this.orderRepo.getOrderMetrics();
  }

  /**
   * Creates order bundle with item snapshots, stock reservation, and trigger guards.
   * Strictly requires administrative context (Staff or Admin).
   */
  async createOrder(
    input: CreateOrderInput,
    admin: AdminContext
  ): Promise<OrderDetailBundle> {
    assertRole(admin, ["staff"]);

    // 1. Idempotency check
    if (input.idempotencyKey) {
      const [existing] = await db
        .select()
        .from(orders)
        .where(eq(orders.idempotencyKey, input.idempotencyKey.trim()))
        .limit(1);

      if (existing) {
        return (await this.orderRepo.findById(existing.id))!;
      }
    }

    return db.transaction(async (tx) => {
      // 2. Customer resolution / atomic deduplication
      let customerId = input.customerId;
      if (!customerId && input.customer) {
        const cust = await this.customerRepo.upsertCustomer(input.customer, tx);
        customerId = cust.id;
      }

      if (!customerId) {
        throw new ValidationError("Customer identification is required.");
      }

      // Verify customer exists
      const [custRecord] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, customerId))
        .limit(1);

      // 3. Payment Method & COD Trigger Guard
      const [paymentMethod] = await tx
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.id, input.paymentMethodId))
        .limit(1);

      if (!paymentMethod || !paymentMethod.isActive) {
        throw new ValidationError("Selected payment method is invalid or inactive.");
      }

      // 4. Validate variants, prices, inventory, and build snapshots
      const variantIds = input.items.map((i) => i.variantId);
      const variantRows = await tx
        .select({
          variantId: productVariants.id,
          sku: productVariants.sku,
          price: productVariants.price,
          size: productVariants.size,
          colorName: productColors.name,
          productName: products.name,
          productStatus: products.status,
          quantityOnHand: inventory.quantityOnHand,
          quantityReserved: inventory.quantityReserved,
        })
        .from(productVariants)
        .innerJoin(products, eq(productVariants.productId, products.id))
        .leftJoin(productColors, eq(productVariants.colorId, productColors.id))
        .leftJoin(inventory, eq(productVariants.id, inventory.variantId))
        .where(inArray(productVariants.id, variantIds));

      const variantMap = new Map(variantRows.map((v) => [v.variantId, v]));

      let subtotal = 0;
      let engravingTotal = 0;
      let hasEngraving = false;
      const orderItemsToInsert = [];

      for (const itemInput of input.items) {
        const v = variantMap.get(itemInput.variantId);
        if (!v) {
          throw new NotFoundError("Product variant", itemInput.variantId);
        }

        if (v.productStatus === "archived") {
          throw new ValidationError(`Product '${v.productName}' is archived and cannot be ordered.`);
        }

        const availableStock = Math.max(0, (v.quantityOnHand ?? 0) - (v.quantityReserved ?? 0));
        if (availableStock < itemInput.quantity) {
          throw new ConflictError(
            `Insufficient stock for '${v.productName} (${v.sku})'. Available: ${availableStock}, Requested: ${itemInput.quantity}.`
          );
        }

        const unitPriceNum = Number(v.price);
        subtotal += unitPriceNum * itemInput.quantity;

        // Engraving validation & snapshot
        const itemEngravings = [];
        if (itemInput.engraving) {
          hasEngraving = true;
          const [engOpt] = await tx
            .select()
            .from(engravingOptions)
            .where(eq(engravingOptions.id, itemInput.engraving.engravingOptionId))
            .limit(1);

          if (!engOpt || !engOpt.isActive) {
            throw new ValidationError("Selected engraving option is invalid or inactive.");
          }

          const engPriceNum = Number(engOpt.price);
          engravingTotal += engPriceNum * itemInput.quantity;

          itemEngravings.push({
            engravingOptionId: engOpt.id,
            text: itemInput.engraving.text || null,
            logoUrl: itemInput.engraving.logoUrl || null,
            logoImagekitFileId: itemInput.engraving.logoImagekitFileId || null,
            placement: itemInput.engraving.placement || "Left Chest",
            price: engOpt.price,
          });
        }

        orderItemsToInsert.push({
          item: {
            variantId: v.variantId,
            sku: v.sku,
            productName: v.productName,
            variantName: [v.colorName, v.size].filter(Boolean).join(" / ") || "Standard",
            imageUrl: null,
            unitPrice: v.price,
            quantity: itemInput.quantity,
          },
          engravings: itemEngravings,
        });
      }

      // 5. Engraving + COD Business Rule & Database Trigger Guard
      if (hasEngraving && !paymentMethod.allowedWithEngraving) {
        throw new ValidationError("Custom engraved orders cannot be placed with Cash on Delivery.");
      }

      // 6. Shipping & Coupon Calculation
      let shippingTotal = 0;
      let shippingMethodName: string | null = null;
      if (input.shippingMethodId) {
        const [sm] = await tx
          .select()
          .from(shippingMethods)
          .where(eq(shippingMethods.id, input.shippingMethodId))
          .limit(1);

        if (sm) {
          shippingMethodName = sm.name;
          const priceNum = Number(sm.price);
          const freeAboveNum = sm.freeAbove ? Number(sm.freeAbove) : null;
          if (freeAboveNum !== null && subtotal >= freeAboveNum) {
            shippingTotal = 0;
          } else {
            shippingTotal = priceNum;
          }
        }
      }

      // 7. Dual-Counter Inventory Reservation (Locks inventory rows first per ADR 020)
      for (const itemInput of input.items) {
        await this.invService.reserveStock(itemInput.variantId, itemInput.quantity, undefined, tx);
      }

      // 8. Authoritative Coupon Validation & Row Lock (Locks coupon row second per ADR 020)
      let discountTotal = 0;
      let appliedCoupon: { couponId: string; discountAmount: string } | undefined;
      if (input.couponCode) {
        const couponResult = await this.couponService.validateAndLockForOrder(
          input.couponCode,
          subtotal,
          customerId,
          tx
        );
        discountTotal = couponResult.discountAmount;
        appliedCoupon = {
          couponId: couponResult.coupon.id,
          discountAmount: discountTotal.toFixed(2),
        };
      }

      const total = Math.max(0, subtotal + engravingTotal - discountTotal + shippingTotal);

      // 9. Initial Status Determination
      const isCod = paymentMethod.type === "cod";
      const initialStatus: OrderStatus = isCod ? "pending" : "awaiting_payment";

      const orderBundle = await this.orderRepo.createOrderBundle(
        {
          order: {
            customerId,
            orderNumber: `SX-${Date.now().toString().slice(-6)}`, // Trigger will replace with sequence if omitted
            status: initialStatus,
            currency: "PKR",
            subtotal: subtotal.toFixed(2),
            engravingTotal: engravingTotal.toFixed(2),
            discountTotal: discountTotal.toFixed(2),
            shippingTotal: shippingTotal.toFixed(2),
            taxTotal: "0.00",
            total: total.toFixed(2),
            hasEngraving,
            paymentMethodId: input.paymentMethodId,
            shippingMethodId: input.shippingMethodId || null,
            shippingMethodName,
            contactPhone: input.shippingAddress.phone,
            shippingAddress: input.shippingAddress,
            notes: input.notes || null,
            idempotencyKey: input.idempotencyKey || null,
          },
          items: orderItemsToInsert,
          coupon: appliedCoupon,
          initialPayment: !isCod
            ? {
                paymentMethodId: input.paymentMethodId,
                status: "pending",
                amount: total.toFixed(2),
                currency: "PKR",
                metadata: {},
              }
            : undefined,
        },
        tx
      );

      return orderBundle;
    });
  }

  /**
   * Updates order status with strict transition validation, lock ordering, and inventory synchronization.
   * Strictly requires administrator (admin or super_admin) role.
   */
  async updateOrderStatus(
    input: UpdateOrderStatusInput,
    admin: AdminContext
  ): Promise<Order> {
    assertRole(admin, ["admin"]);

    return db.transaction(async (tx) => {
      // 1. Lock Order First (enforcing uniform lock ordering: 1. orders -> 2. payments -> 3. inventory)
      const currentOrder = await this.orderRepo.findForUpdate(input.orderId, tx);
      if (!currentOrder) {
        throw new NotFoundError("Order", input.orderId);
      }

      const fromStatus = currentOrder.status as OrderStatus;
      const toStatus = input.status;

      if (fromStatus === toStatus) {
        return currentOrder;
      }

      // 2. Validate Permitted State Transition
      const allowedNext = ALLOWED_STATUS_TRANSITIONS[fromStatus] || [];
      if (!allowedNext.includes(toStatus)) {
        throw new ValidationError(
          `Cannot transition order status from '${fromStatus}' to '${toStatus}'.`
        );
      }

      const orderLineItems = await this.orderRepo.findById(input.orderId, tx);
      const itemsList = orderLineItems?.items ?? [];

      // 3. Status Action: Idempotent Stock Commitment on Confirmed
      if (toStatus === "confirmed") {
        for (const item of itemsList) {
          if (item.variantId) {
            await this.invService.commitOrderSale(
              item.variantId,
              item.quantity,
              currentOrder.id,
              admin.id,
              tx
            );
          }
        }
      }

      // 4. Status Action: Explicit Cancellation Scenarios
      if (toStatus === "cancelled") {
        const wasCommitted = ["confirmed", "processing"].includes(fromStatus);
        const wasDispatched = ["shipped", "delivered"].includes(fromStatus);

        if (!wasDispatched) {
          // Scenario A (unpaid: release reservation) or Scenario B (paid unshipped: restore warehouse stock)
          for (const item of itemsList) {
            if (item.variantId) {
              await this.invService.cancelOrderStock(
                item.variantId,
                item.quantity,
                currentOrder.id,
                wasCommitted,
                admin.id,
                tx
              );
            }
          }
        }
        // Scenario C (wasDispatched): Goods are with courier/customer; DO NOT automatically restock.
        // Payment remains paid (refund requires explicit separate action).
      }

      // 5. Update Order Status in Database
      const updated = await this.orderRepo.updateOrderStatus(
        currentOrder.id,
        toStatus,
        fromStatus,
        input.note || null,
        admin.id,
        tx
      );

      return updated;
    });
  }

  /**
   * Updates courier tracking and dispatches order.
   * Requires at least staff role.
   */
  async updateOrderShipping(
    input: UpdateOrderShippingInput,
    admin: AdminContext
  ): Promise<Order> {
    assertRole(admin, ["staff"]);

    return db.transaction(async (tx) => {
      const current = await this.orderRepo.findForUpdate(input.orderId, tx);
      if (!current) {
        throw new NotFoundError("Order", input.orderId);
      }

      const updateData: Record<string, unknown> = {};
      if (input.courier !== undefined) updateData.courier = input.courier;
      if (input.trackingNumber !== undefined) updateData.trackingNumber = input.trackingNumber;

      if (input.markShipped && current.status !== "shipped") {
        updateData.status = "shipped";
        updateData.shippedAt = new Date();
      }

      if (input.markDelivered && current.status !== "delivered") {
        updateData.status = "delivered";
        updateData.deliveredAt = new Date();
      }

      const updated = await this.orderRepo.updateShippingInfo(input.orderId, updateData, tx);

      if (updateData.status && updateData.status !== current.status) {
        await this.orderRepo.updateOrderStatus(
          current.id,
          updateData.status as OrderStatus,
          current.status as OrderStatus,
          `Shipping status updated with courier '${input.courier || "N/A"}'.`,
          admin.id,
          tx
        );
      }

      return updated;
    });
  }

  /**
   * Appends internal team note to order.
   * Requires at least staff role.
   */
  async addOrderNote(input: AddOrderNoteInput, admin: AdminContext): Promise<OrderNote> {
    assertRole(admin, ["staff"]);
    const order = await this.orderRepo.findById(input.orderId);
    if (!order) {
      throw new NotFoundError("Order", input.orderId);
    }

    return this.orderRepo.addNote({
      orderId: input.orderId,
      body: input.body,
      createdBy: admin.id,
    });
  }
}

export const orderService = new OrderService();
