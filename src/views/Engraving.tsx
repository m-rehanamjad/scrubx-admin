'use client';

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Hash,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Type,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { PageHeader } from "../components/shared/page-header";
import { EmptyState } from "../components/shared/empty-state";
import { ConfirmDialog } from "../components/shared/confirm-dialog";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { formatPKR } from "../lib/format";
import { uid } from "../lib/utils";
import type { EngravingOption } from "../lib/types";

export default function EngravingPage() {
  const { state, saveEngravingOption, deleteEngravingOption } = useStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<EngravingOption | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EngravingOption | null>(null);

  const options = state.engravingOptions;

  const openCreate = () => {
    setEditing({
      id: uid("eng"),
      name: "",
      type: "name",
      description: "",
      price: 350,
      maxCharacters: 12,
      active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (option: EngravingOption) => {
    setEditing({ ...option });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Engraving options"
        description="Define the name and logo engraving services offered at checkout, with pricing and character limits."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            New option
          </Button>
        }
      />

      <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Engraving is an add-on charged per unit. Orders that include engraving can only be paid
          in advance — Cash on Delivery is removed from checkout for those orders.
        </p>
      </div>

      {options.length === 0 ? (
        <EmptyState
          icon={<Type className="h-5 w-5" />}
          title="No engraving options"
          description="Create a name or logo engraving service to offer it on products."
          action={<Button onClick={openCreate}>Create option</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {options.map((option) => (
            <Card key={option.id} className={option.active ? "" : "opacity-75"}>
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={
                        option.type === "logo"
                          ? "flex h-10 w-10 items-center justify-center rounded-lg bg-navy-50 text-navy-600"
                          : "flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600"
                      }
                    >
                      {option.type === "logo" ? (
                        <ImageIcon className="h-4.5 w-4.5" />
                      ) : (
                        <Type className="h-4.5 w-4.5" />
                      )}
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold text-ink">{option.name}</p>
                        <Badge variant={option.type === "logo" ? "navy" : "brand"}>
                          {option.type === "logo" ? "Logo" : "Name"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                        {option.description}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Engraving actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(option)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit option
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem destructive onClick={() => setDeleteTarget(option)}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
                  <div>
                    <p className="text-[11.5px] text-ink-muted">Price per unit</p>
                    <p className="mt-0.5 text-[14px] font-semibold text-ink tabular">
                      {formatPKR(option.price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11.5px] text-ink-muted">Max characters</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[14px] font-semibold text-ink tabular">
                      <Hash className="h-3.5 w-3.5 text-ink-muted" />
                      {option.maxCharacters ?? "—"}
                    </p>
                  </div>
                </div>

                <div className="mt-auto flex items-center justify-between border-t border-line pt-4">
                  <Badge variant={option.active ? "success" : "neutral"}>
                    {option.active ? "Active" : "Inactive"}
                  </Badge>
                  <Switch
                    checked={option.active}
                    onCheckedChange={(checked) => {
                      saveEngravingOption({ ...option, active: checked });
                      toast({
                        title: checked ? "Option activated" : "Option deactivated",
                        description: option.name,
                      });
                    }}
                    aria-label={`Toggle ${option.name}`}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <EngravingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        option={editing}
        onSave={(option) => {
          saveEngravingOption(option);
          toast({
            title: editing?.name ? "Engraving option updated" : "Engraving option created",
            description: option.name,
          });
          setDialogOpen(false);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete engraving option?"
        description={
          deleteTarget
            ? `“${deleteTarget.name}” will no longer be offered on the storefront.`
            : undefined
        }
        confirmLabel="Delete option"
        destructive
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteEngravingOption(deleteTarget.id);
          toast({ title: "Engraving option deleted", variant: "error" });
        }}
      />
    </div>
  );
}

function EngravingDialog({
  open,
  onOpenChange,
  option,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  option: EngravingOption | null;
  onSave: (option: EngravingOption) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<EngravingOption | null>(option);

  useEffect(() => {
    setDraft(option);
  }, [option]);

  if (!draft) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{option?.name ? "Edit engraving option" : "New engraving option"}</DialogTitle>
          <DialogDescription>
            Pricing is charged per unit on top of the product price.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="eng-name">Name</Label>
            <Input
              id="eng-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Standard Name Embroidery"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Engraving type</Label>
              <Select
                value={draft.type}
                onValueChange={(value) =>
                  setDraft({
                    ...draft,
                    type: value as "name" | "logo",
                    maxCharacters: value === "logo" ? null : draft.maxCharacters ?? 12,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name engraving</SelectItem>
                  <SelectItem value="logo">Logo engraving</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="eng-price">Price per unit (Rs.)</Label>
              <Input
                id="eng-price"
                type="number"
                min={0}
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="eng-max">Maximum characters</Label>
            <Input
              id="eng-max"
              type="number"
              min={0}
              value={draft.maxCharacters ?? ""}
              placeholder="Leave blank for logo engraving"
              disabled={draft.type === "logo"}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  maxCharacters: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label htmlFor="eng-desc">Description</Label>
            <Textarea
              id="eng-desc"
              rows={3}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="Where the engraving is placed and how it is produced."
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface-muted/60 p-3">
            <div>
              <p className="text-[13px] font-medium text-ink">Active</p>
              <p className="text-[12px] text-ink-muted">Inactive options are hidden at checkout.</p>
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
            disabled={!draft.name.trim()}
            onClick={() => {
              if (!draft.name.trim()) {
                toast({ title: "Option name is required", variant: "error" });
                return;
              }
              onSave(draft);
            }}
          >
            {option?.name ? "Save changes" : "Create option"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
