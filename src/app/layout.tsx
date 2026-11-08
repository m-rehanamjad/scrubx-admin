import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/layout/app-shell";
import { getCurrentAdmin } from "@/server/auth";
import { db } from "@/db";
import { orders, payments, inventory } from "@/db/schema";
import { sql } from "drizzle-orm";
import { serializeDate } from "@/lib/dto";
import { formatPKR } from "@/lib/format";

export const runtime = "nodejs";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    template: "%s | ScrubX Admin",
    default: "ScrubX Admin — Medical Apparel Storefront",
  },
  description:
    "ScrubX admin panel — manage medical scrubs, lab coats and accessories across Pakistan.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let layoutStats = {
    pendingOrders: 0,
    pendingPayments: 0,
    lowStockCount: 0,
    todaysRevenue: 0,
  };
  const notifications: Array<{ id: string; title: string; body: string; at: string; to: string }> = [];

  try {
    const admin = await getCurrentAdmin();
    if (admin) {
      const [
        [pendingOrdersRow],
        [pendingPaymentsRow],
        [lowStockRow],
        [todaysRevenueRow],
        recentPayments,
        recentOrders,
      ] = await Promise.all([
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(orders)
          .where(sql`${orders.status} IN ('awaiting_payment', 'payment_submitted', 'pending')`),
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(payments)
          .where(sql`${payments.status} = 'awaiting_verification'`),
        db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(inventory)
          .where(sql`(${inventory.quantityOnHand} - ${inventory.quantityReserved}) <= ${inventory.reorderLevel}`),
        db
          .select({ total: sql<number>`cast(coalesce(sum(${orders.total}), 0) as int)` })
          .from(orders)
          .where(sql`date(${orders.createdAt}) = current_date AND ${orders.status} NOT IN ('cancelled', 'refunded')`),
        db
          .select({
            id: payments.id,
            amount: payments.amount,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .where(sql`${payments.status} = 'awaiting_verification'`)
          .limit(3),
        db
          .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            customerName: sql<string>`coalesce(${orders.shippingAddress}->>'fullName', 'Customer')`,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(sql`${orders.status} IN ('awaiting_payment', 'payment_submitted', 'pending')`)
          .limit(3),
      ]);

      layoutStats = {
        pendingOrders: pendingOrdersRow?.count ?? 0,
        pendingPayments: pendingPaymentsRow?.count ?? 0,
        lowStockCount: lowStockRow?.count ?? 0,
        todaysRevenue: todaysRevenueRow?.total ?? 0,
      };

      recentPayments.forEach((p) => {
        notifications.push({
          id: p.id,
          title: "Payment awaiting verification",
          body: formatPKR(Number(p.amount)),
          at: serializeDate(p.createdAt),
          to: "/payments",
        });
      });

      recentOrders.forEach((o) => {
        notifications.push({
          id: o.id,
          title: `Order ${o.orderNumber} needs attention`,
          body: o.customerName,
          at: serializeDate(o.createdAt),
          to: `/orders/${o.id}`,
        });
      });
    }
  } catch {
    // Unauthenticated request, e.g. /login or public route
  }

  return (
    <html
      lang="en"
      className={`${inter.variable} ${plusJakartaSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <Providers>
          <AppShell layoutStats={layoutStats} notifications={notifications}>
            {children}
          </AppShell>
        </Providers>
      </body>
    </html>
  );
}
