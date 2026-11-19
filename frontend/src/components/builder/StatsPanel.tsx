import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Mail, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { Stats } from "@/lib/types";

const KIND_LABEL = { builder: "From chat", notify: "Owner alert", receipt: "Confirmation" } as const;

export default function StatsPanel({ projectId, published }: { projectId: string; published: boolean }) {
  const stats = useQuery({
    queryKey: ["stats", projectId],
    queryFn: () => apiGet<Stats>(`/projects/${projectId}/stats`),
    refetchInterval: 15000,
  });
  const s = stats.data;

  if (stats.isLoading) return <div className="k-skeleton h-full rounded-xl" data-testid="stats-loading" />;
  if (!s) return <p className="p-6 text-sm text-[#666664]" data-testid="stats-error">Couldn't load activity. Try again in a moment.</p>;

  const figures = [
    { id: "views", label: "Live views", value: s.views_total, sub: `${s.views_today} today` },
    { id: "rows", label: "Rows stored", value: s.records_total, sub: `${s.tables_total} ${s.tables_total === 1 ? "table" : "tables"}` },
    { id: "emails", label: "Emails sent", value: s.emails_total, sub: "chat, alerts and confirmations" },
  ];
  const chart = s.days.map((d) => ({ ...d, label: format(parseISO(d.day), "MMM d") }));

  return (
    <div className="k-scroll h-full overflow-y-auto rounded-xl border border-[#E5E5E3] bg-white" data-testid="stats-panel">
      <div className="grid grid-cols-1 divide-y divide-[#E5E5E3] border-b border-[#E5E5E3] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {figures.map((f) => (
          <div key={f.id} className="px-5 py-4">
            <p className="text-xs text-[#666664]">{f.label}</p>
            <p className="mt-1 text-2xl font-medium tracking-tight tabular-nums" data-testid={`stats-${f.id}-value`}>{f.value.toLocaleString()}</p>
            <p className="mt-0.5 text-[11px] text-[#9A9A97]">{f.sub}</p>
          </div>
        ))}
      </div>
      <div className="px-5 pt-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Last 14 days</p>
          <div className="flex items-center gap-3 text-[11px] text-[#666664]">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#0F766E]" /> Views</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-[#111111]" /> New rows</span>
          </div>
        </div>
        {!published && <p className="mt-1 text-xs text-[#9A9A97]">Views are counted on the published link. Publish to start counting.</p>}
        <div className="mt-3 h-52" data-testid="stats-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chart} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid stroke="#F0F0EE" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9A9A97" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E5E5E3", fontSize: 12 }} />
              <Area type="monotone" dataKey="views" name="Views" stroke="#0F766E" fill="#0F766E" fillOpacity={0.08} strokeWidth={1.6} />
              <Area type="monotone" dataKey="records" name="New rows" stroke="#111111" fill="#111111" fillOpacity={0.04} strokeWidth={1.4} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="px-5 py-5">
        <p className="text-sm font-medium">Recent emails</p>
        {s.recent_emails.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-[#666664]" data-testid="stats-emails-empty">
            None yet. Ask Kozzi to email you a summary, or have your app call kozzi.email.notifyOwner() or kozzi.email.sendReceipt().
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-[#F0F0EE]" data-testid="stats-emails-list">
            {s.recent_emails.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-[13px]" data-testid={`stats-email-${e.id}`}>
                {e.ok ? <Mail className="size-3.5 shrink-0 text-[#0F766E]" /> : <X className="size-3.5 shrink-0 text-[#DC2626]" />}
                <span className="min-w-0 flex-1 truncate">{e.subject}</span>
                <span className="hidden truncate text-xs text-[#666664] sm:inline">{KIND_LABEL[e.kind]} to {e.to}</span>
                <span className="shrink-0 text-[11px] text-[#9A9A97]">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
