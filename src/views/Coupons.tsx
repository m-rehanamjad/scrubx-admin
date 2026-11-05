'use client';

import { useEffect, useMemo, useState } from "react";
import { BadgePercent, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { PageHeader } from "../components/shared/page-header";
import { EmptyState } from "../components/shared/empty-state";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { SearchInput } from "../components/shared/search-input";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { formatDate, formatPKR } from "../lib/format";
import { cn, uid } from "../lib/utils";
import type { Coupon } from "../lib/types";

export default function CouponsPage() {
  const { state, saveCoupon, deleteCoupon } = useStore();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Coupon["status"]>("all");
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.coupons.filter((coupon) => {
      const matchesQuery =
        !q || coupon.code.toLowerCase().includes(q) || coupon.description.toLowerCase().includes(q);
      const matchesStatus = status === "all" || coupon.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [state.coupons, query, status]);

  const openCreate = () => {
    setEditing({
      id: uid("cpn"),
      code: "",
      description: "",
      type: "percentage",
      value: 10,
      minOrderAmount: 2500,
      maxDiscount: 1000,
      usageLimit: 100,
      perCustomerLimit: 1,
      firstOrderOnly: false,
      startsAt: new Date().toISOString().slice(0, 10),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      usedCount: 0,
      status: "active",
    });
    setDialogOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditing({
      ...coupon,
      startsAt: coupon.startsAt.slice(0, 10),
      expiresAt: coupon.expiresAt.slice(0, 10),
    });
    setDialogOpen(true);
  };

  const activeCount = state.coupons.filter((c) => c.status === "active").length;
  const totalRedemptions = state.coupons.reduce((sum, c) => sum + c.usedCount, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Marketing"
        title="Coupons"
        description="Create percentage or fixed discounts with usage limits, expiry dates and first-order rules."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New coupon
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Active coupons", value: String(activeCount) },
          { label: "Total redemptions", value: String(totalRedemptions) },
          { label: "Total coupons", value: String(state.coupons.length) },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <p className="text-[12px] font-medium text-ink-muted">{stat.label}</p>
              <p className="mt-1.5 text-[20px] font-semibold leading-none text-ink tabular">
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search coupon code or description…"
              className="w-full sm:max-w-xs"
            />
            <Select value={status} onValueChange={(value) => setStatus(value as "all" | Coupon["status"])}>
              <SelectTrigger className="w-[170px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<BadgePercent className="h-5 w-5" />}
              title="No coupons found"
              description="Create a discount code to boost conversions."
              action={<Button onClick={openCreate}>New coupon</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="text-right">Min order</TableHead>
                  <TableHead className="text-right">Used</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <p className="font-mono text-[12.5px] font-semibold text-ink">{coupon.code}</p>
                      <p className="mt-0.5 max-w-[220px] truncate text-[11.5px] text-ink-muted">
                        {coupon.description}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={coupon.type === "percentage" ? "brand" : "navy"}>
                        {coupon.type === "percentage"
                          ? `${coupon.value}% off`
                          : `${formatPKR(coupon.value)} off`}
                      </Badge>
                      {coupon.maxDiscount && (
                        <span className="ml-1.5 text-[11.5px] text-ink-muted">
                          max {formatPKR(coupon.maxDiscount)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {formatPKR(coupon.minOrderAmount)}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {coupon.usedCount}
                      {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ""}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(coupon.expiresAt)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          coupon.status === "active"
                            ? "success"
                            : coupon.status === "expired"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {coupon.status === "active"
                          ? "Active"
                          : coupon.status === "expired"
                            ? "Expired"
                            : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Coupon actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEdit(coupon)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit coupon
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              saveCoupon({
                                ...coupon,
                                status: coupon.status === "active" ? "inactive" : "active",
                              });
                              toast({
                                title:
                                  coupon.status === "active" ? "Coupon disabled" : "Coupon activated",
                                description: coupon.code,
                              });
                            }}
                          >
                            {coupon.status === "active" ? "Disable coupon" : "Activate coupon"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem destructive onClick={() => setDeleteTarget(coupon)}>
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CouponDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coupon={editing}
        onSave={(coupon) => {
          saveCoupon({
            ...coupon,
            code: coupon.code.toUpperCase(),
            startsAt: new Date(coupon.startsAt).toISOString(),
            expiresAt: new Date(coupon.expiresAt).toISOString(),
          });
          toast({
            title: editing?.code ? "Coupon updated" : "Coupon created",
            description: coupon.code.toUpperCase(),
          });
          setDialogOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete coupon?"
        description={
          deleteTarget ? `“${deleteTarget.code}” will stop working immediately.` : undefined
        }
        confirmLabel="Delete coupon"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteCoupon(deleteTarget.id);
          toast({ title: "Coupon deleted", variant: "error" });
        }}
      />
    </div>
  );
}

function CouponDialog({
  open,
  onOpenChange,
  coupon,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: Coupon | null;
  onSave: (coupon: Coupon) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Coupon | null>(coupon);

  useEffect(() => {
    setDraft(coupon);
  }, [coupon]);

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{coupon?.code ? "Edit coupon" : "New coupon"}</DialogTitle>
          <DialogDescription>
            Set the discount, eligibility rules and redemption limits.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="cpn-code">Coupon code</Label>
              <Input
                id="cpn-code"
                value={draft.code}
                onChange={(e) =>
                  setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/\s/g, "") })
                }
                placeholder="WELCOME10"
                className="font-mono uppercase"
              />
            </div>
            <div>
              <Label>Discount type</Label>
              <Select
                value={draft.type}
                onValueChange={(value) => setDraft({ ...draft, type: value as "percentage" | "fixed" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cpn-value">
                Value {draft.type === "percentage" ? "(%)" : "(Rs.)"}
              </Label>
              <Input
                id="cpn-value"
                type="number"
                min={0}
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="cpn-min">Minimum order amount (Rs.)</Label>
              <Input
                id="cpn-min"
                type="number"
                min={0}
                value={draft.minOrderAmount}
                onChange={(e) => setDraft({ ...draft, minOrderAmount: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="cpn-max">Maximum discount (Rs.)</Label>
              <Input
                id="cpn-max"
                type="number"
                min={0}
                value={draft.maxDiscount ?? ""}
                placeholder="No limit"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    maxDiscount: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="cpn-usage">Total usage limit</Label>
              <Input
                id="cpn-usage"
                type="number"
                min={0}
                value={draft.usageLimit ?? ""}
                placeholder="Unlimited"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    usageLimit: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label htmlFor="cpn-per">Per-customer limit</Label>
              <Input
                id="cpn-per"
                type="number"
                min={0}
                value={draft.perCustomerLimit ?? ""}
                placeholder="Unlimited"
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    perCustomerLimit: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={draft.status}
                onValueChange={(value) => setDraft({ ...draft, status: value as Coupon["status"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cpn-start">Start date</Label>
              <Input
                id="cpn-start"
                type="date"
                value={draft.startsAt.slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="cpn-expiry">Expiry date</Label>
              <Input
                id="cpn-expiry"
                type="date"
                value={draft.expiresAt.slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, expiresAt: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cpn-desc">Description</Label>
              <Textarea
                id="cpn-desc"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Where and how this coupon is used"
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">First order only</p>
              <p className="text-[12px] text-ink-muted">
                Only usable by customers who have never placed an order.
              </p>
            </div>
            <Switch
              checked={draft.firstOrderOnly}
              onCheckedChange={(checked) => setDraft({ ...draft, firstOrderOnly: checked })}
            />
          </div>

          <p
            className={cn(
              "rounded-md border border-line bg-surface-muted/60 px-3 py-2 text-[12px] text-ink-soft",
            )}
          >
            Used <span className="font-semibold text-ink">{draft.usedCount}</span> times so far.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!draft.code.trim()}
            onClick={() => {
              if (!draft.code.trim()) {
                toast({ title: "Coupon code is required", variant: "error" });
                return;
              }
              onSave(draft);
            }}
          >
            {coupon?.code ? "Save changes" : "Create coupon"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
