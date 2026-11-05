'use client';

import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  History,
  PackageSearch,
  PencilLine,
  SearchX,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { PageHeader } from "../components/shared/page-header";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { StockBadge } from "../components/shared/status-badges";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { formatDateTime, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { InventoryMovementType, Product, ProductVariant } from "../lib/types";

type StockFilter = "all" | "low" | "out" | "healthy";

const MOVEMENT_META: Record<InventoryMovementType, { label: string; variant: "success" | "danger" | "info" | "warning" | "neutral" }> = {
  restock: { label: "Restock", variant: "success" },
  sale: { label: "Sale", variant: "info" },
  cancellation: { label: "Cancellation", variant: "warning" },
  return: { label: "Return", variant: "neutral" },
  adjustment: { label: "Adjustment", variant: "danger" },
};

export default function InventoryPage() {
  const { state, setVariantStock } = useStore();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [adjustTarget, setAdjustTarget] = useState<{ product: Product; variant: ProductVariant } | null>(null);
  const [adjustMode, setAdjustMode] = useState<"set" | "add" | "remove">("add");
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustReason, setAdjustReason] = useState("Restock from supplier");
  const [adjustNote, setAdjustNote] = useState("");

  const rows = useMemo(() => {
    const list = state.products.flatMap((product) =>
      product.variants.map((variant) => ({ product, variant })),
    );
    return list;
  }, [state.products]);

  const totals = useMemo(() => {
    const units = rows.reduce((sum, r) => sum + r.variant.stock, 0);
    const value = rows.reduce((sum, r) => sum + r.variant.stock * r.variant.price, 0);
    const low = rows.filter(
      (r) => r.variant.stock > 0 && r.variant.stock <= r.variant.reorderLevel,
    ).length;
    const out = rows.filter((r) => r.variant.stock === 0).length;
    const reserved = rows.reduce((sum, r) => sum + r.variant.reserved, 0);
    return { units, value, low, out, reserved, skus: rows.length };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ product, variant }) => {
      const matchesQuery =
        !q ||
        product.name.toLowerCase().includes(q) ||
        variant.sku.toLowerCase().includes(q) ||
        variant.colorName.toLowerCase().includes(q) ||
        variant.size.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "low" && variant.stock > 0 && variant.stock <= variant.reorderLevel) ||
        (filter === "out" && variant.stock === 0) ||
        (filter === "healthy" && variant.stock > variant.reorderLevel);
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const movements = useMemo(
    () => [...state.inventoryMovements].sort((a, b) => +new Date(b.at) - +new Date(a.at)),
    [state.inventoryMovements],
  );

  const openAdjust = (
    product: Product,
    variant: ProductVariant,
    mode: "set" | "add" | "remove",
  ) => {
    setAdjustTarget({ product, variant });
    setAdjustMode(mode);
    setAdjustQty(mode === "add" ? 10 : 0);
    setAdjustReason(
      mode === "add" ? "Restock from supplier" : mode === "remove" ? "Manual adjustment" : "Stock count correction",
    );
    setAdjustNote("");
  };

  const applyAdjust = () => {
    if (!adjustTarget) return;
    const { product, variant } = adjustTarget;
    const next =
      adjustMode === "set"
        ? adjustQty
        : adjustMode === "add"
          ? variant.stock + adjustQty
          : variant.stock - adjustQty;
    if (next < 0) {
      toast({ title: "Stock cannot go below zero", variant: "error" });
      return;
    }
    const type: InventoryMovementType =
      adjustMode === "add" ? "restock" : adjustMode === "remove" ? "adjustment" : "adjustment";
    setVariantStock(product.id, variant.id, next, type, adjustReason, adjustNote || undefined);
    toast({
      title: "Inventory updated",
      description: `${product.name} · ${variant.name} is now at ${next} units.`,
    });
    setAdjustTarget(null);
  };

  const stats = [
    { label: "Units in stock", value: String(totals.units), icon: Boxes, tone: "brand" },
    { label: "Stock value", value: formatPKR(totals.value), icon: TrendingUp, tone: "navy" },
    { label: "Low stock SKUs", value: String(totals.low), icon: TrendingDown, tone: "amber" },
    { label: "Out of stock SKUs", value: String(totals.out), icon: PackageSearch, tone: "rose" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Stock control"
        title="Inventory"
        description="Monitor stock across every variant, adjust quantities and review movement history."
        actions={
          <Badge variant="neutral">
            {totals.reserved} units reserved across orders
          </Badge>
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
                  stat.tone === "rose" && "bg-rose-50 text-rose-600",
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
          <Tabs defaultValue="levels">
            <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="levels">
                  <Boxes className="h-3.5 w-3.5" />
                  Stock levels
                </TabsTrigger>
                <TabsTrigger value="movements">
                  <History className="h-3.5 w-3.5" />
                  Movement history
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchInput
                  value={query}
                  onChange={(value) => {
                    setQuery(value);
                    setPage(1);
                  }}
                  placeholder="Search product, SKU, colour…"
                  className="w-full sm:w-72"
                />
                <Select
                  value={filter}
                  onValueChange={(value) => {
                    setFilter(value as StockFilter);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All stock</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="low">Low stock</SelectItem>
                    <SelectItem value="out">Out of stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <TabsContent value="levels" className="mt-0">
              {visible.length === 0 ? (
                <EmptyState
                  className="m-4"
                  icon={<SearchX className="h-5 w-5" />}
                  title="No variants match"
                  description="Adjust your search or stock filter to see more results."
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Variant</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Reserved</TableHead>
                        <TableHead className="text-right">Reorder</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visible.map(({ product, variant }) => {
                        const available = Math.max(0, variant.stock - variant.reserved);
                        return (
                          <TableRow key={variant.id}>
                            <TableCell className="max-w-[220px] truncate text-ink">
                              {product.name}
                            </TableCell>
                            <TableCell>
                              <span className="flex items-center gap-2">
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-line-strong"
                                  style={{ backgroundColor: variant.colorHex }}
                                />
                                {variant.colorName} / {variant.size}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">{variant.sku}</TableCell>
                            <TableCell className="text-right font-medium text-ink tabular">
                              {available}
                            </TableCell>
                            <TableCell className="text-right tabular">{variant.reserved}</TableCell>
                            <TableCell className="text-right tabular">{variant.reorderLevel}</TableCell>
                            <TableCell>
                              <StockBadge stock={variant.stock} reorderLevel={variant.reorderLevel} />
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openAdjust(product, variant, "add")}
                                >
                                  <ArrowDownToLine className="h-3.5 w-3.5" />
                                  Restock
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => openAdjust(product, variant, "set")}
                                  aria-label="Adjust stock"
                                >
                                  <PencilLine className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                    pageSizeOptions={[12, 25, 50]}
                  />
                </>
              )}
            </TabsContent>

            <TabsContent value="movements" className="mt-0">
              {movements.length === 0 ? (
                <EmptyState
                  className="m-4"
                  icon={<History className="h-5 w-5" />}
                  title="No movements recorded"
                  description="Stock adjustments, sales and returns will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((movement) => {
                      const meta = MOVEMENT_META[movement.type];
                      return (
                        <TableRow key={movement.id}>
                          <TableCell className="whitespace-nowrap text-[12.5px]">
                            {formatDateTime(movement.at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={meta.variant}>{meta.label}</Badge>
                          </TableCell>
                          <TableCell className="max-w-[220px] truncate">
                            <span className="block truncate text-ink">{movement.productName}</span>
                            <span className="text-[11.5px] text-ink-muted">{movement.variantName}</span>
                          </TableCell>
                          <TableCell className="font-mono text-[12px]">{movement.sku}</TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-medium tabular",
                              movement.quantity >= 0 ? "text-emerald-700" : "text-rose-600",
                            )}
                          >
                            {movement.quantity >= 0 ? "+" : ""}
                            {movement.quantity}
                          </TableCell>
                          <TableCell>
                            <span className="block text-ink-soft">{movement.reason}</span>
                            {movement.note && (
                              <span className="block text-[11.5px] text-ink-muted">{movement.note}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-[12.5px]">{movement.by}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={Boolean(adjustTarget)} onOpenChange={(open) => !open && setAdjustTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {adjustMode === "add" ? "Restock variant" : "Adjust stock"}
            </DialogTitle>
            <DialogDescription>
              {adjustTarget
                ? `${adjustTarget.product.name} — ${adjustTarget.variant.name} (${adjustTarget.variant.sku})`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
              <div>
                <p className="text-[12px] text-ink-muted">Current stock</p>
                <p className="text-[18px] font-semibold text-ink tabular">
                  {adjustTarget?.variant.stock ?? 0}
                </p>
              </div>
              <ArrowUpFromLine className="h-5 w-5 text-ink-muted" />
            </div>

            <div>
              <Label>Adjustment type</Label>
              <div className="mt-2 flex gap-2">
                {(
                  [
                    { value: "add", label: "Add stock" },
                    { value: "remove", label: "Remove" },
                    { value: "set", label: "Set exact" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setAdjustMode(option.value)}
                    className={cn(
                      "flex-1 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                      adjustMode === option.value
                        ? "border-brand-500 bg-brand-50 text-brand-700"
                        : "border-line-strong bg-surface text-ink-muted hover:text-ink-soft",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="adjust-qty">
                {adjustMode === "set" ? "New quantity" : "Quantity"}
              </Label>
              <Input
                id="adjust-qty"
                type="number"
                min={0}
                value={adjustQty}
                onChange={(e) => setAdjustQty(Number(e.target.value))}
              />
              <p className="mt-1.5 text-[11.5px] text-ink-muted">
                New stock level:{" "}
                <span className="font-medium text-ink-soft tabular">
                  {adjustTarget
                    ? adjustMode === "set"
                      ? adjustQty
                      : adjustMode === "add"
                        ? adjustTarget.variant.stock + adjustQty
                        : adjustTarget.variant.stock - adjustQty
                    : 0}
                </span>
              </p>
            </div>

            <div>
              <Label htmlFor="adjust-reason">Reason</Label>
              <Select value={adjustReason} onValueChange={setAdjustReason}>
                <SelectTrigger id="adjust-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Restock from supplier">Restock from supplier</SelectItem>
                  <SelectItem value="Manual adjustment">Manual adjustment</SelectItem>
                  <SelectItem value="Stock count correction">Stock count correction</SelectItem>
                  <SelectItem value="Damaged in storage">Damaged in storage</SelectItem>
                  <SelectItem value="Returned to stock">Returned to stock</SelectItem>
                  <SelectItem value="Order cancelled">Order cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="adjust-note">Note (optional)</Label>
              <Textarea
                id="adjust-note"
                rows={2}
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="Add a reference such as a PO or delivery challan number"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustTarget(null)}>
              Cancel
            </Button>
            <Button onClick={applyAdjust}>Apply adjustment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
