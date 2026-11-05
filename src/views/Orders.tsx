'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Filter,
  MoreHorizontal,
  SearchX,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { PageHeader } from "../components/shared/page-header";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { Avatar } from "../components/shared/thumb";
import { OrderStatusBadge, PaymentStatusBadge } from "../components/shared/status-badges";
import { useSimulatedLoading } from "../components/shared/use-simulated-loading";
import { TableSkeleton } from "../components/ui/skeleton";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../data/mock";
import { formatDate, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { OrderStatus, PaymentMethodId, PaymentStatus } from "../lib/types";

type SortKey = "newest" | "oldest" | "total-desc" | "total-asc";

export default function OrdersPage() {
  const { state, setOrderStatus } = useStore();
  const { toast } = useToast();
  const loading = useSimulatedLoading(320);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [paymentStatus, setPaymentStatus] = useState<"all" | PaymentStatus>("all");
  const [method, setMethod] = useState<"all" | PaymentMethodId>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = state.orders.filter((order) => {
      const matchesQuery =
        !q ||
        order.orderNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.customerPhone.includes(q) ||
        order.customerEmail.toLowerCase().includes(q) ||
        order.items.some((i) => i.productName.toLowerCase().includes(q));
      const matchesStatus = status === "all" || order.status === status;
      const matchesPayment =
        paymentStatus === "all" || order.paymentStatus === paymentStatus;
      const matchesMethod = method === "all" || order.paymentMethod === method;
      return matchesQuery && matchesStatus && matchesPayment && matchesMethod;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "oldest":
          return +new Date(a.date) - +new Date(b.date);
        case "total-desc":
          return b.total - a.total;
        case "total-asc":
          return a.total - b.total;
        default:
          return +new Date(b.date) - +new Date(a.date);
      }
    });
    return sorted;
  }, [state.orders, query, status, paymentStatus, method, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const stats = [
    {
      label: "All orders",
      value: state.orders.length,
      icon: ShoppingBag,
      tone: "navy",
    },
    {
      label: "Needs action",
      value: state.orders.filter(
        (o) =>
          o.status === "awaiting_payment" ||
          o.status === "payment_submitted" ||
          o.status === "pending_cod",
      ).length,
      icon: ClipboardList,
      tone: "amber",
    },
    {
      label: "In fulfilment",
      value: state.orders.filter(
        (o) => o.status === "confirmed" || o.status === "processing" || o.status === "shipped",
      ).length,
      icon: Truck,
      tone: "brand",
    },
    {
      label: "Revenue",
      value: formatPKR(
        state.orders
          .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
          .reduce((sum, o) => sum + o.total, 0),
      ),
      icon: CircleDollarSign,
      tone: "violet",
    },
  ];

  const statusOptions: OrderStatus[] = [
    "awaiting_payment",
    "payment_submitted",
    "pending_cod",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Sales"
        title="Orders"
        description="Every order across the store with payment, fulfilment and status controls."
        actions={
          <Button variant="outline" asChild>
            <Link href="/payments">
              <CircleDollarSign className="h-4 w-4" />
              Verify payments
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                <p className="mt-1.5 text-[20px] font-semibold leading-none text-ink tabular">
                  {stat.value}
                </p>
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg",
                  stat.tone === "brand" && "bg-brand-50 text-brand-600",
                  stat.tone === "navy" && "bg-navy-50 text-navy-600",
                  stat.tone === "amber" && "bg-amber-50 text-amber-600",
                  stat.tone === "violet" && "bg-violet-50 text-violet-600",
                )}
              >
                <stat.icon className="h-4.5 w-4.5" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 xl:flex-row xl:items-center">
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Search order number, customer or product…"
              className="w-full xl:max-w-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as "all" | OrderStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All order statuses</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ORDER_STATUS_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={paymentStatus}
                onValueChange={(value) => {
                  setPaymentStatus(value as "all" | PaymentStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="submitted">Submitted</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={method}
                onValueChange={(value) => {
                  setMethod(value as "all" | PaymentMethodId);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment methods</SelectItem>
                  {Object.entries(PAYMENT_METHOD_LABEL).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="total-desc">Highest value</SelectItem>
                  <SelectItem value="total-asc">Lowest value</SelectItem>
                </SelectContent>
              </Select>

              {(query || status !== "all" || paymentStatus !== "all" || method !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setPaymentStatus("all");
                    setMethod("all");
                  }}
                >
                  <Filter className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          {loading ? (
            <TableSkeleton rows={8} cols={7} />
          ) : visible.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<SearchX className="h-5 w-5" />}
              title="No orders found"
              description="Try clearing the filters or searching for a different order number."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatus("all");
                    setPaymentStatus("all");
                    setMethod("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono text-[12.5px] font-medium text-brand-700 hover:underline"
                        >
                          {order.orderNumber}
                        </Link>
                        <p className="mt-0.5 text-[11.5px] text-ink-muted">
                          {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                        </p>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={order.customerName} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-medium text-ink">
                              {order.customerName}
                            </p>
                            <p className="truncate text-[11.5px] text-ink-muted">
                              {order.shippingAddress.city}
                              {order.customerType === "guest" && " · Guest"}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(order.date)}</TableCell>
                      <TableCell className="text-right tabular">
                        {order.items.reduce((sum, i) => sum + i.quantity, 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-ink tabular">
                        {formatPKR(order.total)}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </TableCell>
                      <TableCell>
                        <OrderStatusBadge status={order.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Order actions">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
                            <DropdownMenuItem asChild>
                              <Link href={`/orders/${order.id}`}>
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                Open order
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {statusOptions.map((option) => (
                              <DropdownMenuItem
                                key={option}
                                onClick={() => {
                                  setOrderStatus(order.id, option);
                                  toast({
                                    title: `Order moved to ${ORDER_STATUS_LABEL[option]}`,
                                    description: `${order.orderNumber} updated.`,
                                  });
                                }}
                              >
                                Mark as {ORDER_STATUS_LABEL[option]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination
                page={safePage}
                pageSize={pageSize}
                total={filtered.length}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
