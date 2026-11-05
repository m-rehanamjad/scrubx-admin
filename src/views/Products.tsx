'use client';

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Archive,
  Copy,
  Eye,
  MoreHorizontal,
  Package,
  PackagePlus,
  Pencil,
  SearchX,
  Trash2,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
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
import { Checkbox } from "../components/ui/checkbox";
import { PageHeader } from "../components/shared/page-header";
import { ProductThumb } from "../components/shared/thumb";
import { SearchInput } from "../components/shared/search-input";
import { EmptyState } from "../components/shared/empty-state";
import { Pagination } from "../components/shared/pagination";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { ProductStatusBadge, StockBadge } from "../components/shared/status-badges";
import { useSimulatedLoading } from "../components/shared/use-simulated-loading";
import { TableSkeleton } from "../components/ui/skeleton";
import { useStore, productTotalStock } from "../data/store";
import { formatPKR } from "../lib/format";
import { useToast } from "../components/ui/toast";
import type { Product, ProductStatus } from "../lib/types";

type SortKey = "newest" | "name" | "price-asc" | "price-desc" | "stock-asc" | "stock-desc";

export default function ProductsPage() {
  const { state, deleteProduct, setProductStatus, setProducts } = useStore();
  const { toast } = useToast();
  const loading = useSimulatedLoading(300);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | ProductStatus>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const categoryOptions = useMemo(() => {
    const leaf = state.categories.filter((c) => c.parentId);
    return leaf.map((c) => {
      const parent = state.categories.find((p) => p.id === c.parentId);
      return { id: c.id, label: parent ? `${parent.name} / ${c.name}` : c.name };
    });
  }, [state.categories]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = state.products.filter((product) => {
      const matchesQuery =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.slug.includes(q) ||
        product.brand.toLowerCase().includes(q) ||
        product.variants.some((v) => v.sku.toLowerCase().includes(q));
      const matchesCategory = category === "all" || product.categoryId === category;
      const matchesStatus = status === "all" || product.status === status;
      return matchesQuery && matchesCategory && matchesStatus;
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "name":
          return a.name.localeCompare(b.name);
        case "price-asc":
          return minPrice(a) - minPrice(b);
        case "price-desc":
          return minPrice(b) - minPrice(a);
        case "stock-asc":
          return productTotalStock(a) - productTotalStock(b);
        case "stock-desc":
          return productTotalStock(b) - productTotalStock(a);
        default:
          return +new Date(b.createdAt) - +new Date(a.createdAt);
      }
    });
    return sorted;
  }, [state.products, query, category, status, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleAll = () => {
    const allSelected = visible.every((p) => selected.includes(p.id));
    setSelected(allSelected ? [] : [...new Set([...selected, ...visible.map((p) => p.id)])]);
  };

  const archiveSelected = () => {
    setProducts((prev) =>
      prev.map((p) =>
        selected.includes(p.id) ? { ...p, status: "archived" as ProductStatus, updatedAt: new Date().toISOString() } : p,
      ),
    );
    toast({
      title: `${selected.length} product${selected.length === 1 ? "" : "s"} archived`,
      description: "Archived products are hidden from the storefront.",
    });
    setSelected([]);
  };

  const duplicateProduct = (product: Product) => {
    const copy: Product = {
      ...product,
      id: `prd-${Date.now().toString(36)}`,
      name: `${product.name} (Copy)`,
      slug: `${product.slug}-copy`,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      variants: product.variants.map((v) => ({
        ...v,
        id: `${v.id}-${Date.now().toString(36)}`,
        sku: `${v.sku}-CP`,
      })),
    };
    setProducts((prev) => [copy, ...prev]);
    toast({ title: "Product duplicated", description: `${copy.name} created as a draft.` });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue"
        title="Products"
        description="Manage listings, pricing and stock across every ScrubX product."
        actions={
          <Button asChild>
            <Link href="/products/new">
              <PackagePlus className="h-4 w-4" />
              Add product
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center">
            <SearchInput
              value={query}
              onChange={(value) => {
                setQuery(value);
                setPage(1);
              }}
              placeholder="Search by name, brand or SKU…"
              className="w-full lg:max-w-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[210px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value as "all" | ProductStatus);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={sort}
                onValueChange={(value) => setSort(value as SortKey)}
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest first</SelectItem>
                  <SelectItem value="name">Name A–Z</SelectItem>
                  <SelectItem value="price-asc">Price: low to high</SelectItem>
                  <SelectItem value="price-desc">Price: high to low</SelectItem>
                  <SelectItem value="stock-asc">Stock: low to high</SelectItem>
                  <SelectItem value="stock-desc">Stock: high to low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {selected.length > 0 && (
              <div className="ml-auto flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5">
                <span className="text-[12.5px] font-medium text-brand-700">
                  {selected.length} selected
                </span>
                <Button size="sm" variant="ghost" onClick={archiveSelected}>
                  <Archive className="h-3.5 w-3.5" />
                  Archive
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setSelected([]);
                    toast({ title: "Selection cleared", variant: "info" });
                  }}
                >
                  Clear
                </Button>
              </div>
            )}
          </div>

          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : visible.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<SearchX className="h-5 w-5" />}
              title="No products match your filters"
              description="Try a different search term, category or status."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setCategory("all");
                    setStatus("all");
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
                    <TableHead className="w-10">
                      <Checkbox
                        checked={visible.length > 0 && visible.every((p) => selected.includes(p.id))}
                        onCheckedChange={toggleAll}
                        aria-label="Select all visible products"
                      />
                    </TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((product) => {
                    const stock = productTotalStock(product);
                    const min = minPrice(product);
                    const max = maxPrice(product);
                    const parent = state.categories.find((c) => c.id === product.categoryId);
                    const grandParent = parent?.parentId
                      ? state.categories.find((c) => c.id === parent.parentId)
                      : undefined;
                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(product.id)}
                            onCheckedChange={() => toggleSelect(product.id)}
                            aria-label={`Select ${product.name}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <ProductThumb
                              src={product.images[0]?.url ?? "/products/scrubs-teal.jpg"}
                              alt={product.name}
                            />
                            <div className="min-w-0">
                              <Link
                                href={`/products/${product.id}/edit`}
                                className="block max-w-[240px] truncate text-[13px] font-medium text-ink hover:text-brand-700"
                              >
                                {product.name}
                              </Link>
                              <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-muted">
                                <span className="font-mono">{product.slug}</span>
                                {product.engraveable && (
                                  <Badge variant="purple" className="py-0 text-[9px]">
                                    Engravable
                                  </Badge>
                                )}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[12px]">
                          {product.variants[0]?.sku.split("-").slice(0, 2).join("-") || "—"}
                          <span className="ml-1 text-ink-muted">({product.variants.length})</span>
                        </TableCell>
                        <TableCell className="max-w-[190px] truncate">
                          {grandParent ? `${grandParent.name} / ` : ""}
                          {parent?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {min === max ? formatPKR(min) : `${formatPKR(min)} – ${formatPKR(max)}`}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium text-ink tabular">{stock}</span>
                            <StockBadge
                              stock={stock}
                              reorderLevel={product.variants[0]?.reorderLevel ?? 10}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <ProductStatusBadge status={product.status} />
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Product actions">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/products/${product.id}`}>
                                  <Eye className="h-3.5 w-3.5" />
                                  View listing
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link href={`/products/${product.id}/edit`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit product
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => duplicateProduct(product)}>
                                <Copy className="h-3.5 w-3.5" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {product.status !== "archived" ? (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setProductStatus(product.id, "archived");
                                    toast({
                                      title: "Product archived",
                                      description: `${product.name} was archived.`,
                                      variant: "info",
                                    });
                                  }}
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                  Archive
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setProductStatus(product.id, "active");
                                    toast({
                                      title: "Product restored",
                                      description: `${product.name} is live again.`,
                                    });
                                  }}
                                >
                                  <Package className="h-3.5 w-3.5" />
                                  Restore to active
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                destructive
                                onClick={() => setDeleteTarget(product)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
              />
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete product?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” and its ${deleteTarget.variants.length} variants will be permanently removed from the catalogue.`
            : undefined
        }
        confirmLabel="Delete product"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteProduct(deleteTarget.id);
          toast({
            title: "Product deleted",
            description: `${deleteTarget.name} was removed.`,
            variant: "error",
          });
        }}
      />
    </div>
  );
}

function minPrice(product: Product) {
  return product.variants.length ? Math.min(...product.variants.map((v) => v.price)) : 0;
}

function maxPrice(product: Product) {
  return product.variants.length ? Math.max(...product.variants.map((v) => v.price)) : 0;
}
