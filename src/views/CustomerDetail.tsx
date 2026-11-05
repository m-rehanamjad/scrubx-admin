"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { PageHeader } from "../components/shared/page-header";
import { Avatar } from "../components/shared/thumb";
import { OrderStatusBadge } from "../components/shared/status-badges";
import { EmptyState } from "../components/shared/empty-state";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { formatDate, formatDateTime, formatPKR } from "../lib/format";

export default function CustomerDetailPage({
  id: propId,
}: { id?: string } = {}) {
  const routeParams = useParams();
  const id = propId ?? (routeParams?.id as string | undefined);
  const { state, addCustomerNote } = useStore();
  const { toast } = useToast();
  const [note, setNote] = useState("");

  const customer = useMemo(
    () => state.customers.find((c) => c.id === id),
    [state.customers, id],
  );
  const orders = useMemo(
    () =>
      state.orders
        .filter((o) => o.customerId === id)
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [state.orders, id],
  );

  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer record may have been removed."
        action={
          <Button asChild>
            <Link href="/customers">Back to customers</Link>
          </Button>
        }
      />
    );
  }

  const spend = orders
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + o.total, 0);
  const averageOrder = orders.length ? spend / orders.length : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link
            href="/customers"
            className="inline-flex items-center gap-1 hover:text-brand-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Customers
          </Link>
        }
        title={customer.name}
        description={`${customer.type === "registered" ? "Registered customer" : "Guest customer"} · ${customer.city} · joined ${formatDate(customer.registeredAt)}`}
        actions={
          <Badge variant={customer.type === "registered" ? "brand" : "neutral"}>
            {customer.type === "registered" ? "Registered" : "Guest"}
          </Badge>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Total orders",
                value: String(orders.length),
                icon: ShoppingBag,
              },
              {
                label: "Total spending",
                value: formatPKR(spend),
                icon: Wallet,
              },
              {
                label: "Average order",
                value: formatPKR(averageOrder),
                icon: ShoppingBag,
              },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-start justify-between p-4">
                  <div>
                    <p className="text-[12px] font-medium text-ink-muted">
                      {stat.label}
                    </p>
                    <p className="mt-1.5 text-[19px] font-semibold leading-none text-ink tabular">
                      {stat.value}
                    </p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <stat.icon className="h-4.5 w-4.5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">
                Order history
              </h2>
              <p className="text-[12.5px] text-ink-muted">
                {orders.length} order{orders.length === 1 ? "" : "s"} placed by
                this customer.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <EmptyState
                  className="m-4"
                  icon={<ShoppingBag className="h-5 w-5" />}
                  title="No orders yet"
                  description="This customer has not placed an order so far."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-[12.5px] font-medium text-brand-700 hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(order.date)}
                        </TableCell>
                        <TableCell className="text-right tabular">
                          {order.items.reduce((sum, i) => sum + i.quantity, 0)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {formatPKR(order.total)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {order.paymentMethod}
                        </TableCell>
                        <TableCell>
                          <OrderStatusBadge status={order.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Notes</h2>
              <p className="text-[12.5px] text-ink-muted">
                Internal notes about preferences, sizing or delivery
                instructions.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer.notes.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  No notes saved for this customer.
                </p>
              ) : (
                <div className="space-y-2">
                  {customer.notes.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-line bg-surface-muted/60 p-3"
                    >
                      <p className="text-[13px] text-ink">{item.text}</p>
                      <p className="mt-1 text-[11.5px] text-ink-muted">
                        {formatDateTime(item.at)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Textarea
                  rows={2}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Prefers navy scrubs, size medium"
                  className="flex-1"
                />
                <Button
                  className="self-start"
                  disabled={!note.trim()}
                  onClick={async () => {
                    try {
                      await addCustomerNote(customer.id, note.trim());
                      setNote("");
                      toast({ title: "Note saved" });
                    } catch {
                      return false;
                    }
                  }}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  Add note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-3">
                <Avatar name={customer.name} size="lg" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">
                    {customer.name}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    {customer.city}, Pakistan
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2.5 border-t border-line pt-4">
                <a
                  href={`mailto:${customer.email}`}
                  className="flex items-center gap-2 break-all text-[12.5px] text-ink-soft hover:text-brand-700"
                >
                  <Mail className="h-3.5 w-3.5 text-ink-muted" />
                  {customer.email}
                </a>
                <a
                  href={`tel:${customer.phone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-[12.5px] text-ink-soft hover:text-brand-700"
                >
                  <Phone className="h-3.5 w-3.5 text-ink-muted" />
                  {customer.phone}
                </a>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Addresses</h2>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer.addresses.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  No saved addresses.
                </p>
              ) : (
                customer.addresses.map((address) => (
                  <div
                    key={`${address.label}-${address.line1}`}
                    className="rounded-lg border border-line bg-surface-muted/50 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
                        <MapPin className="h-3.5 w-3.5 text-ink-muted" />
                        {address.label}
                      </p>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                      {address.recipient}
                      <br />
                      {address.line1}
                      {address.line2 && (
                        <>
                          <br />
                          {address.line2}
                        </>
                      )}
                      <br />
                      {address.city}, {address.province} {address.postcode}
                      <br />
                      {address.country}
                    </p>
                    <p className="mt-1.5 text-[11.5px] text-ink-muted">
                      {address.phone}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
