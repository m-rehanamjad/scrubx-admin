"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  Building2,
  Info,
  Pencil,
  Phone,
  ShieldAlert,
  Smartphone,
  Wallet,
} from "lucide-react";
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
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { formatPKR } from "../lib/format";
import { cn } from "../lib/utils";
import type { PaymentMethod } from "../lib/types";

const METHOD_ICON: Record<string, React.ElementType> = {
  jazzcash: Smartphone,
  easypaisa: Smartphone,
  sadapay: Wallet,
  nayapay: Wallet,
  bank: Building2,
  cod: Banknote,
};

export default function PaymentMethodsPage() {
  const { state, savePaymentMethod } = useStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState<PaymentMethod | null>(null);

  const methods = [...state.paymentMethods].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Payment methods"
        description="Manage the wallets, bank transfer and cash on delivery offered at checkout."
      />

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600" />
        <div>
          <p className="text-[13px] font-semibold text-amber-900">
            Engraving payment rule
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-800">
            Cash on Delivery is not available when engraving is selected.
            Engraved orders require advance payment — the COD method is
            therefore locked for engraving and the checkout removes it
            automatically for engraved items.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {methods.map((method) => {
          const Icon = METHOD_ICON[method.id] ?? Wallet;
          return (
            <Card
              key={method.id}
              className={cn(!method.active && "opacity-70")}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                        method.id === "cod"
                          ? "bg-navy-50 text-navy-600"
                          : "bg-brand-50 text-brand-600",
                      )}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold text-ink">
                          {method.name}
                        </p>
                        <Badge variant={method.active ? "success" : "neutral"}>
                          {method.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-ink-muted">
                        {method.description}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(method)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-[11.5px] text-ink-muted">
                      Account title
                    </dt>
                    <dd className="mt-0.5 text-[13px] font-medium text-ink">
                      {method.accountTitle}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] text-ink-muted">
                      {method.id === "bank"
                        ? "Account number"
                        : "Wallet number"}
                    </dt>
                    <dd className="mt-0.5 font-mono text-[13px] font-medium text-ink">
                      {method.accountNumber}
                    </dd>
                  </div>
                  {method.bankName !== "—" && (
                    <div>
                      <dt className="text-[11.5px] text-ink-muted">
                        Bank / provider
                      </dt>
                      <dd className="mt-0.5 text-[13px] text-ink-soft">
                        {method.bankName}
                      </dd>
                    </div>
                  )}
                  {method.iban && (
                    <div>
                      <dt className="text-[11.5px] text-ink-muted">IBAN</dt>
                      <dd className="mt-0.5 font-mono text-[12.5px] text-ink-soft">
                        {method.iban}
                      </dd>
                    </div>
                  )}
                </dl>

                {method.instructions && (
                  <p className="mt-4 rounded-md border border-line bg-surface-muted/70 px-3 py-2 text-[12px] leading-relaxed text-ink-soft">
                    {method.instructions}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                  <Badge variant={method.allowEngraving ? "success" : "danger"}>
                    {method.allowEngraving
                      ? "Allowed with engraving"
                      : "Not allowed with engraving"}
                  </Badge>
                  {method.supportsProof && (
                    <Badge variant="neutral">
                      <Phone className="h-3 w-3" />
                      Proof upload
                    </Badge>
                  )}
                  <span className="ml-auto text-[11.5px] text-ink-muted">
                    Display order {method.displayOrder}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div className="text-[12.5px] text-ink-soft">
            <p className="text-[13px] font-semibold text-ink">
              Store-level configuration
            </p>
            <p className="mt-1">
              The payment deadline is set in{" "}
              <a
                href="/settings"
                className="font-medium text-brand-700 hover:underline"
              >
                Store Settings
              </a>
              . Unpaid orders are automatically cancelled after the deadline.
              Current default:{" "}
              <span className="font-medium text-ink">
                {state.settings.paymentDeadlineHours} hours
              </span>
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <PaymentMethodDialog
        method={editing}
        onClose={() => setEditing(null)}
        onSave={async (method) => {
          try {
            await savePaymentMethod(method);
            toast({
              title: "Payment method updated",
              description: `${method.name} settings saved.`,
            });
            setEditing(null);
          } catch {
            return false;
          }
        }}
      />
    </div>
  );
}

function PaymentMethodDialog({
  method,
  onClose,
  onSave,
}: {
  method: PaymentMethod | null;
  onClose: () => void;
  onSave: (method: PaymentMethod) => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<PaymentMethod | null>(method);

  useEffect(() => {
    setDraft(method);
  }, [method]);

  if (!draft) return null;

  const isCod = draft.id === "cod";

  return (
    <Dialog open={Boolean(method)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {draft.name}</DialogTitle>
          <DialogDescription>
            These details are shown to customers on the checkout payment screen.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="pm-title">Account title</Label>
              <Input
                id="pm-title"
                value={draft.accountTitle}
                onChange={(e) =>
                  setDraft({ ...draft, accountTitle: e.target.value })
                }
                disabled={isCod}
              />
            </div>
            <div>
              <Label htmlFor="pm-number">
                {isCod
                  ? "Account number"
                  : draft.id === "bank"
                    ? "Account number"
                    : "Wallet number"}
              </Label>
              <Input
                id="pm-number"
                value={draft.accountNumber}
                onChange={(e) =>
                  setDraft({ ...draft, accountNumber: e.target.value })
                }
                disabled={isCod}
              />
            </div>
            <div>
              <Label htmlFor="pm-bank">Bank / provider</Label>
              <Input
                id="pm-bank"
                value={draft.bankName}
                onChange={(e) =>
                  setDraft({ ...draft, bankName: e.target.value })
                }
                disabled={isCod}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pm-iban">IBAN</Label>
              <Input
                id="pm-iban"
                value={draft.iban}
                onChange={(e) => setDraft({ ...draft, iban: e.target.value })}
                placeholder="PK00 SCBL 0000 0000 0000"
                disabled={isCod}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="pm-instructions">Customer instructions</Label>
              <Textarea
                id="pm-instructions"
                rows={3}
                value={draft.instructions}
                onChange={(e) =>
                  setDraft({ ...draft, instructions: e.target.value })
                }
                placeholder="Explain how the customer should send the payment."
              />
            </div>
            <div>
              <Label htmlFor="pm-order">Display order</Label>
              <Input
                id="pm-order"
                type="number"
                min={1}
                value={draft.displayOrder}
                onChange={(e) =>
                  setDraft({ ...draft, displayOrder: Number(e.target.value) })
                }
              />
            </div>
            <div className="flex items-end">
              <div className="flex w-full items-center justify-between rounded-md border border-line bg-surface-muted/60 px-3 py-2">
                <span className="text-[12.5px] font-medium text-ink">
                  Active
                </span>
                <Switch
                  checked={draft.active}
                  onCheckedChange={(checked) =>
                    setDraft({ ...draft, active: checked })
                  }
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "flex items-start justify-between gap-3 rounded-lg border p-3.5",
              isCod
                ? "border-amber-200 bg-amber-50"
                : "border-line bg-surface-muted/60",
            )}
          >
            <div>
              <p
                className={cn(
                  "text-[13px] font-medium",
                  isCod ? "text-amber-900" : "text-ink",
                )}
              >
                Allow with engraving
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[12px]",
                  isCod ? "text-amber-800" : "text-ink-muted",
                )}
              >
                {isCod
                  ? "Cash on Delivery cannot be used for engraved orders — advance payment is required."
                  : "Customers can select this method even when their order includes engraving."}
              </p>
            </div>
            <Switch
              checked={draft.allowEngraving}
              disabled={isCod}
              onCheckedChange={(checked) => {
                if (isCod) {
                  toast({
                    title: "COD is blocked for engraved orders",
                    description: "Engraved orders require advance payment.",
                    variant: "warning",
                  });
                  return;
                }
                setDraft({ ...draft, allowEngraving: checked });
              }}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(draft)}>Save changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
