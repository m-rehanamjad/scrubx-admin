"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Eye,
  FileWarning,
  SearchX,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import { PageHeader } from "../components/shared/page-header";
import { EmptyState } from "../components/shared/empty-state";
import { SearchInput } from "../components/shared/search-input";
import { Avatar } from "../components/shared/thumb";
import { useToast } from "../components/ui/toast";
import { useStore } from "../data/store";
import { PAYMENT_METHOD_LABEL } from "../data/constants";
import { formatDateTime, formatPKR } from "../lib/format";
import { cn } from "../lib/utils";

export default function PaymentsPage() {
  const { state, approvePayment, rejectPayment } = useStore();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [proofTarget, setProofTarget] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const submissions = useMemo(
    () =>
      [...state.paymentSubmissions].sort(
        (a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt),
      ),
    [state.paymentSubmissions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.orderNumber.toLowerCase().includes(q) ||
        s.customerName.toLowerCase().includes(q) ||
        s.transactionRef.toLowerCase().includes(q),
    );
  }, [submissions, query]);

  const pending = submissions.filter((s) => s.status === "submitted");
  const approved = submissions.filter((s) => s.status === "approved");
  const rejected = submissions.filter((s) => s.status === "rejected");

  const stats = [
    {
      label: "Awaiting verification",
      value: String(pending.length),
      hint: `${formatPKR(pending.reduce((s, p) => s + p.amount, 0))} pending`,
      icon: Clock,
      tone: "amber",
    },
    {
      label: "Approved",
      value: String(approved.length),
      hint: `${formatPKR(approved.reduce((s, p) => s + p.amount, 0))} verified`,
      icon: CheckCircle2,
      tone: "brand",
    },
    {
      label: "Rejected",
      value: String(rejected.length),
      hint: "Needs customer re-submission",
      icon: XCircle,
      tone: "rose",
    },
    {
      label: "Verified value",
      value: formatPKR(approved.reduce((s, p) => s + p.amount, 0)),
      hint: "Across all payment methods",
      icon: CircleDollarSign,
      tone: "navy",
    },
  ];

  const proof = state.paymentSubmissions.find((s) => s.id === proofTarget);
  const rejectSubmission = state.paymentSubmissions.find(
    (s) => s.id === rejectTarget,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Finance"
        title="Payment verification"
        description="Check submitted transaction proofs, approve legitimate payments and reject invalid ones."
        actions={
          <Badge variant="neutral">
            <ShieldCheck className="h-3 w-3" />
            Manual review required
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-start justify-between p-4">
              <div>
                <p className="text-[12px] font-medium text-ink-muted">
                  {stat.label}
                </p>
                <p className="mt-1.5 text-[20px] font-semibold leading-none text-ink tabular">
                  {stat.value}
                </p>
                <p className="mt-2 text-[11.5px] text-ink-muted">{stat.hint}</p>
              </div>
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
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
          <Tabs defaultValue="pending">
            <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="pending">
                  Pending ({pending.length})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All ({submissions.length})
                </TabsTrigger>
                <TabsTrigger value="approved">Approved</TabsTrigger>
                <TabsTrigger value="rejected">Rejected</TabsTrigger>
              </TabsList>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Search order, customer or transaction ID…"
                className="w-full lg:w-72"
              />
            </div>

            <TabsContent value="pending" className="mt-0">
              <SubmissionList
                items={filtered.filter((s) => s.status === "submitted")}
                onViewProof={setProofTarget}
                onApprove={async (id) => {
                  try {
                    await approvePayment(id);
                    toast({
                      title: "Payment approved",
                      description:
                        "The order has been confirmed automatically.",
                    });
                  } catch {
                    return false;
                  }
                }}
                onReject={(id) => {
                  setRejectTarget(id);
                  setRejectReason("");
                }}
                emptyState={
                  <EmptyState
                    className="m-4"
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    title="Nothing awaiting verification"
                    description="New payment proofs submitted by customers will appear here."
                  />
                }
              />
            </TabsContent>
            <TabsContent value="all" className="mt-0">
              <SubmissionList
                items={filtered}
                onViewProof={setProofTarget}
                emptyState={
                  <EmptyState
                    className="m-4"
                    icon={<SearchX className="h-5 w-5" />}
                    title="No submissions found"
                  />
                }
              />
            </TabsContent>
            <TabsContent value="approved" className="mt-0">
              <SubmissionList
                items={filtered.filter((s) => s.status === "approved")}
                onViewProof={setProofTarget}
                emptyState={
                  <EmptyState
                    className="m-4"
                    title="No approved payments yet"
                  />
                }
              />
            </TabsContent>
            <TabsContent value="rejected" className="mt-0">
              <SubmissionList
                items={filtered.filter((s) => s.status === "rejected")}
                onViewProof={setProofTarget}
                emptyState={
                  <EmptyState className="m-4" title="No rejected payments" />
                }
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(proofTarget)}
        onOpenChange={(open) => !open && setProofTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Payment proof</DialogTitle>
            <DialogDescription>
              {proof?.orderNumber} · {proof?.transactionRef}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {proof && (
              <img
                src={proof.proofUrl}
                alt="Payment proof screenshot"
                className="w-full rounded-lg border border-line"
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofTarget(null)}>
              Close
            </Button>
            {proof && (
              <Button asChild>
                <Link href={`/orders/${proof.orderId}`}>Open order</Link>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rejectTarget)}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject payment</DialogTitle>
            <DialogDescription>
              {rejectSubmission?.orderNumber} ·{" "}
              {rejectSubmission && formatPKR(rejectSubmission.amount)}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
              <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
              Rejecting returns the order to “Awaiting Payment” and notifies the
              customer to send a fresh transfer.
            </div>
            <div>
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <Textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. Transaction reference does not match the amount"
                className="mt-1.5"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                try {
                  if (!rejectTarget) return;
                  await rejectPayment(rejectTarget, rejectReason.trim());
                  toast({
                    title: "Payment rejected",
                    description:
                      "The customer has been asked to re-submit the payment.",
                    variant: "error",
                  });
                  setRejectTarget(null);
                } catch {
                  return false;
                }
              }}
            >
              Reject payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubmissionList({
  items,
  onViewProof,
  onApprove,
  onReject,
  emptyState,
}: {
  items: ReturnType<typeof useStore>["state"]["paymentSubmissions"];
  onViewProof: (id: string) => void;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  emptyState: React.ReactNode;
}) {
  if (items.length === 0) return <>{emptyState}</>;

  return (
    <div className="divide-y divide-line">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center"
        >
          <button
            onClick={() => onViewProof(item.id)}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-surface-muted"
            aria-label="View payment proof"
          >
            <img
              src={item.proofUrl}
              alt="Payment proof"
              className="h-full w-full object-cover"
            />
            <span className="absolute inset-0 flex items-center justify-center bg-navy-900/45 opacity-0 transition-opacity group-hover:opacity-100">
              <Eye className="h-4 w-4 text-white" />
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/orders/${item.orderId}`}
                className="font-mono text-[12.5px] font-semibold text-brand-700 hover:underline"
              >
                {item.orderNumber}
              </Link>
              <Badge variant="navy">{PAYMENT_METHOD_LABEL[item.method]}</Badge>
              {item.status === "submitted" && (
                <Badge variant="warning">Needs review</Badge>
              )}
              {item.status === "approved" && (
                <Badge variant="success">Approved</Badge>
              )}
              {item.status === "rejected" && (
                <Badge variant="danger">Rejected</Badge>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <Avatar name={item.customerName} size="sm" />
              <div>
                <p className="text-[12.5px] font-medium text-ink">
                  {item.customerName}
                </p>
                <p className="text-[11.5px] text-ink-muted">
                  {item.customerPhone}
                </p>
              </div>
            </div>
            <p className="mt-1.5 text-[11.5px] text-ink-muted">
              Ref:{" "}
              <span className="font-mono text-ink-soft">
                {item.transactionRef}
              </span>{" "}
              · {formatDateTime(item.submittedAt)}
              {item.rejectionReason && (
                <span className="ml-1 text-rose-600">
                  — {item.rejectionReason}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 lg:flex-col lg:items-end">
            <p className="text-[17px] font-semibold text-ink tabular">
              {formatPKR(item.amount)}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewProof(item.id)}
              >
                <Eye className="h-3.5 w-3.5" />
                Proof
              </Button>
              {item.status === "submitted" && onApprove && (
                <Button size="sm" onClick={() => onApprove(item.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </Button>
              )}
              {item.status === "submitted" && onReject && (
                <Button
                  variant="danger-outline"
                  size="sm"
                  onClick={() => onReject(item.id)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
