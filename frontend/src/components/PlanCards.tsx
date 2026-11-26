import { Check } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type Interval = "month" | "year";

export const PLAN_COPY = [
  { id: "free", name: "Free", monthly: 0, yearly: 0, features: ["3 projects", "1 live app", "Live database for every app", "Version history and a 30-day Bin", "10 app emails a day"] },
  { id: "pro", name: "Pro", monthly: 20, yearly: 200, features: ["Unlimited projects", "20 live apps", "Your own domains", "No Kozzi badge on live apps", "100 app emails a day"] },
  { id: "team", name: "Team", monthly: 50, yearly: 500, features: ["Everything in Pro", "5 seats: invite 4 teammates", "Shared projects", "100 live apps", "300 app emails a day"] },
  { id: "enterprise", name: "Enterprise", monthly: null, yearly: null, features: ["50 seats", "Unlimited live apps", "1,000 app emails a day", "Plan set up by our team", "Invoiced billing"] },
] as const;

export function IntervalToggle({ value, onChange }: { value: Interval; onChange: (v: Interval) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-[#E5E5E3] bg-white p-0.5" role="radiogroup" data-testid="interval-toggle">
      {(["month", "year"] as const).map((i) => (
        <button key={i} type="button" role="radio" aria-checked={value === i} onClick={() => onChange(i)} data-testid={`interval-${i}`}
          className={cn("relative rounded-md px-3 py-1.5 text-xs transition-colors duration-150", value === i ? "text-[#111111]" : "text-[#666664] hover:text-[#111111]")}>
          {value === i && <motion.span layoutId="interval-pill" className="absolute inset-0 rounded-md bg-[#F4F4F2]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
          <span className="relative">{i === "month" ? "Monthly" : "Yearly, 2 months free"}</span>
        </button>
      ))}
    </div>
  );
}

export default function PlanCards({ interval, current, onSelect, pending }: {
  interval: Interval; current?: string; onSelect: (plan: string) => void; pending?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLAN_COPY.map((p) => {
        const price = interval === "month" ? p.monthly : p.yearly;
        const isCurrent = current === p.id;
        const featured = p.id === "pro";
        const label = isCurrent ? "Current plan" : p.id === "enterprise" ? "Talk to us" : p.id === "free" ? (current ? "Included" : "Start free") : `Choose ${p.name}`;
        return (
          <div key={p.id} data-testid={`plan-card-${p.id}`} className={cn("k-card flex flex-col rounded-xl border bg-white p-5", featured ? "border-[#111111]" : "border-[#E5E5E3]")}>
            <h3 className="text-base font-medium">{p.name}</h3>
            <p className="mt-3 text-3xl font-medium tracking-tight" data-testid={`plan-price-${p.id}`}>
              {price === null ? "Custom" : `$${price}`}
              {price !== null && price > 0 && <span className="ml-1 text-sm font-normal text-[#666664]">/{interval === "month" ? "month" : "year"}</span>}
            </p>
            {interval === "year" && p.monthly ? <p className="mt-1 text-xs text-[#0F766E]">Save ${p.monthly * 12 - (p.yearly ?? 0)} a year</p> : <p className="mt-1 text-xs text-transparent">.</p>}
            <ul className="mt-5 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#0F766E]" /> {f}</li>
              ))}
            </ul>
            <Button
              className="k-press mt-6 w-full"
              variant={featured && !isCurrent ? "default" : "outline"}
              disabled={isCurrent || (p.id === "free" && !!current) || pending === p.id}
              onClick={() => onSelect(p.id)}
              data-testid={`plan-cta-${p.id}`}
            >
              {pending === p.id ? "Opening checkout" : label}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
