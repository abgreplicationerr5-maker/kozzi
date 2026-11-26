import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Gauge, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { CheckoutOut, UsageInfo } from "@/lib/types";
import { notifyError } from "@/lib/notify";
import { Button } from "@/components/ui/button";

const NEXT: Record<string, { key: string; label: string } | undefined> = {
  free: { key: "pro_monthly", label: "Upgrade to Pro" },
  pro: { key: "team_monthly", label: "Move to Team" },
};

/** Shows once projects or live apps reach 80% of the plan's limit. One tap starts checkout. */
export default function UsageBanner() {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["usage"], queryFn: () => apiGet<UsageInfo>("/billing/usage") });
  const [hidden, setHidden] = useState<string | null>(() => sessionStorage.getItem("kozzi_usage_dismissed"));
  const upgrade = useMutation({
    mutationFn: (key: string) => apiPost<CheckoutOut>("/billing/checkout", { lookup_key: key, origin_url: window.location.origin }),
    onSuccess: (r) => window.location.assign(r.checkout_url),
    onError: (e, key) => {
      // Already subscribed (e.g. Pro hitting its live-app limit): plan changes happen on the billing page.
      if (e instanceof Error && "status" in e && (e as { status: number }).status === 409) navigate(`/billing?plan=${key}`);
      else notifyError(e);
    },
  });
  const u = q.data;
  if (!u) return null;
  const items = [
    { what: "projects", used: u.usage.projects, cap: u.limits.projects },
    { what: "live apps", used: u.usage.live, cap: u.limits.live },
  ].filter((i) => i.cap !== null && i.used >= 0.8 * (i.cap as number));
  const sig = `${u.plan}:${u.usage.projects}:${u.usage.live}`;
  const next = NEXT[u.plan];
  const show = items.length > 0 && hidden !== sig;
  const text = items.map((i) => `${i.used} of ${i.cap} ${i.what}`).join(" and ");
  const full = items.some((i) => i.used >= (i.cap as number));

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 sm:flex-row sm:items-center" data-testid="usage-banner">
            <Gauge className="hidden size-4 shrink-0 text-[#B45309] sm:block" />
            <p className="flex-1 text-sm text-[#92400E]" data-testid="usage-banner-text">
              You've used {text} on the {u.label} plan.{full ? " New ones are blocked until you upgrade or free some up." : " You're close to the limit."}
            </p>
            <div className="flex items-center gap-2">
              {next ? (
                <Button size="sm" className="k-press" disabled={upgrade.isPending} onClick={() => upgrade.mutate(next.key)} data-testid="usage-banner-upgrade-btn">
                  {upgrade.isPending ? "Opening checkout" : next.label}
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="k-press" onClick={() => navigate("/billing")} data-testid="usage-banner-plans-btn">See plans</Button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => { sessionStorage.setItem("kozzi_usage_dismissed", sig); setHidden(sig); }} className="rounded p-1 text-[#B45309] hover:bg-[#FEF3C7]" data-testid="usage-banner-dismiss-btn">
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
