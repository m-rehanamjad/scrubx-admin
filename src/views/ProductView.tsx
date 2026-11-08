'use client';

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Trash2, Archive, Layers, Palette } from "lucide-react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
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
import { PageHeader } from "../components/shared/page-header";
import { ProductStatusBadge } from "../components/shared/status-badges";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { EmptyState } from "../components/shared/empty-state";
import { useToast } from "../components/ui/toast";
import { formatDate, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { Product, Category } from "../lib/types";
import { deleteProductAction, archiveProductAction } from "../actions/products";

interface ProductViewProps {
  id?: string;
  initialProduct?: Product;
  initialCategories?: Category[];
}

export default function ProductViewPage({
  id: propId,
  initialProduct,
  initialCategories = [],
}: ProductViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [activeImage, setActiveImage] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const product = initialProduct;

  if (!product) {
    return (
      <EmptyState
        title="Product not found"
        description="This listing may have been deleted."
        action={
          <Button asChild>
            <Link href="/products">Back to products</Link>
          </Button>
        }
      />
    );
  }

  const category = initialCategories.find((c) => c.id === product.categoryId);
  const parent = category?.parentId
    ? initialCategories.find((c) => c.id === category.parentId)
    : undefined;
  const images = product.images.length
    ? product.images
    : [{ id: "none", url: "/products/scrubs-teal.jpg", alt: product.name, colorId: null, isMain: true }];
  const prices = product.variants.map((v) => v.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
  const reserved = product.variants.reduce((sum, v) => sum + v.reserved, 0);

  const details: { label: string; value: string }[] = [
    { label: "Category", value: parent ? `${parent.name} / ${category?.name}` : category?.name ?? "—" },
    { label: "Brand", value: product.brand },
    { label: "Gender", value: product.gender },
    { label: "Material", value: product.material },
    { label: "URL slug", value: `/${product.slug}` },
    { label: "Created", value: formatDate(product.createdAt) },
    { label: "Last updated", value: formatDate(product.updatedAt) },
    { label: "Variants", value: `${product.variants.length} (${product.variants.filter((v) => v.active).length} active)` },
  ];

  const handleArchive = async () => {
    try {
      const res = await archiveProductAction({ id: product.id });
      if (res.success) {
        toast({
          title: "Product archived",
          description: `${product.name} was archived.`,
          variant: "info",
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to archive product",
          description: res.error || "Could not archive product.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error archiving product",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleDelete = async () => {
    try {
      const res = await deleteProductAction({ id: product.id });
      if (res.success) {
        toast({
          title: "Product deleted",
          description: `${product.name} was removed.`,
          variant: "error",
        });
        router.push("/products");
      } else {
        toast({
          title: "Failed to delete product",
          description: res.error || "Could not delete product.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error deleting product",
        description: err.message,
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={parent ? `${parent.name} / ${category?.name}` : "Catalogue"}
        title={product.name}
        description={product.description}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/products">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button variant="outline" onClick={handleArchive}>
              <Archive className="h-4 w-4" />
              Archive
            </Button>
            <Button variant="danger-outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button asChild>
              <Link href={`/products/${product.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Edit product
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="relative aspect-square w-full overflow-hidden bg-surface-muted">
              {images[activeImage]?.url && (
                <Image
                  src={images[activeImage].url}
                  alt={images[activeImage]?.alt ?? product.name}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 420px"
                  className="object-cover"
                />
              )}
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-thin p-3">
                {images.map((image, index) => (
                  <button
                    key={image.id}
                    onClick={() => setActiveImage(index)}
                    className={cn(
                      "relative h-16 w-16 shrink-0 overflow-hidden rounded-md border transition-all",
                      index === activeImage
                        ? "border-brand-500 ring-2 ring-brand-100"
                        : "border-line hover:border-navy-300",
                    )}
                  >
                    <Image src={image.url} alt={image.alt} fill sizes="64px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-[15px] font-semibold text-ink">Details</h2>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-line">
                {details.map((detail) => (
                  <div key={detail.label} className="flex items-center justify-between gap-4 py-2">
                    <dt className="text-[12.5px] text-ink-muted">{detail.label}</dt>
                    <dd className="text-right text-[12.5px] font-medium text-ink">{detail.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <ProductStatusBadge status={product.status} />
                {product.engraveable && <Badge variant="purple">Engravable</Badge>}
                {product.featured && <Badge variant="warning">Featured</Badge>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[12px] font-medium text-ink-muted">Price range</p>
                <p className="mt-1.5 text-[18px] font-semibold text-ink tabular">
                  {min === max ? formatPKR(min) : `${formatPKR(min)} – ${formatPKR(max)}`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[12px] font-medium text-ink-muted">Stock on hand</p>
                <p className="mt-1.5 text-[18px] font-semibold text-ink tabular">
                  {totalStock}{" "}
                  <span className="text-[12px] font-normal text-ink-muted">({reserved} reserved)</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[12px] font-medium text-ink-muted">Colours</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[18px] font-semibold text-ink">
                  {product.colors.length}
                  <span className="flex gap-1 pl-1">
                    {product.colors.map((c) => (
                      <span
                        key={c.id}
                        title={c.name}
                        className="h-4 w-4 rounded-full border border-line-strong"
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">Variants</h2>
              <Badge variant="navy">
                <Layers className="h-3 w-3" />
                {product.variants.length}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {product.variants.length === 0 ? (
                <EmptyState
                  className="m-4"
                  title="No variants"
                  description="Generate variants from colours and sizes to make this product sellable."
                  action={
                    <Button asChild size="sm">
                      <Link href={`/products/${product.id}/edit`}>Edit product</Link>
                    </Button>
                  }
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Colour</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.variants.map((variant) => (
                      <TableRow key={variant.id}>
                        <TableCell>
                          <span className="flex items-center gap-2 text-ink">
                            <span
                              className="h-4 w-4 rounded-full border border-line-strong"
                              style={{ backgroundColor: variant.colorHex }}
                            />
                            {variant.colorName}
                          </span>
                        </TableCell>
                        <TableCell>{variant.size}</TableCell>
                        <TableCell className="font-mono text-[12px]">{variant.sku}</TableCell>
                        <TableCell className="text-right font-medium text-ink tabular">
                          {formatPKR(variant.price)}
                        </TableCell>
                        <TableCell className="text-right tabular">{variant.stock}</TableCell>
                        <TableCell>
                          <Badge variant={variant.active ? "success" : "neutral"}>
                            {variant.active ? "Active" : "Inactive"}
                          </Badge>
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
              <h2 className="text-[15px] font-semibold text-ink">Images by colour</h2>
              <p className="text-[12.5px] text-ink-muted">
                Shared images are used for any colour without a dedicated photo.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {product.colors.map((color) => {
                const colorImages = product.images.filter((i) => i.colorId === color.id);
                const shared = product.images.filter((i) => !i.colorId);
                return (
                  <div key={color.id} className="flex items-center gap-3">
                    <span
                      className="h-8 w-8 shrink-0 rounded-full border border-line-strong"
                      style={{ backgroundColor: color.hex }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">{color.name}</p>
                      <p className="text-[11.5px] text-ink-muted">
                        {colorImages.length
                          ? `${colorImages.length} colour image${colorImages.length === 1 ? "" : "s"}`
                          : `Uses ${shared.length} shared image${shared.length === 1 ? "" : "s"}`}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {(colorImages.length ? colorImages : shared).slice(0, 4).map((image) => (
                        <div key={image.id} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-line">
                          <Image
                            src={image.url}
                            alt={image.alt}
                            fill
                            sizes="44px"
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {product.colors.length === 0 && (
                <p className="flex items-center gap-2 text-[13px] text-ink-muted">
                  <Palette className="h-4 w-4" />
                  No colours defined for this product.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete product?"
        description={`“${product.name}” and its ${product.variants.length} variants will be permanently removed.`}
        confirmLabel="Delete product"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
