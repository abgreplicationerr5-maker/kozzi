import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { apiGet, apiPatch } from "@/lib/api";
import type { AdminPayment, AdminUsers, Enquiry, EnquiryStatus, Me } from "@/lib/types";
import { notifyError } from "@/lib/notify";
import { cn } from "@/lib/utils";
import PageShell from "@/components/PageShell";

type Tab = "enquiries" | "payments" | "users";
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

export default function AdminPage() {
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const [tab, setTab] = useState<Tab>("enquiries");
  if (me.data && me.data.role !== "admin") return <Navigate to="/dashboard" replace />;
  return (
    <PageShell title="Admin" sub="Enterprise enquiries, every checkout, and everyone's role and plan.">
      <div className="mb-6 inline-flex rounded-lg border border-[#E5E5E3] bg-white p-0.5" role="tablist">
        {(["enquiries", "payments", "users"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} data-testid={`admin-tab-${t}`}
            className={cn("rounded-md px-3 py-1.5 text-xs capitalize transition-colors duration-150", tab === t ? "bg-[#F4F4F2] font-medium text-[#111111]" : "text-[#666664] hover:text-[#111111]")}>
            {t}
          </button>
        ))}
      </div>
      {me.isLoading ? <div className="k-skeleton h-40 rounded-xl" /> : tab === "enquiries" ? <Enquiries /> : tab === "payments" ? <Payments /> : <Users />}
    </PageShell>
  );
}
