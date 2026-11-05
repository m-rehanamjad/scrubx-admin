'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Category,
  Coupon,
  Customer,
  EngravingOption,
  InventoryMovement,
  InventoryMovementType,
  Order,
  OrderStatus,
  PaymentMethod,
  PaymentSubmission,
  Product,
  ShippingMethod,
  StoreSettings,
} from "../lib/types";
import { initialState, ORDER_STATUS_LABEL } from "./mock";
import { uid } from "../lib/utils";
import { daysAgo } from "../lib/format";

const STORAGE_KEY = "scrubx-admin-state-v1";

interface StoreContextValue {
  state: AppState;
  setProducts: (updater: (products: Product[]) => Product[]) => void;
  saveProduct: (product: Product) => void;
  deleteProduct: (id: string) => void;
  setProductStatus: (id: string, status: Product["status"]) => void;
  saveCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
  toggleCategoryStatus: (id: string) => void;
  setOrderStatus: (id: string, status: OrderStatus, note?: string) => void;
  setOrderCourier: (id: string, courier: string, trackingNumber: string) => void;
  addOrderNote: (id: string, text: string) => void;
  approvePayment: (submissionId: string) => void;
  rejectPayment: (submissionId: string, reason: string) => void;
  setVariantStock: (
    productId: string,
    variantId: string,
    newStock: number,
    type: InventoryMovementType,
    reason: string,
    note?: string,
  ) => void;
  saveCoupon: (coupon: Coupon) => void;
  deleteCoupon: (id: string) => void;
  savePaymentMethod: (method: PaymentMethod) => void;
  saveEngravingOption: (option: EngravingOption) => void;
  deleteEngravingOption: (id: string) => void;
  saveShippingMethod: (method: ShippingMethod) => void;
  deleteShippingMethod: (id: string) => void;
  addCustomerNote: (customerId: string, text: string) => void;
  updateSettings: (patch: Partial<StoreSettings>) => void;
  resetDemoData: () => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        if (parsed.products && parsed.orders) {
          setState(parsed);
        }
      }
    } catch {
      /* storage unavailable — demo state stays in memory */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable — demo state stays in memory */
    }
  }, [state, loaded]);

  const setProducts = useCallback((updater: (products: Product[]) => Product[]) => {
    setState((prev) => ({ ...prev, products: updater(prev.products) }));
  }, []);

  const saveProduct = useCallback((product: Product) => {
    setState((prev) => {
      const exists = prev.products.some((p) => p.id === product.id);
      const next = exists
        ? prev.products.map((p) => (p.id === product.id ? product : p))
        : [product, ...prev.products];
      return { ...prev, products: next };
    });
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
      inventoryMovements: prev.inventoryMovements.filter((m) => m.productId !== id),
    }));
  }, []);

  const setProductStatus = useCallback((id: string, status: Product["status"]) => {
    setState((prev) => ({
      ...prev,
      products: prev.products.map((p) =>
        p.id === id ? { ...p, status, updatedAt: new Date().toISOString() } : p,
      ),
    }));
  }, []);

  const saveCategory = useCallback((category: Category) => {
    setState((prev) => {
      const exists = prev.categories.some((c) => c.id === category.id);
      return {
        ...prev,
        categories: exists
          ? prev.categories.map((c) => (c.id === category.id ? category : c))
          : [...prev.categories, category],
      };
    });
  }, []);

  const deleteCategory = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories
        .filter((c) => c.id !== id)
        .map((c) => (c.parentId === id ? { ...c, parentId: null } : c)),
    }));
  }, []);

  const toggleCategoryStatus = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      categories: prev.categories.map((c) =>
        c.id === id ? { ...c, status: c.status === "active" ? "inactive" : "active" } : c,
      ),
    }));
  }, []);

  const setOrderStatus = useCallback((id: string, status: OrderStatus, note?: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((order) => {
        if (order.id !== id) return order;
        const patch: Partial<Order> = { status };
        if (status === "confirmed" || status === "processing") {
          patch.paymentStatus = order.paymentStatus === "submitted" ? "approved" : order.paymentStatus;
        }
        if (status === "refunded") patch.paymentStatus = "refunded";
        if (status === "cancelled" && order.paymentStatus === "pending") {
          patch.paymentStatus = "failed";
        }
        return {
          ...order,
          ...patch,
          timeline: [
            ...order.timeline,
            {
              status,
              label: ORDER_STATUS_LABEL[status],
              at: new Date().toISOString(),
              note: note ?? "Updated by admin",
              by: "ScrubX Admin",
            },
          ],
        };
      }),
    }));
  }, []);

  const setOrderCourier = useCallback((id: string, courier: string, trackingNumber: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((order) =>
        order.id === id ? { ...order, courier, trackingNumber } : order,
      ),
    }));
  }, []);

  const addOrderNote = useCallback((id: string, text: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((order) =>
        order.id === id
          ? {
              ...order,
              internalNotes: [
                ...order.internalNotes,
                { id: uid("note"), text, at: new Date().toISOString(), by: "ScrubX Admin" },
              ],
            }
          : order,
      ),
    }));
  }, []);

  const approvePayment = useCallback((submissionId: string) => {
    setState((prev) => {
      const submission = prev.paymentSubmissions.find((s) => s.id === submissionId);
      if (!submission) return prev;
      const reviewedAt = new Date().toISOString();
      return {
        ...prev,
        paymentSubmissions: prev.paymentSubmissions.map((s) =>
          s.id === submissionId ? { ...s, status: "approved", reviewedAt } : s,
        ),
        orders: prev.orders.map((order) =>
          order.id === submission.orderId
            ? {
                ...order,
                paymentStatus: "approved",
                status: order.status === "payment_submitted" ? "confirmed" : order.status,
                timeline: [
                  ...order.timeline,
                  {
                    status: "confirmed" as OrderStatus,
                    label: ORDER_STATUS_LABEL.confirmed,
                    at: reviewedAt,
                    note: `Payment verified via ${submission.transactionRef}`,
                    by: "ScrubX Admin",
                  },
                ],
              }
            : order,
        ),
      };
    });
  }, []);

  const rejectPayment = useCallback((submissionId: string, reason: string) => {
    setState((prev) => {
      const submission = prev.paymentSubmissions.find((s) => s.id === submissionId);
      if (!submission) return prev;
      const reviewedAt = new Date().toISOString();
      return {
        ...prev,
        paymentSubmissions: prev.paymentSubmissions.map((s) =>
          s.id === submissionId ? { ...s, status: "rejected", rejectionReason: reason, reviewedAt } : s,
        ),
        orders: prev.orders.map((order) =>
          order.id === submission.orderId
            ? {
                ...order,
                paymentStatus: "failed",
                status: "awaiting_payment" as OrderStatus,
                timeline: [
                  ...order.timeline,
                  {
                    status: "awaiting_payment" as OrderStatus,
                    label: ORDER_STATUS_LABEL.awaiting_payment,
                    at: reviewedAt,
                    note: `Payment rejected: ${reason}`,
                    by: "ScrubX Admin",
                  },
                ],
              }
            : order,
        ),
      };
    });
  }, []);

  const setVariantStock = useCallback(
    (
      productId: string,
      variantId: string,
      newStock: number,
      type: InventoryMovementType,
      reason: string,
      note?: string,
    ) => {
      setState((prev) => {
        const product = prev.products.find((p) => p.id === productId);
        const variant = product?.variants.find((v) => v.id === variantId);
        if (!product || !variant) return prev;

        const delta = newStock - variant.stock;
        const movement: InventoryMovement = {
          id: uid("mov"),
          productId,
          productName: product.name,
          variantId,
          variantName: variant.name,
          sku: variant.sku,
          type,
          quantity: delta,
          reason,
          note,
          at: new Date().toISOString(),
          by: "ScrubX Admin",
        };

        return {
          ...prev,
          products: prev.products.map((p) =>
            p.id === productId
              ? {
                  ...p,
                  variants: p.variants.map((v) =>
                    v.id === variantId ? { ...v, stock: Math.max(0, newStock) } : v,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : p,
          ),
          inventoryMovements: [movement, ...prev.inventoryMovements],
        };
      });
    },
    [],
  );

  const saveCoupon = useCallback((coupon: Coupon) => {
    setState((prev) => {
      const exists = prev.coupons.some((c) => c.id === coupon.id);
      return {
        ...prev,
        coupons: exists
          ? prev.coupons.map((c) => (c.id === coupon.id ? coupon : c))
          : [coupon, ...prev.coupons],
      };
    });
  }, []);

  const deleteCoupon = useCallback((id: string) => {
    setState((prev) => ({ ...prev, coupons: prev.coupons.filter((c) => c.id !== id) }));
  }, []);

  const savePaymentMethod = useCallback((method: PaymentMethod) => {
    setState((prev) => ({
      ...prev,
      paymentMethods: prev.paymentMethods.map((m) => (m.id === method.id ? method : m)),
    }));
  }, []);

  const saveEngravingOption = useCallback((option: EngravingOption) => {
    setState((prev) => {
      const exists = prev.engravingOptions.some((o) => o.id === option.id);
      return {
        ...prev,
        engravingOptions: exists
          ? prev.engravingOptions.map((o) => (o.id === option.id ? option : o))
          : [option, ...prev.engravingOptions],
      };
    });
  }, []);

  const deleteEngravingOption = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      engravingOptions: prev.engravingOptions.filter((o) => o.id !== id),
    }));
  }, []);

  const saveShippingMethod = useCallback((method: ShippingMethod) => {
    setState((prev) => {
      const exists = prev.shippingMethods.some((m) => m.id === method.id);
      return {
        ...prev,
        shippingMethods: exists
          ? prev.shippingMethods.map((m) => (m.id === method.id ? method : m))
          : [...prev.shippingMethods, method],
      };
    });
  }, []);

  const deleteShippingMethod = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      shippingMethods: prev.shippingMethods.filter((m) => m.id !== id),
    }));
  }, []);

  const addCustomerNote = useCallback((customerId: string, text: string) => {
    setState((prev) => ({
      ...prev,
      customers: prev.customers.map((c) =>
        c.id === customerId
          ? { ...c, notes: [...c.notes, { id: uid("note"), text, at: new Date().toISOString() }] }
          : c,
      ),
    }));
  }, []);

  const updateSettings = useCallback((patch: Partial<StoreSettings>) => {
    setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }));
  }, []);

  const resetDemoData = useCallback(() => {
    setState({
      ...initialState,
      inventoryMovements: initialState.inventoryMovements.map((m) => ({
        ...m,
        at: m.at ?? daysAgo(1),
      })),
    });
  }, []);

  const value = useMemo<StoreContextValue>(
    () => ({
      state,
      setProducts,
      saveProduct,
      deleteProduct,
      setProductStatus,
      saveCategory,
      deleteCategory,
      toggleCategoryStatus,
      setOrderStatus,
      setOrderCourier,
      addOrderNote,
      approvePayment,
      rejectPayment,
      setVariantStock,
      saveCoupon,
      deleteCoupon,
      savePaymentMethod,
      saveEngravingOption,
      deleteEngravingOption,
      saveShippingMethod,
      deleteShippingMethod,
      addCustomerNote,
      updateSettings,
      resetDemoData,
    }),
    [
      state,
      setProducts,
      saveProduct,
      deleteProduct,
      setProductStatus,
      saveCategory,
      deleteCategory,
      toggleCategoryStatus,
      setOrderStatus,
      setOrderCourier,
      addOrderNote,
      approvePayment,
      rejectPayment,
      setVariantStock,
      saveCoupon,
      deleteCoupon,
      savePaymentMethod,
      saveEngravingOption,
      deleteEngravingOption,
      saveShippingMethod,
      deleteShippingMethod,
      addCustomerNote,
      updateSettings,
      resetDemoData,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/* ------------------------------------------------------------- derivations */

export function useCategoryName(categoryId: string) {
  const { state } = useStore();
  const category = state.categories.find((c) => c.id === categoryId);
  const parent = category?.parentId
    ? state.categories.find((c) => c.id === category.parentId)
    : undefined;
  if (!category) return "Uncategorised";
  return parent ? `${parent.name} / ${category.name}` : category.name;
}

export function productTotalStock(product: Product) {
  return product.variants.reduce((sum, v) => sum + v.stock, 0);
}

export function productAvailableStock(product: Product) {
  return product.variants.reduce((sum, v) => sum + Math.max(0, v.stock - v.reserved), 0);
}

export function customerStats(customer: Customer, orders: Order[]) {
  const own = orders.filter((o) => o.customerId === customer.id);
  const spend = own
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  return { orders: own.length, spend };
}
