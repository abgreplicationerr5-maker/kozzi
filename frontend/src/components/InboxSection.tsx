import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, Copy, Inbox as InboxIcon, Mail, RefreshCw, Send, X } from "lucide-react";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { FlushOut, Inbox, InboxEmail } from "@/lib/types";
import { copyText } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

const KIND = { builder: "From the chat", notify: "App alert", receipt: "Confirmation to a visitor" } as const;
const STATUS = {
  sent: { label: "Delivered", icon: Mail, tone: "text-[#0F766E]" },
  queued: { label: "Waiting to send", icon: Clock, tone: "text-[#B45309]" },
  failed: { label: "Failed", icon: X, tone: "text-[#DC2626]" },
  sent_manually: { label: "Sent by you", icon: Check, tone: "text-[#0F766E]" },
} as const;

function mailto(e: InboxEmail) {
  const body = e.text.length > 1500 ? `${e.text.slice(0, 1500)}\n...` : e.text;
  return `mailto:${encodeURIComponent(e.to)}?subject=${encodeURIComponent(e.subject)}&body=${encodeURIComponent(body)}`;
}

function Detail({ e, onBack }: { e: InboxEmail; onBack: () => void }) {
  const qc = useQueryClient();
  const s = STATUS[e.status];
  const markSent = useMutation({
    mutationFn: () => apiPost(`/inbox/${e.id}/mark-sent`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Marked as sent");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const pending = e.status === "queued" || e.status === "failed";
  return (
    <motion.div key={e.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }} className="flex min-h-0 flex-col" data-testid="inbox-detail">
      <div className="border-b border-[#E5E5E3] px-5 py-4">
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs text-[#666664] hover:text-[#111111] lg:hidden" data-testid="inbox-back-btn">
          <ArrowLeft className="size-3" /> All emails
        </button>
        <h3 className="text-base font-medium tracking-tight" data-testid="inbox-detail-subject">{e.subject}</h3>
        <p className="mt-1 text-xs text-[#666664]">
          To <span className="font-mono" data-testid="inbox-detail-to">{e.to}</span> · {KIND[e.kind]} · {e.project_title} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
        </p>
        <p className={cn("mt-2 inline-flex items-center gap-1.5 text-xs font-medium", s.tone)} data-testid="inbox-detail-status">
          <s.icon className="size-3.5" /> {s.label}
        </p>
        {pending && (
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={mailto(e)} className={cn(buttonVariants({ size: "sm" }), "k-press")} data-testid="inbox-send-myself-btn">
              <Send className="size-3.5" /> Send from my email app
            </a>
            <Button size="sm" variant="outline" className="k-press" onClick={() => markSent.mutate()} disabled={markSent.isPending} data-testid="inbox-mark-sent-btn">
              <Check className="size-3.5" /> I sent it
            </Button>
            <Button size="sm" variant="ghost" className="k-press" onClick={() => copyText(e.text, "Email text copied")} data-testid="inbox-copy-text-btn">
              <Copy className="size-3.5" /> Copy text
            </Button>
          </div>
        )}
      </div>
      <div className="k-scroll min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-[#111111]" data-testid="inbox-detail-body">
        {e.text || <span className="text-[#9A9A97]">This older email was logged before the Inbox kept full text.</span>}
      </div>
    </motion.div>
  );
}

export default function InboxSection() {
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ["inbox"], queryFn: () => apiGet<Inbox>("/inbox"), refetchInterval: 30000 });
  const [selected, setSelected] = useState<string | null>(null);
  const list = useMemo(() => inbox.data?.emails ?? [], [inbox.data]);
  const current = list.find((e) => e.id === selected) ?? null;

  useEffect(() => {
    if (!selected && list.length && window.matchMedia("(min-width: 1024px)").matches) setSelected(list[0].id);
  }, [list, selected]);

  const read = useMutation({
    mutationFn: (id: string) => apiPost(`/inbox/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
  });
  useEffect(() => {
    if (current && !current.read) read.mutate(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const readAll = useMutation({
    mutationFn: () => apiPost("/inbox/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const flush = useMutation({
    mutationFn: () => apiPost<FlushOut>("/inbox/flush"),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      if (r.sent) toast.success(`Sent ${r.sent} ${r.sent === 1 ? "email" : "emails"}`);
      else toast.error("Delivery is still paused. They stay queued.");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const d = inbox.data;
  return (
    <section className="mt-12" data-testid="inbox-section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-medium tracking-tight">Inbox</h2>
          <p className="mt-1 text-sm text-[#666664]">Every email Kozzi or your apps wrote, with its delivery status.</p>
        </div>
        <div className="flex gap-2">
          {!!d?.queued && (
            <Button size="sm" variant="outline" className="k-press" onClick={() => flush.mutate()} disabled={flush.isPending} data-testid="inbox-flush-btn">
              <RefreshCw className={cn("size-3.5", flush.isPending && "animate-spin")} /> Try sending now
            </Button>
          )}
          {!!d?.unread && (
            <Button size="sm" variant="ghost" className="k-press" onClick={() => readAll.mutate()} disabled={readAll.isPending} data-testid="inbox-read-all-btn">
              <CheckCheck className="size-3.5" /> Mark all read
            </Button>
          )}
        </div>
      </div>

      {!!d?.queued && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E]" data-testid="inbox-paused-banner">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{d.queued} {d.queued === 1 ? "email is" : "emails are"} waiting to send</p>
            <p className="mt-0.5 text-xs leading-relaxed">
              {(d.paused_reason || "Delivery is paused").replace(/\.?$/, ".")} Nothing is lost: Kozzi retries every 15 minutes, or you can open any of them below and send it from your own email app.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5">
        {inbox.isLoading && <div className="k-skeleton h-64 rounded-xl" />}
        {inbox.isError && <p className="text-sm text-[#666664]" data-testid="inbox-error">Couldn't load the Inbox. Refresh to retry.</p>}
        {d && list.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[#E5E5E3] bg-white p-10 text-center" data-testid="inbox-empty">
            <InboxIcon className="size-5 text-[#9A9A97]" strokeWidth={1.6} />
            <p className="text-sm text-[#666664]">No emails yet. Ask Kozzi in any project to email you a summary, or build an app that sends confirmations.</p>
          </div>
        )}
        {list.length > 0 && (
          <div className="grid overflow-hidden rounded-xl border border-[#E5E5E3] bg-white lg:h-[560px] lg:grid-cols-[340px_1fr]">
            <ul className={cn("k-scroll divide-y divide-[#F0F0EE] overflow-y-auto lg:border-r lg:border-[#E5E5E3]", current && "hidden lg:block")} data-testid="inbox-list">
              <AnimatePresence initial={false}>
                {list.map((e) => {
                  const s = STATUS[e.status];
                  const unread = !e.read && e.kind !== "receipt";
                  return (
                    <motion.li key={e.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <button
                        type="button"
                        onClick={() => setSelected(e.id)}
                        data-testid={`inbox-item-${e.id}`}
                        className={cn("flex w-full gap-3 px-4 py-3 text-left transition-colors duration-150", selected === e.id ? "bg-[#F4F4F2]" : "hover:bg-[#FBFBFA]")}
                      >
                        <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", unread ? "bg-[#0F766E]" : "bg-transparent")} />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", unread ? "font-medium text-[#111111]" : "text-[#333331]")}>{e.subject}</span>
                          <span className="mt-0.5 block truncate text-xs text-[#9A9A97]">{e.project_title} · to {e.to}</span>
                          <span className={cn("mt-1 inline-flex items-center gap-1 text-[11px]", s.tone)} data-testid={`inbox-item-status-${e.id}`}>
                            <s.icon className="size-3" /> {s.label} · {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                          </span>
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
            {current ? (
              <Detail e={current} onBack={() => setSelected(null)} />
            ) : (
              <div className="hidden items-center justify-center text-sm text-[#9A9A97] lg:flex">Pick an email to read it</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
