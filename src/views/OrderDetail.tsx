"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  Package,
  PenTool,
  Phone,
  Save,
  Truck,
  User,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { PageHeader } from "../components/shared/page-header";
import { Avatar, ProductThumb } from "../components/shared/thumb";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
} from "../components/shared/status-badges";
import { EmptyState } from "../components/shared/empty-state";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { ORDER_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../data/constants";
import { formatDate, formatDateTime, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { OrderStatus } from "../lib/types";

const COURIERS = [
  "TCS Express",
  "Leopards Courier",
  "M&P",
  "CallCourrier",
  "Pakistan Post",
];

export default function OrderDetailPage({ id: propId }: { id?: string } = {}) {
  const routeParams = useParams();
  const id = propId ?? (routeParams?.id as string | undefined);
  const { state, setOrderStatus, setOrderCourier, addOrderNote } = useStore();
  const { toast } = useToast();

  const order = useMemo(
    () => state.orders.find((o) => o.id === id),
    [state.orders, id],
  );
  const customer = useMemo(
    () => state.customers.find((c) => c.id === order?.customerId),
    [state.customers, order?.customerId],
  );

  const [note, setNote] = useState("");
  const [courier, setCourier] = useState(order?.courier ?? "TCS Express");
  const [tracking, setTracking] = useState(order?.trackingNumber ?? "");
  const [proofOpen, setProofOpen] = useState(false);

  if (!order) {
    return (
      <EmptyState
        title="Order not found"
        description="This order may have been removed from the list."
        action={
          <Button asChild>
            <Link href="/orders">Back to orders</Link>
          </Button>
        }
      />
    );
  }

  const method = state.paymentMethods.find((m) => m.id === order.paymentMethod);
  const submission = state.paymentSubmissions.find(
    (s) => s.orderId === order.id && s.status !== "rejected",
  );

  const totals = [
    { label: "Subtotal", value: order.subtotal },
    { label: "Engraving charges", value: order.engravingCharges },
    { label: "Discount", value: -order.discount },
    { label: "Shipping", value: order.shipping },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 hover:text-brand-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Orders
          </Link>
        }
        title={order.orderNumber}
        description={`Placed ${formatDate(order.date)} · ${order.items.length} line item${order.items.length === 1 ? "" : "s"}`}
        actions={
          <>
            <OrderStatusBadge status={order.status} />
            <Select
              value={order.status}
              onValueChange={async (value) => {
                try {
                  await setOrderStatus(order.id, value as OrderStatus);
                  toast({
                    title: "Order status updated",
                    description: `${order.orderNumber} is now ${ORDER_STATUS_LABEL[value as OrderStatus]}.`,
                  });
                } catch {
                  return false;
                }
              }}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(
                  [
                    "awaiting_payment",
                    "payment_submitted",
                    "pending_cod",
                    "confirmed",
                    "processing",
                    "shipped",
                    "delivered",
                    "cancelled",
                    "refunded",
                  ] as OrderStatus[]
                ).map((option) => (
                  <SelectItem key={option} value={option}>
                    {ORDER_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">
                Order items
              </h2>
              <Badge variant="neutral">
                {order.items.reduce((sum, i) => sum + i.quantity, 0)} units
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {order.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <ProductThumb
                            src={item.image}
                            alt={item.productName}
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/products/${item.productId}/edit`}
                              className="block max-w-[220px] truncate text-[13px] font-medium text-ink hover:text-brand-700"
                            >
                              {item.productName}
                            </Link>
                            {item.engraving && (
                              <Badge variant="purple" className="mt-1">
                                <PenTool className="h-3 w-3" />
                                Engraved
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="block text-ink">{item.colorName}</span>
                        <span className="text-[11.5px] text-ink-muted">
                          Size {item.size}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-[12px]">
                        {item.sku}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {formatPKR(item.price)}
                      </TableCell>
                      <TableCell className="text-right tabular">
                        {item.quantity}
                      </TableCell>
                      <TableCell className="text-right font-medium text-ink tabular">
                        {formatPKR(item.price * item.quantity)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {order.engraving && order.engraving.length > 0 && (
            <Card>
              <CardHeader>
                <h2 className="text-[15px] font-semibold text-ink">
                  Engraving details
                </h2>
                <p className="text-[12.5px] text-ink-muted">
                  Production instructions for the embroidery unit.
                </p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {order.engraving.map((detail, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-line bg-surface-muted/50 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[13px] font-semibold text-ink">
                        {detail.optionName}
                      </p>
                      <Badge
                        variant={detail.type === "logo" ? "navy" : "brand"}
                      >
                        {detail.type === "logo" ? "Logo" : "Name"}
                      </Badge>
                    </div>
                    {detail.type === "name" ? (
                      <div className="mt-3 rounded-md border border-dashed border-navy-300 bg-surface px-3 py-2.5">
                        <p className="font-mono text-[15px] font-semibold tracking-wide text-navy-800">
                          {detail.text}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-muted">
                          {(detail.text ?? "").length} characters
                        </p>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-3 rounded-md border border-dashed border-navy-300 bg-surface p-3">
                        <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded border border-line bg-surface-muted">
                          {detail.logoUrl ? (
                            <img
                              src={detail.logoUrl}
                              alt="Logo preview"
                              className="h-full w-full object-contain p-1"
                            />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-ink-muted" />
                          )}
                        </div>
                        <div>
                          <p className="text-[12px] font-medium text-ink">
                            Clinic logo
                          </p>
                          <p className="text-[11.5px] text-ink-muted">
                            Left chest, 30 mm wide
                          </p>
                        </div>
                      </div>
                    )}
                    <p className="mt-2.5 text-[12px] text-ink-muted">
                      {formatPKR(detail.price)} per unit
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Payment</h2>
              <p className="text-[12.5px] text-ink-muted">
                {method?.description ?? "Payment details for this order."}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[11.5px] text-ink-muted">Method</p>
                  <p className="mt-0.5 text-[13px] font-medium text-ink">
                    {PAYMENT_METHOD_LABEL[order.paymentMethod]}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] text-ink-muted">Status</p>
                  <p className="mt-1">
                    <PaymentStatusBadge status={order.paymentStatus} />
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] text-ink-muted">
                    Transaction reference
                  </p>
                  <p className="mt-0.5 font-mono text-[12.5px] text-ink">
                    {order.transactionRef ?? "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[11.5px] text-ink-muted">Amount paid</p>
                  <p className="mt-0.5 text-[13px] font-semibold text-ink tabular">
                    {formatPKR(order.total)}
                  </p>
                </div>
              </div>

              {order.couponCode && (
                <div className="flex items-center gap-2 rounded-md border border-brand-100 bg-brand-50 px-3 py-2 text-[12.5px] text-brand-700">
                  <BadgeCheck className="h-4 w-4" />
                  Coupon{" "}
                  <span className="font-mono font-semibold">
                    {order.couponCode}
                  </span>{" "}
                  applied —{formatPKR(order.discount)} discount
                </div>
              )}

              {order.paymentMethod === "cod" && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
                  Cash on Delivery — the courier will collect{" "}
                  {formatPKR(order.total)} in cash.
                  {order.engraving && (
                    <span className="mt-1 block font-medium">
                      Note: this order has engraving but was placed as COD.
                      Engraved orders should use advance payment.
                    </span>
                  )}
                </div>
              )}

              {submission && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-muted/60 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md border border-line bg-surface text-brand-600">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-ink">
                        Payment proof submitted
                      </p>
                      <p className="text-[11.5px] text-ink-muted">
                        {submission.transactionRef} ·{" "}
                        {formatDateTime(submission.submittedAt)}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setProofOpen(true)}
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    View proof
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">
                Internal notes
              </h2>
              <p className="text-[12.5px] text-ink-muted">
                Only visible to your team — never shown to the customer.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.internalNotes.length === 0 ? (
                <p className="text-[13px] text-ink-muted">
                  No notes on this order yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {order.internalNotes.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-line bg-surface-muted/60 p-3"
                    >
                      <p className="text-[13px] text-ink">{item.text}</p>
                      <p className="mt-1 text-[11.5px] text-ink-muted">
                        {item.by} · {formatDateTime(item.at)}
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
                  placeholder="Add a note for the fulfilment team…"
                  className="flex-1"
                />
                <Button
                  className="self-start"
                  disabled={!note.trim()}
                  onClick={async () => {
                    try {
                      await addOrderNote(order.id, note.trim());
                      setNote("");
                      toast({ title: "Note added" });
                    } catch {
                      return false;
                    }
                  }}
                >
                  <MessageSquare className="h-4 w-4" />
                  Add note
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">
                Order summary
              </h2>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {totals.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between text-[13px]"
                >
                  <span className="text-ink-muted">{row.label}</span>
                  <span
                    className={cn(
                      "font-medium tabular",
                      row.label === "Discount" && row.value !== 0
                        ? "text-emerald-700"
                        : "text-ink",
                    )}
                  >
                    {formatPKR(row.value)}
                  </span>
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-line pt-3">
                <span className="text-[14px] font-semibold text-ink">
                  Total
                </span>
                <span className="text-[17px] font-semibold text-ink tabular">
                  {formatPKR(order.total)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Customer</h2>
            </CardHeader>
            <CardContent className="space-y-3.5">
              <div className="flex items-center gap-3">
                <Avatar name={order.customerName} size="lg" />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-ink">
                    {order.customerName}
                  </p>
                  <p className="text-[12px] text-ink-muted">
                    {order.customerType === "registered"
                      ? "Registered customer"
                      : "Guest checkout"}
                    {customer ? ` · ${customer.city}` : ""}
                  </p>
                </div>
              </div>
              <div className="space-y-2 border-t border-line pt-3.5">
                <a
                  href={`tel:${order.customerPhone.replace(/\s/g, "")}`}
                  className="flex items-center gap-2 text-[12.5px] text-ink-soft hover:text-brand-700"
                >
                  <Phone className="h-3.5 w-3.5 text-ink-muted" />
                  {order.customerPhone}
                </a>
                <a
                  href={`mailto:${order.customerEmail}`}
                  className="flex items-center gap-2 break-all text-[12.5px] text-ink-soft hover:text-brand-700"
                >
                  <User className="h-3.5 w-3.5 text-ink-muted" />
                  {order.customerEmail}
                </a>
              </div>
              {customer && (
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link href={`/customers/${customer.id}`}>
                    View customer profile
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">
                Shipping address
              </h2>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                <div className="text-[13px] leading-relaxed text-ink-soft">
                  <p className="font-medium text-ink">
                    {order.shippingAddress.recipient}
                  </p>
                  <p>{order.shippingAddress.line1}</p>
                  {order.shippingAddress.line2 && (
                    <p>{order.shippingAddress.line2}</p>
                  )}
                  <p>
                    {order.shippingAddress.city},{" "}
                    {order.shippingAddress.province}{" "}
                    {order.shippingAddress.postcode}
                  </p>
                  <p>{order.shippingAddress.country}</p>
                  <p className="mt-1 text-ink-muted">
                    {order.shippingAddress.phone}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">
                Courier & tracking
              </h2>
            </CardHeader>
            <CardContent className="space-y-3.5">
              <div>
                <Label>Courier</Label>
                <Select value={courier} onValueChange={setCourier}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COURIERS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="tracking">Tracking number</Label>
                <Input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  placeholder="e.g. TCS-4471902"
                  className="mt-1.5 font-mono"
                />
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={async () => {
                  try {
                    await setOrderCourier(order.id, courier, tracking);
                    toast({
                      title: "Courier updated",
                      description: `${courier} · ${tracking || "no tracking number"}`,
                    });
                  } catch {
                    return false;
                  }
                }}
              >
                <Save className="h-4 w-4" />
                Save courier details
              </Button>
              {order.trackingNumber && (
                <p className="flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                  <Truck className="h-3.5 w-3.5" />
                  Last saved: {order.courier} · {order.trackingNumber}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">
                Status history
              </h2>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-4 border-l border-line pl-5">
                {[...order.timeline].reverse().map((event, index) => (
                  <li
                    key={`${event.status}-${event.at}-${index}`}
                    className="relative"
                  >
                    <span
                      className={cn(
                        "absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-surface",
                        index === 0 ? "bg-brand-600" : "bg-navy-200",
                      )}
                    />
                    <p className="text-[12.5px] font-semibold text-ink">
                      {event.label}
                    </p>
                    <p className="text-[11.5px] text-ink-muted">
                      {formatDateTime(event.at)}
                    </p>
                    {event.note && (
                      <p className="mt-0.5 text-[12px] text-ink-soft">
                        {event.note}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Package className="h-4.5 w-4.5 text-ink-muted" />
              <div className="text-[12px] text-ink-muted">
                <p className="text-[12.5px] font-medium text-ink">
                  Warehouse: Lahore (Kot Lakhpat)
                </p>
                <p>Same-day dispatch for orders confirmed before 3 PM.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={proofOpen} onOpenChange={setProofOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
            <DialogDescription>
              {submission?.transactionRef} · {submission?.customerName} ·{" "}
              {submission ? formatPKR(submission.amount) : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {submission && (
              <img
                src={submission.proofUrl}
                alt="Payment proof"
                className="w-full rounded-lg border border-line"
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofOpen(false)}>
              Close
            </Button>
            {submission && (
              <Button asChild>
                <Link href="/payments">Go to verification</Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
