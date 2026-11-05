"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppState,
  Category,
  Coupon,
  Customer,
  EngravingOption,
  InventoryMovementType,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
  ShippingMethod,
  StoreSettings,
} from "@/lib/types";
import { emptyState } from "./empty";
interface StoreContextValue {
  state: AppState;
  setProducts: (updater: (products: Product[]) => Product[]) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  setProductStatus: (id: string, status: Product["status"]) => Promise<void>;
  saveCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  toggleCategoryStatus: (id: string) => Promise<void>;
  setOrderStatus: (
    id: string,
    status: OrderStatus,
    note?: string,
  ) => Promise<void>;
  setOrderCourier: (
    id: string,
    courier: string,
    trackingNumber: string,
  ) => Promise<void>;
  addOrderNote: (id: string, text: string) => Promise<void>;
  approvePayment: (submissionId: string) => Promise<void>;
  rejectPayment: (submissionId: string, reason: string) => Promise<void>;
  setVariantStock: (
    productId: string,
    variantId: string,
    newStock: number,
    type: InventoryMovementType,
    reason: string,
    note?: string,
  ) => Promise<void>;
  saveCoupon: (coupon: Coupon) => Promise<void>;
  deleteCoupon: (id: string) => Promise<void>;
  savePaymentMethod: (method: PaymentMethod) => Promise<void>;
  saveEngravingOption: (option: EngravingOption) => Promise<void>;
  deleteEngravingOption: (id: string) => Promise<void>;
  saveShippingMethod: (method: ShippingMethod) => Promise<void>;
  deleteShippingMethod: (id: string) => Promise<void>;
  addCustomerNote: (customerId: string, text: string) => Promise<void>;
  updateSettings: (patch: Partial<StoreSettings>) => Promise<void>;
  loading: boolean;
  pending: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);
  const stateRef = useRef(state);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const queue = useRef<Promise<void>>(Promise.resolve());
  async function refresh() {
    const response = await fetch("/api/admin/state", { cache: "no-store" });
    if (response.status === 401) {
      window.location.assign("/login");
      throw new Error("Session expired.");
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || "Unable to load store data.");
    stateRef.current = data;
    setState(data);
    setLoaded(true);
    setError("");
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  function run(operation: string, input: unknown): Promise<void> {
    const next = queue.current
      .catch(() => {})
      .then(async () => {
        setPending(true);
        setError("");
        try {
          const response = await fetch(`/api/admin/${operation}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          });
          if (response.status === 401) window.location.assign("/login");
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Change could not be saved.");
          await refresh();
        } catch (e) {
          const message = e instanceof Error ? e.message : "Request failed.";
          setError(message);
          throw e;
        } finally {
          setPending(false);
        }
      });
    queue.current = next;
    // Also attach a rejection handler for event handlers that do not await.
    void next.catch(() => {});
    return next;
  }
  const value: StoreContextValue = {
    state,
    loading,
    pending,
    error,
    refresh,
    setProducts: async (updater) => {
      const previous = stateRef.current.products;
      const next = updater(previous);
      for (const p of next) {
        const old = previous.find((v) => v.id === p.id);
        if (JSON.stringify(old) !== JSON.stringify(p))
          await run("saveProduct", p);
      }
      for (const p of previous)
        if (!next.some((v) => v.id === p.id))
          await run("deleteProduct", { id: p.id });
    },
    saveProduct: (p) => run("saveProduct", p),
    deleteProduct: (id) => run("deleteProduct", { id }),
    setProductStatus: (id, status) => run("setProductStatus", { id, status }),
    saveCategory: (p) => run("saveCategory", p),
    deleteCategory: (id) => run("deleteCategory", { id }),
    toggleCategoryStatus: (id) => run("toggleCategoryStatus", { id }),
    setOrderStatus: (id, status, note) =>
      run("setOrderStatus", { id, status, note }),
    setOrderCourier: (id, courier, trackingNumber) =>
      run("setOrderCourier", { id, courier, trackingNumber }),
    addOrderNote: (id, text) => run("addOrderNote", { id, text }),
    approvePayment: (id) => run("approvePayment", { id }),
    rejectPayment: (id, reason) => run("rejectPayment", { id, reason }),
    setVariantStock: (productId, variantId, newStock, type, reason, note) =>
      run("setVariantStock", {
        productId,
        variantId,
        newStock,
        type,
        reason,
        note,
        expectedStock: stateRef.current.products
          .find((p) => p.id === productId)
          ?.variants.find((v) => v.id === variantId)?.stock,
      }),
    saveCoupon: (p) => run("saveCoupon", p),
    deleteCoupon: (id) => run("deleteCoupon", { id }),
    savePaymentMethod: (p) => run("savePaymentMethod", p),
    saveEngravingOption: (p) => run("saveEngravingOption", p),
    deleteEngravingOption: (id) => run("deleteEngravingOption", { id }),
    saveShippingMethod: (p) => run("saveShippingMethod", p),
    deleteShippingMethod: (id) => run("deleteShippingMethod", { id }),
    addCustomerNote: (id, text) => run("addCustomerNote", { id, text }),
    updateSettings: (p) => run("updateSettings", p),
  };
  return (
    <StoreContext.Provider value={value}>
      {error && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-red-300 bg-red-50 p-4 text-red-900"
        >
          {error}{" "}
          <button
            className="underline"
            onClick={() => {
              setLoading(true);
              refresh()
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false));
            }}
          >
            Retry loading data
          </button>
        </div>
      )}
      {pending && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 rounded bg-teal-800 px-4 py-2 text-white"
        >
          Saving changes…
        </div>
      )}
      {loading ? (
        <main className="p-10" role="status">
          Loading store data…
        </main>
      ) : !loaded ? null : (
        children
      )}
    </StoreContext.Provider>
  );
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
  return product.variants.reduce(
    (sum, v) => sum + Math.max(0, v.stock - v.reserved),
    0,
  );
}

export function customerStats(customer: Customer, orders: Order[]) {
  const own = orders.filter((o) => o.customerId === customer.id);
  const spend = own
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  return { orders: own.length, spend };
}
