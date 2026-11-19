import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { AlertCircle, Check, Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { apiDelete, apiPost, apiPut, errorMessage } from "@/lib/api";
import type { Project } from "@/lib/types";
import { copyText } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type ShareTab = "domain" | "embed";
const HEIGHTS = [600, 720, 900];

function CopyRow({ value, testId, mono = true }: { value: string; testId: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#E5E5E3] bg-[#FBFBFA] px-2.5 py-2">
      <span className={cn("min-w-0 flex-1 truncate text-xs", mono && "font-mono")} data-testid={`${testId}-value`}>{value}</span>
      <Button size="icon-xs" variant="ghost" aria-label="Copy" onClick={() => copyText(value, "Copied")} data-testid={`${testId}-copy-btn`}>
        <Copy className="size-3" />
      </Button>
    </div>
  );
}

function DomainTab({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [domain, setDomain] = useState(project.custom_domain);
  useEffect(() => setDomain(project.custom_domain), [project.custom_domain]);
  const target = `${window.location.origin}/app/${project.slug}`;
  const onDone = (p: Project) => {
    qc.setQueryData(["project", project.id], p);
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
  const save = useMutation({
    mutationFn: () => apiPut<Project>(`/projects/${project.id}/domain`, { domain }),
    onSuccess: (p) => {
      onDone(p);
      toast.success(`Saved ${p.custom_domain}. Set up forwarding, then check it.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const check = useMutation({
    mutationFn: () => apiPost<Project>(`/projects/${project.id}/domain/check`),
    onSuccess: (p) => {
      onDone(p);
      if (p.domain_status === "connected") toast.success(`${p.custom_domain} is connected`);
      else toast.error("Not forwarding yet");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete<Project>(`/projects/${project.id}/domain`),
    onSuccess: (p) => {
      onDone(p);
      setDomain("");
      toast.success("Domain removed");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const saved = project.custom_domain;
  const dirty = domain.trim().toLowerCase() !== saved;
  const isSub = saved.split(".").length > 2;

  return (
    <div className="space-y-5" data-testid="domain-tab">
      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (domain.trim()) save.mutate();
        }}
      >
        <Label htmlFor="domain-input">Your domain</Label>
        <div className="flex gap-2">
          <Input id="domain-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="app.yourcompany.com" className="font-mono text-sm" data-testid="domain-input" />
          <Button type="submit" className="k-press" disabled={!domain.trim() || !dirty || save.isPending} data-testid="domain-save-btn">
            {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
          </Button>
        </div>
      </form>

      {saved && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }} className="space-y-5">
          <div
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
              project.domain_status === "connected" ? "border-[#A7F3D0] bg-[#ECFDF5] text-[#065F46]"
                : project.domain_status === "failed" ? "border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]" : "border-[#E5E5E3] bg-[#FBFBFA] text-[#666664]",
            )}
            data-testid="domain-status"
            data-status={project.domain_status}
          >
            {project.domain_status === "connected" ? <Check className="mt-0.5 size-4 shrink-0" /> : project.domain_status === "failed" ? <AlertCircle className="mt-0.5 size-4 shrink-0" /> : <Globe className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {project.domain_status === "connected" ? "Connected" : project.domain_status === "failed" ? "Not forwarding yet" : "Waiting for forwarding"}
              </p>
              <p className="text-xs leading-relaxed opacity-90" data-testid="domain-status-detail">
                {project.domain_detail || "Follow the steps below, then press Check."}
                {project.domain_checked_at && ` Checked ${formatDistanceToNow(new Date(project.domain_checked_at), { addSuffix: true })}.`}
              </p>
            </div>
            <Button size="xs" variant="outline" className="k-press shrink-0 bg-white" onClick={() => check.mutate()} disabled={check.isPending} data-testid="domain-check-btn">
              <RefreshCw className={cn("size-3", check.isPending && "animate-spin")} /> Check
            </Button>
          </div>

          <ol className="space-y-4 text-sm" data-testid="domain-steps">
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#F4F4F2] text-[11px] font-medium">1</span>
              <div className="min-w-0 flex-1">
                <p>Sign in where you bought <span className="font-mono text-[13px]">{isSub ? saved.split(".").slice(1).join(".") : saved}</span> (GoDaddy, Namecheap, Cloudflare, Google Domains, and so on) and open its forwarding or redirect settings.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#F4F4F2] text-[11px] font-medium">2</span>
              <div className="min-w-0 flex-1 space-y-2">
                <p>Forward <span className="font-mono text-[13px]">{saved}</span> to this address. Choose permanent (301). Pick masked forwarding if you want your domain to stay in the address bar.</p>
                <CopyRow value={target} testId="domain-target" />
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#F4F4F2] text-[11px] font-medium">3</span>
              <p className="min-w-0 flex-1">Wait a few minutes for it to take effect, then press Check. Changes can take up to an hour to spread.</p>
            </li>
          </ol>

          <button type="button" onClick={() => remove.mutate()} disabled={remove.isPending} className="inline-flex items-center gap-1.5 text-xs text-[#666664] transition-colors duration-150 hover:text-[#DC2626]" data-testid="domain-remove-btn">
            <Trash2 className="size-3" /> Remove domain
          </button>
        </motion.div>
      )}
    </div>
  );
}

function EmbedTab({ project }: { project: Project }) {
  const [height, setHeight] = useState(720);
  const url = `${window.location.origin}/app/${project.slug}`;
  const title = project.title.replace(/"/g, "&quot;");
  const snippet = `<iframe src="${url}" title="${title}" style="width:100%;height:${height}px;border:0;border-radius:12px" loading="lazy" allow="clipboard-write"></iframe>`;
  return (
    <div className="space-y-4" data-testid="embed-tab">
      <p className="text-sm text-[#666664]">Paste this into any page on your site, such as a Webflow, Wix, WordPress or Squarespace HTML block. It shows the live app with its live data.</p>
      <div className="space-y-1.5">
        <Label>Height</Label>
        <div className="flex rounded-lg border border-[#E5E5E3] bg-white p-0.5" role="radiogroup">
          {HEIGHTS.map((h) => (
            <button
              key={h}
              type="button"
              role="radio"
              aria-checked={height === h}
              onClick={() => setHeight(h)}
              data-testid={`embed-height-${h}`}
              className={cn("k-press flex-1 rounded-md py-1.5 text-xs transition-colors duration-150", height === h ? "bg-[#F4F4F2] font-medium text-[#111111]" : "text-[#666664] hover:text-[#111111]")}
            >
              {h}px
            </button>
          ))}
        </div>
      </div>
      <pre className="k-scroll max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-[#E5E5E3] bg-[#FBFBFA] p-3 font-mono text-[11px] leading-relaxed text-[#333331]" data-testid="embed-snippet">{snippet}</pre>
      <Button className="k-press w-full" onClick={() => copyText(snippet, "Embed code copied")} data-testid="embed-copy-btn">
        <Copy className="size-3.5" /> Copy embed code
      </Button>
    </div>
  );
}

export default function ShareDialog({ project, open, onOpenChange, initialTab }: {
  project: Project; open: boolean; onOpenChange: (o: boolean) => void; initialTab: ShareTab;
}) {
  const [tab, setTab] = useState<ShareTab>(initialTab);
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto bg-white sm:max-w-lg" data-testid="share-dialog">
        <DialogHeader>
          <DialogTitle>Put {project.title} on your site</DialogTitle>
          <DialogDescription>Use your own domain, or embed the app in a page you already have.</DialogDescription>
        </DialogHeader>
        <div className="relative flex rounded-lg border border-[#E5E5E3] p-0.5" role="tablist">
          {([{ id: "domain", label: "Your domain" }, { id: "embed", label: "Embed code" }] as const).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              data-testid={`share-tab-${id}`}
              className={cn("relative flex-1 rounded-md py-1.5 text-xs transition-colors duration-150", tab === id ? "text-[#111111]" : "text-[#666664] hover:text-[#111111]")}
            >
              {tab === id && <motion.span layoutId="share-tab" className="absolute inset-0 rounded-md bg-[#F4F4F2]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        {tab === "domain" ? <DomainTab project={project} /> : <EmbedTab project={project} />}
      </DialogContent>
    </Dialog>
  );
}
