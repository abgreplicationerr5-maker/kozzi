import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExternalLink, FileText } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Billing, CheckoutOut, Me } from "@/lib/types";
import { notifyError } from "@/lib/notify";
import { PLAN_INTENT_KEY } from "@/lib/pending";
import { cn } from "@/lib/utils";
import PageShell from "@/components/PageShell";
import PlanCards, { IntervalToggle, type Interval } from "@/components/PlanCards";
import EnquiryDialog from "@/components/EnquiryDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";


function Meter({ label, used, cap, testId }: { label: string; used: number; cap: number | null; testId: string }) {
  const pct = cap ? Math.min(100, (used / cap) * 100) : 6;
  const over = cap !== null && used >= cap;
  return (
    <div data-testid={testId}>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-[#666664]">{label}</span>
        <span className="tabular-nums" data-testid={`${testId}-value`}>{used}{cap === null ? " of unlimited" : ` of ${cap}`}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#F0F0EE]">
        <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", over ? "bg-[#D97706]" : "bg-[#0F766E]")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const billing = useQuery({ queryKey: ["billing"], queryFn: () => apiGet<Billing>("/billing") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const b = billing.data;
  const [interval, setInterval] = useState<Interval>("month");
  const [enquiry, setEnquiry] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null); // lookup key waiting for confirmation
  const [pendingPlan, setPendingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (b?.interval === "year") setInterval("year");
  }, [b?.interval]);

  // A plan picked on the pricing page before sign-in, or via ?plan=pro_yearly
  useEffect(() => {
    const key = params.get("plan") || localStorage.getItem(PLAN_INTENT_KEY);
    if (!key || !b) return;
    localStorage.removeItem(PLAN_INTENT_KEY);
    if (params.get("plan")) setParams({}, { replace: true });
    if (key.endsWith("_yearly")) setInterval("year");
    if (b.prices.some((p) => p.lookup_key === key) && !key.startsWith(b.plan)) setConfirm(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);

  const refresh = (nb: Billing) => {
    qc.setQueryData(["billing"], nb);
    qc.invalidateQueries({ queryKey: ["me"] });
  };
  const checkout = useMutation({
    mutationFn: (lookup_key: string) => apiPost<CheckoutOut>("/billing/checkout", { lookup_key, origin_url: window.location.origin }),
    onSuccess: (r) => window.location.assign(r.checkout_url),
    onError: (e) => { setPendingPlan(null); notifyError(e); },
  });
  const change = useMutation({
    mutationFn: (lookup_key: string) => apiPost<Billing>("/billing/change", { lookup_key }),
    onSuccess: (nb) => { refresh(nb); setConfirm(null); setPendingPlan(null); toast.success(`You're on ${nb.label} now`); },
    onError: (e) => { setPendingPlan(null); notifyError(e); },
  });
  const cancel = useMutation({
    mutationFn: (resume: boolean) => apiPost<Billing>(resume ? "/billing/resume" : "/billing/cancel"),
    onSuccess: (nb) => { refresh(nb); toast.success(nb.cancel_at_period_end ? "Your plan ends at the end of this period" : "Your plan will keep renewing"); },
    onError: notifyError,
  });

  const select = (plan: string) => {
    if (plan === "enterprise") return setEnquiry(true);
    if (plan === "free") return;
    setConfirm(`${plan}_${interval === "month" ? "monthly" : "yearly"}`);
  };
  const go = () => {
    if (!confirm || !b) return;
    setPendingPlan(confirm.split("_")[0]);
    if (b.has_subscription) change.mutate(confirm);
    else checkout.mutate(confirm);
  };
  const price = b?.prices.find((p) => p.lookup_key === confirm);

  return (
    <PageShell title="Plan and billing" sub="Card payments are in Stripe test mode. Use card 4242 4242 4242 4242, any future date and any CVC.">
      {billing.isLoading && <div className="k-skeleton h-40 rounded-xl" />}
      {billing.isError && <p className="text-sm text-[#666664]" data-testid="billing-error">Couldn't load billing. Refresh to retry.</p>}
      {b && (
        <div className="space-y-10">
          <section className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-[#E5E5E3] bg-white p-6" data-testid="billing-current">
              <p className="text-xs text-[#666664]">Current plan</p>
              <p className="mt-1 text-2xl font-medium tracking-tight" data-testid="billing-plan-label">{b.label}</p>
              <p className="mt-2 text-sm text-[#666664]" data-testid="billing-plan-detail">
                {b.plan === "free" && "No card on file. Upgrade any time."}
                {b.plan !== "free" && b.source === "admin" && (b.period_end ? `Set up by the Kozzi team until ${format(new Date(b.period_end), "MMM d, yyyy")}.` : "Set up by the Kozzi team.")}
                {b.plan !== "free" && b.source === "stripe" && b.period_end && (b.cancel_at_period_end
                  ? `Ends on ${format(new Date(b.period_end), "MMM d, yyyy")}. You keep everything until then.`
                  : `Billed ${b.interval === "year" ? "yearly" : "monthly"}. Renews on ${format(new Date(b.period_end), "MMM d, yyyy")}.`)}
                {b.status === "past_due" && " Your last payment failed. Update your card on the latest invoice."}
              </p>
              {b.has_subscription && (
                <Button variant="outline" size="sm" className="k-press mt-4" disabled={cancel.isPending} onClick={() => cancel.mutate(b.cancel_at_period_end)} data-testid="billing-cancel-toggle-btn">
                  {b.cancel_at_period_end ? "Keep my plan" : "Cancel plan"}
                </Button>
              )}
            </div>
            <div className="space-y-4 rounded-xl border border-[#E5E5E3] bg-white p-6" data-testid="billing-usage">
              <p className="text-xs text-[#666664]">Usage</p>
              <Meter label="Projects" used={b.usage.projects} cap={b.limits.projects} testId="usage-projects" />
              <Meter label="Live apps" used={b.usage.live} cap={b.limits.live} testId="usage-live" />
              <Meter label="Seats" used={b.usage.seats} cap={b.limits.seats} testId="usage-seats" />
              <p className="text-xs text-[#9A9A97]">{b.limits.domains ? "Own domains included." : "Own domains need Pro or Team."} {b.limits.emails_per_day} app emails a day per app.</p>
            </div>
          </section>

          <section>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-medium tracking-tight">Plans</h2>
              <IntervalToggle value={interval} onChange={setInterval} />
            </div>
            <PlanCards interval={interval} current={b.plan} onSelect={select} pending={pendingPlan} />
          </section>

          <section>
            <h2 className="mb-4 text-lg font-medium tracking-tight">Invoices</h2>
            {b.invoices.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-8 text-center text-sm text-[#666664]" data-testid="invoices-empty">No invoices yet. They appear here after your first payment.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E5E5E3] bg-white">
                <table className="w-full text-sm" data-testid="invoices-table">
                  <thead className="border-b border-[#E5E5E3] bg-[#FBFBFA] text-left text-xs text-[#666664]">
                    <tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Invoice</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2" /></tr>
                  </thead>
                  <tbody className="divide-y divide-[#F0F0EE]">
                    {b.invoices.map((i) => (
                      <tr key={i.id} data-testid={`invoice-row-${i.id}`}>
                        <td className="px-4 py-2.5">{format(new Date(i.created_at), "MMM d, yyyy")}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{i.number || i.id.slice(-8)}</td>
                        <td className="px-4 py-2.5 tabular-nums">{i.amount.toLocaleString(undefined, { style: "currency", currency: i.currency.toUpperCase() })}</td>
                        <td className="px-4 py-2.5 capitalize">{i.status}</td>
                        <td className="px-4 py-2.5 text-right">
                          {i.hosted_url && <a href={i.hosted_url} target="_blank" rel="noreferrer" className="mr-3 inline-flex items-center gap-1 text-xs text-[#0F766E] hover:underline" data-testid={`invoice-view-${i.id}`}><ExternalLink className="size-3" /> View</a>}
                          {i.pdf_url && <a href={i.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-[#666664] hover:text-[#111111]" data-testid={`invoice-pdf-${i.id}`}><FileText className="size-3" /> PDF</a>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="bg-white sm:max-w-sm" data-testid="plan-confirm-dialog">
          <DialogHeader>
            <DialogTitle>{b?.has_subscription ? "Switch plan" : "Upgrade"} to {price?.plan === "team" ? "Team" : "Pro"}</DialogTitle>
            <DialogDescription>
              {price && `$${price.amount} per ${price.interval}.`} {b?.has_subscription ? "The price difference is prorated on your next invoice." : "You'll pay securely on Stripe and come straight back here."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} data-testid="plan-confirm-cancel-btn">Not now</Button>
            <Button className="k-press" onClick={go} disabled={checkout.isPending || change.isPending} data-testid="plan-confirm-btn">
              {checkout.isPending || change.isPending ? "One moment" : b?.has_subscription ? "Switch plan" : "Continue to payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <EnquiryDialog open={enquiry} onOpenChange={setEnquiry} defaultEmail={me.data?.email} />
    </PageShell>
  );
}
