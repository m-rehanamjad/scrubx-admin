'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { formatDate, formatDateTime, formatPKR } from "../lib/format";
import type { Customer, Order } from "../lib/types";
import { updateCustomerAction } from "../actions/customers";

interface CustomerDetailProps {
  id?: string;
  initialCustomer?: Customer;
  initialOrders?: Order[];
}

export default function CustomerDetailPage({
  id: propId,
  initialCustomer,
  initialOrders = [],
}: CustomerDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customer = initialCustomer;
  const orders = initialOrders;

  if (!customer) {
    return (
      <EmptyState
        title="Customer not found"
        description="This customer record may have been removed or does not exist."
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

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setIsSubmitting(true);
    try {
      const existingNotes = customer.notes.map((n) => n.text).join("\n---\n");
      const updatedNotes = existingNotes ? `${existingNotes}\n---\n${note.trim()}` : note.trim();
      const res = await updateCustomerAction({
        id: customer.id,
        notes: updatedNotes,
      });

      if (res.success) {
        toast({ title: "Note saved" });
        setNote("");
        router.refresh();
      } else {
        toast({
          title: "Failed to save note",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error saving note",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link href="/customers" className="inline-flex items-center gap-1 hover:text-brand-800">
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
              { label: "Total orders", value: String(orders.length), icon: ShoppingBag },
              { label: "Total spending", value: formatPKR(spend), icon: Wallet },
              { label: "Average order", value: formatPKR(averageOrder), icon: ShoppingBag },
            ].map((stat) => (
              <Card key={stat.label}>
                <CardContent className="flex items-start justify-between p-4">
                  <div>
                    <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
                    <p className="mt-1.5 text-[20px] font-semibold text-ink tabular">{stat.value}</p>
                  </div>
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-ink-muted">
                    <stat.icon className="h-4.5 w-4.5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Order history</h2>
              <Badge variant="neutral">{orders.length} orders</Badge>
            </CardHeader>
            <CardContent className="p-0">
              {orders.length === 0 ? (
                <EmptyState
                  className="m-4"
                  title="No orders yet"
                  description="When this customer places an order it will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell>
                          <Link
                            href={`/orders/${order.id}`}
                            className="font-mono text-[13px] font-semibold text-brand-700 hover:underline"
                          >
                            {order.orderNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-ink-muted">{formatDate(order.date)}</TableCell>
                        <TableCell className="tabular">
                          {order.items.reduce((sum, i) => sum + i.quantity, 0)} units
                        </TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {formatPKR(order.total)}
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
              <h2 className="text-[15px] font-semibold text-ink">Staff notes</h2>
              <p className="text-[12.5px] text-ink-muted">
                Private notes recorded by your team regarding hospital preferences, sizing or custom requests.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer.notes.length === 0 ? (
                <p className="text-[13px] text-ink-muted">No notes on this customer yet.</p>
              ) : (
                <div className="space-y-2">
                  {customer.notes.map((item) => (
                    <div key={item.id} className="rounded-md border border-line bg-surface-muted/60 p-3">
                      <p className="text-[13px] text-ink">{item.text}</p>
                      <p className="mt-1 text-[11.5px] text-ink-muted">
                        Recorded {formatDateTime(item.at)}
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
                  placeholder="Record customer preferences, sizing or hospital affiliation…"
                  className="flex-1"
                />
                <Button
                  className="self-start"
                  disabled={!note.trim() || isSubmitting}
                  onClick={handleAddNote}
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  {isSubmitting ? "Saving..." : "Add note"}
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
                  <p className="text-[15px] font-semibold text-ink">{customer.name}</p>
                  <p className="text-[12px] text-ink-muted">{customer.city}, Pakistan</p>
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
                <p className="text-[13px] text-ink-muted">No saved addresses.</p>
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
                    <p className="mt-1.5 text-[11.5px] text-ink-muted">{address.phone}</p>
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
