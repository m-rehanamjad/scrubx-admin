"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  CreditCard,
  Menu,
  Package,
  Search,
  ShoppingBag,
  Users,
} from "lucide-react";
import { SidebarBrand, SidebarNav } from "./sidebar";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar } from "../shared/thumb";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useStore } from "../../data/store";
import { formatPKR, relativeTime } from "../../lib/format";
import { authClient } from "@/lib/auth-client";
import { cn } from "../../lib/utils";

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Dashboard", subtitle: "Store performance at a glance" },
  "/products": { title: "Products", subtitle: "Manage your catalogue" },
  "/products/new": {
    title: "New Product",
    subtitle: "Add an item to the catalogue",
  },
  "/categories": {
    title: "Categories",
    subtitle: "Organise your catalogue tree",
  },
  "/inventory": { title: "Inventory", subtitle: "Stock levels and movements" },
  "/orders": { title: "Orders", subtitle: "Track and fulfil orders" },
  "/payments": {
    title: "Payment Verification",
    subtitle: "Review submitted payments",
  },
  "/payment-methods": {
    title: "Payment Methods",
    subtitle: "Configure checkout methods",
  },
  "/engraving": {
    title: "Engraving Options",
    subtitle: "Name and logo engraving services",
  },
  "/customers": {
    title: "Customers",
    subtitle: "Registered and guest customers",
  },
  "/coupons": { title: "Coupons", subtitle: "Discount codes and limits" },
  "/shipping": { title: "Shipping", subtitle: "Delivery methods and charges" },
  "/settings": {
    title: "Store Settings",
    subtitle: "General store configuration",
  },
};

