import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminPayment, AdminUsers, Coupon, Enquiry, EnquiryStatus, Me } from "@/lib/types";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import PageShell from "@/components/PageShell";

type Tab = "enquiries" | "payments" | "users" | "coupons";
const STATUSES: EnquiryStatus[] = ["new", "contacted", "won", "closed"];
const PLAN_OPTIONS = ["free", "pro", "team", "enterprise"] as const;
const sel = "h-8 rounded-md border border-[#E5E5E3] bg-white px-2 text-xs";

function Enquiries() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "enquiries"], queryFn: () => apiGet<Enquiry[]>("/admin/enquiries") });
  const upd = useMutation({
    mutationFn: ({ id, status }: { id: string; status: EnquiryStatus }) => apiPatch<Enquiry>(`/admin/enquiries/${id}`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "enquiries"] }); toast.success("Updated"); },
    onError: notifyError,
  });
  if (q.isLoading) return <div className="k-skeleton h-40 rounded-xl" />;
  if (!q.data?.length) return <p className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-8 text-center text-sm text-[#666664]" data-testid="admin-enquiries-empty">No Enterprise enquiries yet.</p>;
  return (
    <ul className="space-y-3" data-testid="admin-enquiries">
      {q.data.map((e) => (
        <li key={e.id} className="rounded-xl border border-[#E5E5E3] bg-white p-5" data-testid={`admin-enquiry-${e.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{e.company} <span className="font-normal text-[#666664]">· {e.team_size} people</span></p>
              <p className="text-xs text-[#666664]">{e.name} · <a href={`mailto:${e.email}`} className="text-[#0F766E] hover:underline">{e.email}</a> · {format(new Date(e.created_at), "MMM d, yyyy HH:mm")}</p>
            </div>
            <select className={sel} value={e.status} onChange={(ev) => upd.mutate({ id: e.id, status: ev.target.value as EnquiryStatus })} data-testid={`admin-enquiry-status-${e.id}`}>
              {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
          {e.message && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{e.message}</p>}
        </li>
      ))}
    </ul>
  );
}

function Payments() {
  const q = useQuery({ queryKey: ["admin", "payments"], queryFn: () => apiGet<AdminPayment[]>("/admin/payments") });
  if (q.isLoading) return <div className="k-skeleton h-40 rounded-xl" />;
  const rows = q.data ?? [];
  const paid = rows.filter((r) => r.payment_status === "paid");
  const total = paid.reduce((s, r) => s + r.amount, 0);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#666664]" data-testid="admin-payments-summary">{paid.length} paid checkouts · ${total.toLocaleString()} collected in total (test mode)</p>
      {rows.length === 0 ? <p className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-8 text-center text-sm text-[#666664]" data-testid="admin-payments-empty">No checkouts yet.</p> : (
        <div className="overflow-x-auto rounded-xl border border-[#E5E5E3] bg-white">
          <table className="w-full text-sm" data-testid="admin-payments">
            <thead className="border-b border-[#E5E5E3] bg-[#FBFBFA] text-left text-xs text-[#666664]">
              <tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Customer</th><th className="px-4 py-2 font-medium">Plan</th><th className="px-4 py-2 font-medium">Amount</th><th className="px-4 py-2 font-medium">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-[#F0F0EE]">
              {rows.map((r) => (
                <tr key={r.session_id} data-testid={`admin-payment-${r.session_id}`}>
                  <td className="px-4 py-2.5">{format(new Date(r.created_at), "MMM d, HH:mm")}</td>
                  <td className="px-4 py-2.5">{r.email || r.user_id}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{r.lookup_key}</td>
                  <td className="px-4 py-2.5 tabular-nums">${r.amount}</td>
                  <td className={cn("px-4 py-2.5", r.payment_status === "paid" ? "text-[#0F766E]" : "text-[#666664]")}>{r.payment_status === "paid" ? "Paid" : r.payment_status === "pending" ? "Not completed" : r.payment_status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Users() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "users"], queryFn: () => apiGet<AdminUsers>("/users") });
  const done = () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("Saved"); };
  const role = useMutation({ mutationFn: ({ id, role }: { id: string; role: string }) => apiPatch(`/users/${id}/role`, { role }), onSuccess: done, onError: notifyError });
  const plan = useMutation({ mutationFn: ({ id, plan }: { id: string; plan: string }) => apiPatch(`/admin/users/${id}/plan`, { plan }), onSuccess: done, onError: notifyError });
  if (q.isLoading) return <div className="k-skeleton h-40 rounded-xl" />;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E5E5E3] bg-white">
      <table className="w-full text-sm" data-testid="admin-users">
        <thead className="border-b border-[#E5E5E3] bg-[#FBFBFA] text-left text-xs text-[#666664]">
          <tr><th className="px-4 py-2 font-medium">Person</th><th className="px-4 py-2 font-medium">Projects</th><th className="px-4 py-2 font-medium">Role</th><th className="px-4 py-2 font-medium">Plan</th></tr>
        </thead>
        <tbody className="divide-y divide-[#F0F0EE]">
          {q.data?.users.map((u) => (
            <tr key={u.user_id} data-testid={`admin-user-${u.user_id}`}>
              <td className="px-4 py-2.5"><p>{u.display_name || u.username || "No name"}</p><p className="text-xs text-[#9A9A97]">{u.email}</p></td>
              <td className="px-4 py-2.5 tabular-nums">{u.projects}</td>
              <td className="px-4 py-2.5">
                <select className={sel} value={u.role} onChange={(e) => role.mutate({ id: u.user_id, role: e.target.value })} data-testid={`admin-user-role-${u.user_id}`}>
                  {q.data.roles.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
                </select>
              </td>
              <td className="px-4 py-2.5">
                <select className={sel} value={u.plan} onChange={(e) => plan.mutate({ id: u.user_id, plan: e.target.value })} data-testid={`admin-user-plan-${u.user_id}`}>
                  {PLAN_OPTIONS.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
                </select>
                {u.plan_source === "stripe" && u.plan !== "free" && <span className="ml-2 text-[11px] text-[#9A9A97]">paid by card</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function couponText(c: Coupon) {
  const off = c.percent_off ? `${c.percent_off}% off` : `$${c.amount_off} off`;
  const when = c.duration === "once" ? "the first payment" : c.duration === "forever" ? "every payment" : `${c.duration_in_months} months`;
  return `${off} ${c.duration === "repeating" ? "for" : ""} ${when}`.replace("  ", " ");
}

function Coupons() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "coupons"], queryFn: () => apiGet<Coupon[]>("/admin/coupons") });
  const empty = { code: "", kind: "percent" as "percent" | "amount", value: "", duration: "once", months: "3", max: "", days: "" };
  const [f, setF] = useState(empty);
  const create = useMutation({
    mutationFn: () => apiPost<Coupon>("/admin/coupons", {
      code: f.code.trim(),
      ...(f.kind === "percent" ? { percent_off: Number(f.value) } : { amount_off: Number(f.value) }),
      duration: f.duration,
      ...(f.duration === "repeating" ? { duration_in_months: Number(f.months) } : {}),
      ...(f.max ? { max_redemptions: Number(f.max) } : {}),
      ...(f.days ? { expires_in_days: Number(f.days) } : {}),
    }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["admin", "coupons"] }); setF(empty); toast.success(`${c.code} is ready to use`); },
    onError: notifyError,
  });
  const toggle = useMutation({
    mutationFn: (c: Coupon) => apiPatch<Coupon>(`/admin/coupons/${c.id}`, { active: !c.active }),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["admin", "coupons"] }); toast.success(c.active ? `${c.code} turned on` : `${c.code} turned off`); },
    onError: notifyError,
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form className="space-y-3 rounded-xl border border-[#E5E5E3] bg-white p-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }} data-testid="coupon-form">
        <p className="text-sm font-medium">New code</p>
        <p className="text-xs text-[#666664]">Customers type it on the Stripe checkout page.</p>
        <div className="space-y-1.5"><Label htmlFor="c-code">Code</Label><Input id="c-code" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="LAUNCH25" className="font-mono" data-testid="coupon-code-input" /></div>
        <div className="grid grid-cols-[1fr_110px] gap-2">
          <div className="space-y-1.5"><Label htmlFor="c-value">Discount</Label><Input id="c-value" required type="number" min="1" max={f.kind === "percent" ? 100 : 10000} step="any" value={f.value} onChange={set("value")} data-testid="coupon-value-input" /></div>
          <div className="space-y-1.5"><Label>Type</Label><select className={`${sel} h-9 w-full`} value={f.kind} onChange={set("kind")} data-testid="coupon-kind-select"><option value="percent">% off</option><option value="amount">$ off</option></select></div>
        </div>
        <div className="grid grid-cols-[1fr_90px] gap-2">
          <div className="space-y-1.5"><Label>Applies to</Label>
            <select className={`${sel} h-9 w-full`} value={f.duration} onChange={set("duration")} data-testid="coupon-duration-select">
              <option value="once">First payment</option><option value="repeating">Several months</option><option value="forever">Every payment</option>
            </select>
          </div>
          {f.duration === "repeating" && <div className="space-y-1.5"><Label htmlFor="c-months">Months</Label><Input id="c-months" type="number" min="1" max="36" value={f.months} onChange={set("months")} data-testid="coupon-months-input" /></div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label htmlFor="c-max">Max uses <span className="font-normal text-[#9A9A97]">(optional)</span></Label><Input id="c-max" type="number" min="1" value={f.max} onChange={set("max")} data-testid="coupon-max-input" /></div>
          <div className="space-y-1.5"><Label htmlFor="c-days">Expires in days <span className="font-normal text-[#9A9A97]">(optional)</span></Label><Input id="c-days" type="number" min="1" max="730" value={f.days} onChange={set("days")} data-testid="coupon-days-input" /></div>
        </div>
        <Button type="submit" className="k-press w-full" disabled={create.isPending} data-testid="coupon-create-btn">{create.isPending ? "Creating" : "Create code"}</Button>
      </form>
      <div>
        {q.isLoading ? <div className="k-skeleton h-40 rounded-xl" /> : !q.data?.length ? (
          <p className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-8 text-center text-sm text-[#666664]" data-testid="coupons-empty">No codes yet.</p>
        ) : (
          <ul className="divide-y divide-[#F0F0EE] rounded-xl border border-[#E5E5E3] bg-white" data-testid="coupons-list">
            {q.data.map((c) => (
              <li key={c.id} className="flex items-center gap-4 px-5 py-3" data-testid={`coupon-${c.code}`}>
                <div className="min-w-0 flex-1">
                  <p className={cn("font-mono text-sm", !c.active && "text-[#9A9A97] line-through")}>{c.code}</p>
                  <p className="text-xs text-[#666664]">
                    {couponText(c)} · used {c.times_redeemed}{c.max_redemptions ? ` of ${c.max_redemptions}` : ""} times
                    {c.expires_at && ` · expires ${format(new Date(c.expires_at), "MMM d, yyyy")}`}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="k-press" onClick={() => toggle.mutate(c)} disabled={toggle.isPending} data-testid={`coupon-toggle-${c.code}`}>
                  {c.active ? "Turn off" : "Turn on"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const [tab, setTab] = useState<Tab>("enquiries");
  if (me.data && me.data.role !== "admin") return <Navigate to="/dashboard" replace />;
  return (
    <PageShell title="Admin" sub="Enterprise enquiries, every checkout, everyone's role and plan, and discount codes.">
      <div className="mb-6 inline-flex rounded-lg border border-[#E5E5E3] bg-white p-0.5" role="tablist">
        {(["enquiries", "payments", "users", "coupons"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`admin-tab-${t}`}
            className={cn("rounded-md px-3 py-1.5 text-xs capitalize transition-colors duration-150", tab === t ? "bg-[#F4F4F2] font-medium text-[#111111]" : "text-[#666664] hover:text-[#111111]")}>
            {t}
          </button>
        ))}
      </div>
      {me.isLoading ? <div className="k-skeleton h-40 rounded-xl" /> : tab === "enquiries" ? <Enquiries /> : tab === "payments" ? <Payments /> : tab === "users" ? <Users /> : <Coupons />}
    </PageShell>
  );
}
