"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FolderTree,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Power,
  PowerOff,
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
import { Switch } from "../components/ui/switch";
import { PageHeader } from "../components/shared/page-header";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { EmptyState } from "../components/shared/empty-state";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { slugify, uid } from "../lib/utils";
import type { Category } from "../lib/types";

const CATEGORY_IMAGES = [
  "/products/scrubs-teal.jpg",
  "/products/lab-coat.jpg",
  "/products/stethoscope.jpg",
  "/products/mask.jpg",
  "/products/shoes.jpg",
  "/products/badge.jpg",
  "/products/gloves.jpg",
  "/products/bp-monitor.jpg",
];

export default function CategoriesPage() {
  const { state, saveCategory, deleteCategory, toggleCategoryStatus } =
    useStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Category | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const productCounts = useMemo(() => {
    const counts = new Map<string, number>();
    state.products.forEach((product) => {
      counts.set(product.categoryId, (counts.get(product.categoryId) ?? 0) + 1);
    });
    return counts;
  }, [state.products]);

  const rows = useMemo(() => {
    const parents = state.categories
      .filter((c) => !c.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const result: { category: Category; depth: number; count: number }[] = [];
    parents.forEach((parent) => {
      result.push({
        category: parent,
        depth: 0,
        count: productCounts.get(parent.id) ?? 0,
      });
      state.categories
        .filter((c) => c.parentId === parent.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .forEach((child) => {
          result.push({
            category: child,
            depth: 1,
            count: productCounts.get(child.id) ?? 0,
          });
        });
    });
    return result;
  }, [state.categories, productCounts]);

  const openCreate = () => {
    setEditing({
      id: uid("cat"),
      name: "",
      slug: "",
      parentId: null,
      description: "",
      image: CATEGORY_IMAGES[0],
      status: "active",
      sortOrder: state.categories.length + 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (category: Category) => {
    setEditing({ ...category });
    setDialogOpen(true);
  };

  const handleSave = async (category: Category) => {
    try {
      await saveCategory({
        ...category,
        slug: slugify(category.name) || category.slug,
      });
      toast({
        title:
          editing && editing.name !== category.name
            ? "Category updated"
            : "Category created",
        description: `${category.name} saved.`,
      });
      setDialogOpen(false);
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Catalogue structure"
        title="Categories"
        description="Build a two-level hierarchy so customers can browse scrubs, coats and accessories."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add category
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              className="m-4"
              icon={<FolderTree className="h-5 w-5" />}
              title="No categories yet"
              description="Create a top-level category such as “Scrub Apparel” to get started."
              action={<Button onClick={openCreate}>Add category</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Parent</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ category, depth, count }) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <div
                        className="flex items-center gap-3"
                        style={{ paddingLeft: depth ? 24 : 0 }}
                      >
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted">
                          <img
                            src={category.image}
                            alt={category.name}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                            {depth === 0 && (
                              <FolderTree className="h-3.5 w-3.5 text-ink-muted" />
                            )}
                            {category.name}
                          </p>
                          <p className="text-[11.5px] text-ink-muted">
                            /{category.slug}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {category.parentId
                        ? (state.categories.find(
                            (c) => c.id === category.parentId,
                          )?.name ?? "—")
                        : "Top level"}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {count}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {category.sortOrder}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          category.status === "active" ? "success" : "neutral"
                        }
                      >
                        {category.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Category actions"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => openEdit(category)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Edit category
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={async () => {
                              try {
                                return await toggleCategoryStatus(category.id);
                              } catch {
                                return false;
                              }
                            }}
                          >
                            {category.status === "active" ? (
                              <>
                                <PowerOff className="h-3.5 w-3.5" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <Power className="h-3.5 w-3.5" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            destructive
                            onClick={() => setDeleteTarget(category)}
                          >
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

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        category={editing}
        categories={state.categories}
        onSave={handleSave}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete category?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” will be removed. Child categories move to the top level and products are kept.`
            : undefined
        }
        confirmLabel="Delete category"
        destructive
        onConfirm={async () => {
          try {
            if (!deleteTarget) return;
            await deleteCategory(deleteTarget.id);
            toast({ title: "Category deleted", variant: "error" });
          } catch {
            return false;
          }
        }}
      />
    </div>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  categories,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Category | null;
  categories: Category[];
  onSave: (category: Category) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<Category | null>(category);

  useEffect(() => {
    if (open) setDraft(category);
  }, [open, category]);

  if (!draft) return null;

  const parents = categories.filter((c) => !c.parentId && c.id !== draft.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {category?.name ? "Edit category" : "New category"}
          </DialogTitle>
          <DialogDescription>
            Categories can be nested one level deep — parent and sub-category.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Women's Scrub Tops"
              />
            </div>
            <div>
              <Label>Parent category</Label>
              <Select
                value={draft.parentId ?? "none"}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    parentId: value === "none" ? null : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Top level</SelectItem>
                  {parents.map((parent) => (
                    <SelectItem key={parent.id} value={parent.id}>
                      {parent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cat-order">Sort order</Label>
              <Input
                id="cat-order"
                type="number"
                value={draft.sortOrder}
                onChange={(e) =>
                  setDraft({ ...draft, sortOrder: Number(e.target.value) })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cat-desc">Description</Label>
              <Textarea
                id="cat-desc"
                rows={3}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
                placeholder="Short description shown on the storefront."
              />
            </div>
          </div>

          <div>
            <Label>Category image</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORY_IMAGES.map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setDraft({ ...draft, image: src })}
                  className={`h-14 w-14 overflow-hidden rounded-md border-2 transition-all ${
                    draft.image === src ? "border-brand-500" : "border-line"
                  }`}
                >
                  <img
                    src={src}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Active</p>
              <p className="text-[12px] text-ink-muted">
                Inactive categories are hidden from storefront navigation.
              </p>
            </div>
            <Switch
              checked={draft.status === "active"}
              onCheckedChange={(checked) =>
                setDraft({ ...draft, status: checked ? "active" : "inactive" })
              }
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!draft.name.trim()}
            onClick={() => {
              if (!draft.name.trim()) {
                toast({ title: "Category name is required", variant: "error" });
                return;
              }
              onSave(draft);
            }}
          >
            {category?.name ? "Save changes" : "Create category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
