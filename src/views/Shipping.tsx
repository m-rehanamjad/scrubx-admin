'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, PackageCheck, Pencil, Plus, Trash2, Truck } from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
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
import { EmptyState } from "../components/shared/empty-state";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { useToast } from "../components/ui/toast";
import { formatPKR } from "../lib/format";
import { uid } from "../lib/utils";
import type { ShippingMethod } from "../lib/types";
import {
  createShippingMethodAction,
  updateShippingMethodAction,
  toggleShippingMethodStatusAction,
  deleteShippingMethodAction,
} from "../actions/shipping";

interface ShippingProps {
  initialMethods?: ShippingMethod[];
}

export default function ShippingPage({ initialMethods = [] }: ShippingProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [methods, setMethods] = useState<ShippingMethod[]>(initialMethods);
  const [editing, setEditing] = useState<ShippingMethod | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ShippingMethod | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setMethods(initialMethods);
  }, [initialMethods]);

  const sortedMethods = useMemo(
    () => [...methods].sort((a, b) => a.displayOrder - b.displayOrder),
    [methods],
  );

  const openCreate = () => {
    setEditing({
      id: uid("ship"),
      name: "",
      description: "",
      price: 250,
      freeShippingThreshold: 5000,
      minDays: 3,
      maxDays: 5,
      active: true,
      displayOrder: methods.length + 1,
    });
    setDialogOpen(true);
  };

  const openEdit = (method: ShippingMethod) => {
    setEditing({ ...method });
    setDialogOpen(true);
  };

  const handleSave = async (method: ShippingMethod) => {
    setIsSubmitting(true);
    const isExisting = methods.some((m) => m.id === method.id);

    try {
      if (isExisting) {
        const res = await updateShippingMethodAction({
          id: method.id,
          name: method.name.trim(),
          description: method.description?.trim() || null,
          price: Number(method.price),
          freeAbove: method.freeShippingThreshold ? Number(method.freeShippingThreshold) : null,
          minDays: Number(method.minDays),
          maxDays: Number(method.maxDays),
          isActive: Boolean(method.active),
          sortOrder: Number(method.displayOrder),
        });

        if (res.success) {
          toast({
            title: "Shipping method updated",
            description: method.name,
          });
          setDialogOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Failed to update shipping method",
            description: res.error || "An error occurred.",
            variant: "error",
          });
        }
      } else {
        const res = await createShippingMethodAction({
          name: method.name.trim(),
          description: method.description?.trim() || null,
          price: Number(method.price),
          freeAbove: method.freeShippingThreshold ? Number(method.freeShippingThreshold) : null,
          minDays: Number(method.minDays),
          maxDays: Number(method.maxDays),
          isActive: Boolean(method.active),
          sortOrder: Number(method.displayOrder),
        });

        if (res.success) {
          toast({
            title: "Shipping method created",
            description: method.name,
          });
          setDialogOpen(false);
          router.refresh();
        } else {
          toast({
            title: "Failed to create shipping method",
            description: res.error || "An error occurred.",
            variant: "error",
          });
        }
      }
    } catch (err: any) {
      toast({
        title: "Error saving shipping method",
        description: err.message,
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggle = async (method: ShippingMethod) => {
    try {
      const nextActive = !method.active;
      const res = await toggleShippingMethodStatusAction({
        id: method.id,
        isActive: nextActive,
      });

      if (res.success) {
        toast({
          title: nextActive ? "Method enabled" : "Method disabled",
          description: method.name,
        });
        router.refresh();
      } else {
        toast({
          title: "Failed to update status",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error updating status",
        description: err.message,
        variant: "error",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await deleteShippingMethodAction({ id: deleteTarget.id });
      if (res.success) {
        toast({ title: "Shipping method deleted", variant: "error" });
        setDeleteTarget(null);
        router.refresh();
      } else {
        toast({
          title: "Failed to delete method",
          description: res.error || "An error occurred.",
          variant: "error",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error deleting method",
        description: err.message,
        variant: "error",
      });
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Shipping methods"
        description="Set delivery charges, free-shipping thresholds and estimated delivery windows."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New method
          </Button>
        }
      />

      {sortedMethods.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title="No shipping methods"
          description="Add a delivery method so customers can choose how their order arrives."
          action={<Button onClick={openCreate}>Add method</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sortedMethods.map((method) => (
            <Card key={method.id} className={method.active ? "" : "opacity-75"}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-50 text-navy-600">
                      <Truck className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold text-ink">{method.name}</p>
                        <Badge variant={method.active ? "success" : "neutral"}>
                          {method.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-ink-muted">{method.description}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => openEdit(method)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-[11.5px] text-ink-muted">Shipping price</dt>
                    <dd className="mt-0.5 text-[14px] font-semibold text-ink tabular">
                      {method.price === 0 ? "Free" : formatPKR(method.price)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-ink-muted">Free over</dt>
                    <dd className="mt-0.5 text-[14px] font-semibold text-ink tabular">
                      {method.freeShippingThreshold
                        ? formatPKR(method.freeShippingThreshold)
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-ink-muted">Delivery</dt>
                    <dd className="mt-0.5 flex items-center gap-1 text-[14px] font-semibold text-ink">
                      <Clock className="h-3.5 w-3.5 text-ink-muted" />
                      {method.minDays === method.maxDays
                        ? `${method.minDays}d`
                        : `${method.minDays}–${method.maxDays}d`}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
                  <span className="text-[11.5px] text-ink-muted">
                    Display order {method.displayOrder}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(method)}
                    >
                      {method.active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(method)}
                      aria-label="Delete shipping method"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-rose-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ShippingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        method={editing}
        onSave={handleSave}
        isSubmitting={isSubmitting}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete shipping method?"
        description={
          deleteTarget ? `“${deleteTarget.name}” will no longer be offered at checkout.` : undefined
        }
        confirmLabel="Delete method"
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ShippingDialog({
  open,
  onOpenChange,
  method,
  onSave,
  isSubmitting = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  method: ShippingMethod | null;
  onSave: (method: ShippingMethod) => void;
  isSubmitting?: boolean;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<ShippingMethod | null>(method);

  useEffect(() => {
    setDraft(method);
  }, [method]);

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{method?.name ? "Edit shipping method" : "New shipping method"}</DialogTitle>
          <DialogDescription>
            Configure delivery fees, free shipping rules and expected transit times.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="ship-name">Method name</Label>
              <Input
                id="ship-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Standard Delivery (TCS)"
              />
            </div>
            <div>
              <Label htmlFor="ship-desc">Description</Label>
              <Textarea
                id="ship-desc"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="e.g. Delivered across all major cities of Pakistan via TCS courier."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ship-price">Flat shipping price (Rs.)</Label>
                <Input
                  id="ship-price"
                  type="number"
                  min={0}
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="ship-free">Free over (Rs.)</Label>
                <Input
                  id="ship-free"
                  type="number"
                  min={0}
                  value={draft.freeShippingThreshold ?? ""}
                  placeholder="Optional threshold"
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      freeShippingThreshold: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="ship-min">Min days</Label>
                <Input
                  id="ship-min"
                  type="number"
                  min={1}
                  value={draft.minDays}
                  onChange={(e) => setDraft({ ...draft, minDays: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="ship-max">Max days</Label>
                <Input
                  id="ship-max"
                  type="number"
                  min={1}
                  value={draft.maxDays}
                  onChange={(e) => setDraft({ ...draft, maxDays: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="ship-order">Display order</Label>
                <Input
                  id="ship-order"
                  type="number"
                  min={1}
                  value={draft.displayOrder}
                  onChange={(e) => setDraft({ ...draft, displayOrder: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Active</p>
              <p className="text-[12px] text-ink-muted">
                Inactive methods will not appear in checkout.
              </p>
            </div>
            <Switch
              checked={draft.active}
              onCheckedChange={(checked) => setDraft({ ...draft, active: checked })}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!draft.name.trim() || isSubmitting}
            onClick={() => {
              if (!draft.name.trim()) {
                toast({ title: "Method name is required", variant: "error" });
                return;
              }
              if (draft.maxDays < draft.minDays) {
                toast({
                  title: "Invalid delivery days",
                  description: "Maximum days cannot be less than minimum days.",
                  variant: "error",
                });
                return;
              }
              onSave(draft);
            }}
          >
            {isSubmitting ? "Saving..." : method?.name ? "Save changes" : "Create method"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
