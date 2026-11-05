'use client';

import { useState } from "react";
import { SidebarBrand, SidebarNav } from "./sidebar";
import { MobileNav, Topbar } from "./topbar";
import { useStore } from "../../data/store";
import { formatPKR } from "../../lib/format";
import { Clock } from "lucide-react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { state } = useStore();
  const pending = state.orders.filter(
    (o) => o.status === "awaiting_payment" || o.status === "payment_submitted",
  ).length;
  const todaysRevenue = state.orders
    .filter(
      (o) =>
        new Date(o.date).toDateString() === new Date().toDateString() &&
        o.status !== "cancelled",
    )
    .reduce((sum, o) => sum + o.total, 0);

  return (
    <div className="flex min-h-screen bg-canvas">
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <SidebarBrand />
        <div className="scrollbar-thin flex-1 overflow-y-auto">
          <SidebarNav />
        </div>
        <div className="border-t border-line p-3">
          <div className="rounded-lg border border-brand-100 bg-brand-50/70 p-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
              <Clock className="h-3.5 w-3.5" />
              Today
            </div>
            <p className="mt-1.5 text-[13px] font-semibold text-ink">{formatPKR(todaysRevenue)}</p>
            <p className="text-[11px] text-ink-muted">
              {pending} order{pending === 1 ? "" : "s"} awaiting action
            </p>
          </div>
        </div>
      </aside>

      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main className="flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