function resolveMeta(pathname: string) {
  if (PAGE_META[pathname]) return PAGE_META[pathname];
  if (pathname.startsWith("/products/") && pathname.endsWith("/edit"))
    return { title: "Edit Product", subtitle: "Update catalogue listing" };
  if (pathname.startsWith("/products/"))
    return { title: "Product", subtitle: "Catalogue listing details" };
  if (pathname.startsWith("/orders/"))
    return { title: "Order", subtitle: "Order details and fulfilment" };
  if (pathname.startsWith("/customers/"))
    return { title: "Customer", subtitle: "Customer profile" };
  return { title: "ScrubX Admin", subtitle: "" };
}

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { data: session } = authClient.useSession();
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { state } = useStore();
  const meta = resolveMeta(pathname);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchOpen(false);
    setQuery("");
  }, [pathname]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { products: [], orders: [], customers: [] };
    return {
      products: state.products
        .filter((p) => p.name.toLowerCase().includes(q) || p.slug.includes(q))
        .slice(0, 4),
      orders: state.orders
        .filter(
          (o) =>
            o.orderNumber.toLowerCase().includes(q) ||
            o.customerName.toLowerCase().includes(q),
        )
        .slice(0, 4),
      customers: state.customers
        .filter(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.email.toLowerCase().includes(q),
        )
        .slice(0, 3),
    };
  }, [query, state.products, state.orders, state.customers]);

  const hasResults =
    results.products.length + results.orders.length + results.customers.length >
    0;

  const notifications = useMemo(() => {
    const items: {
      id: string;
      title: string;
      body: string;
      at: string;
      to: string;
    }[] = [];
    state.paymentSubmissions
      .filter((s) => s.status === "submitted")
      .slice(0, 3)
      .forEach((s) =>
        items.push({
          id: s.id,
          title: "Payment awaiting verification",
          body: `${s.orderNumber} · ${formatPKR(s.amount)}`,
          at: s.submittedAt,
          to: "/payments",
        }),
      );
    state.orders
      .filter(
        (o) =>
          o.status === "awaiting_payment" || o.status === "payment_submitted",
      )
      .slice(0, 3)
      .forEach((o) =>
        items.push({
          id: o.id,
          title: `Order ${o.orderNumber} needs attention`,
          body: o.customerName,
          at: o.date,
          to: `/orders/${o.id}`,
        }),
      );
    return items.slice(0, 5);
  }, [state.paymentSubmissions, state.orders]);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onOpenMenu}
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-ink">
          {meta.title}
        </h1>
        {meta.subtitle && (
          <p className="hidden truncate text-[12px] text-ink-muted sm:block">
            {meta.subtitle}
          </p>
        )}
      </div>

      <div className="relative hidden md:block" ref={searchRef}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search products, orders, customers…"
          className="h-9 w-[300px] pl-9 pr-12 lg:w-[340px]"
        />
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
          /
        </kbd>

        {searchOpen && query.trim() && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setSearchOpen(false)}
              aria-hidden
            />
            <div className="absolute right-0 top-11 z-20 w-[380px] overflow-hidden rounded-lg border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(13,20,36,0.3)]">
              {!hasResults ? (
                <p className="px-4 py-6 text-center text-[13px] text-ink-muted">
                  No matches for “{query}”.
                </p>
              ) : (
                <div className="max-h-[380px] overflow-y-auto scrollbar-thin py-1.5">
                  {results.products.length > 0 && (
                    <>
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                        Products
                      </p>
                      {results.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => router.push(`/products/${p.id}/edit`)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                        >
                          <Package className="h-4 w-4 text-ink-muted" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                            {p.name}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {p.variants.length} variants
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {results.orders.length > 0 && (
                    <>
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                        Orders
                      </p>
                      {results.orders.map((o) => (
                        <button
                          key={o.id}
                          onClick={() => router.push(`/orders/${o.id}`)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                        >
                          <ShoppingBag className="h-4 w-4 text-ink-muted" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                            {o.orderNumber} · {o.customerName}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {formatPKR(o.total)}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                  {results.customers.length > 0 && (
                    <>
                      <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                        Customers
                      </p>
                      {results.customers.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => router.push(`/customers/${c.id}`)}
                          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-muted"
                        >
                          <Users className="h-4 w-4 text-ink-muted" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                            {c.name}
                          </span>
                          <span className="text-[11px] text-ink-muted">
                            {c.city}
                          </span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[340px] p-0">
          <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
            <p className="text-[13px] font-semibold text-ink">Notifications</p>
            <Badge variant="neutral">{notifications.length}</Badge>
          </div>
          <div className="max-h-[320px] overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-muted">
                You're all caught up.
              </p>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  asChild
                  className="items-start p-0"
                >
                  <Link
                    href={n.to}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                      {n.to === "/payments" ? (
                        <CreditCard className="h-3.5 w-3.5" />
                      ) : (
                        <ShoppingBag className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {n.title}
                      </span>
                      <span className="block truncate text-[12px] text-ink-muted">
                        {n.body}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-muted">
                      {relativeTime(n.at)}
                    </span>
                  </Link>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors hover:bg-surface-muted">
            <Avatar name={session?.user.name || "Admin"} size="md" />
            <span className="hidden text-left lg:block">
              <span className="block text-[13px] font-semibold leading-tight text-ink">
                {session?.user.name || "Admin"}
              </span>
              <span className="block text-[11px] leading-tight text-ink-muted">
                Store Administrator
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
          <div className="px-2.5 pb-2">
            <p className="text-[13px] font-medium text-ink">
              {session?.user.name || "Admin"}
            </p>
            <p className="text-[12px] text-ink-muted">{session?.user.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">Store settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/orders">Order queue</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={async () => {
              await authClient.signOut();
              window.location.assign("/login");
            }}
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className={cn(
        "fixed inset-0 z-50 lg:hidden",
        open ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "absolute inset-0 bg-navy-900/45 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "absolute inset-y-0 left-0 flex w-[268px] flex-col border-r border-line bg-surface transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <SidebarBrand />
          <button
            onClick={onClose}
            className="mr-4 rounded-md p-1.5 text-ink-muted hover:bg-surface-muted"
            aria-label="Close navigation"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <SidebarNav onNavigate={onClose} />
        </div>
      </aside>
    </div>
  );
}
