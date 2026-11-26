import { useEffect } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PaymentStatus } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import Logo from "@/components/Logo";

/** /payment/success?session_id=... polls until Stripe confirms; /payment/cancel just explains. */
export default function PaymentResult() {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const sessionId = params.get("session_id") ?? "";
  const cancelled = pathname.endsWith("/cancel");
  const status = useQuery({
    queryKey: ["payment-status", sessionId],
    queryFn: () => apiGet<PaymentStatus>(`/payments/status/${sessionId}`),
    enabled: !cancelled && !!sessionId,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (s && (s.payment_status === "paid" || s.status === "expired")) return false;
      return q.state.dataUpdateCount >= 30 ? false : 2000;
    },
  });
  const paid = status.data?.payment_status === "paid";
  const gaveUp = !paid && (status.isError || (status.data?.status === "expired") || (status.dataUpdatedAt > 0 && status.data && status.data.payment_status !== "paid" && (status.failureCount > 3)));

  useEffect(() => {
    if (paid) {
      qc.invalidateQueries({ queryKey: ["billing"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    }
  }, [paid, qc]);

  const state = cancelled ? "cancelled" : paid ? "paid" : gaveUp || !sessionId ? "failed" : "waiting";
  return (
    <div className="flex min-h-screen flex-col bg-[#F9F9F8]">
      <header className="flex h-14 items-center border-b border-[#E5E5E3] px-5"><Logo to="/dashboard" /></header>
      <main className="flex flex-1 items-center justify-center px-5">
        <div className="k-rise w-full max-w-sm rounded-xl border border-[#E5E5E3] bg-white p-8 text-center" data-testid="payment-result" data-state={state}>
          <span className={`mx-auto flex size-10 items-center justify-center rounded-full ${state === "paid" ? "bg-[#ECFDF5] text-[#0F766E]" : state === "waiting" ? "bg-[#F4F4F2] text-[#666664]" : "bg-[#FEF2F2] text-[#DC2626]"}`}>
            {state === "paid" ? <Check className="size-5" /> : state === "waiting" ? <Loader2 className="size-5 animate-spin" /> : <X className="size-5" />}
          </span>
          <h1 className="mt-4 text-lg font-medium" data-testid="payment-result-title">
            {state === "paid" ? "Payment confirmed" : state === "waiting" ? "Confirming your payment" : state === "cancelled" ? "Checkout cancelled" : "We couldn't confirm the payment"}
          </h1>
          <p className="mt-1 text-sm text-[#666664]">
            {state === "paid" ? "Your new plan is active." : state === "waiting" ? "This takes a few seconds." : state === "cancelled" ? "Nothing was charged." : "If you were charged, it will show on your billing page shortly."}
          </p>
          <Link to="/billing" className={`${buttonVariants({ variant: state === "paid" ? "default" : "outline" })} k-press mt-6 w-full`} data-testid="payment-result-billing-link">Go to billing</Link>
        </div>
      </main>
    </div>
  );
}
