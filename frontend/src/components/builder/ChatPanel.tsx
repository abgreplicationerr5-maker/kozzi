import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AlertCircle, Check, Database, Globe, History, Mail, PenLine, RotateCcw, Table2, Trash2, X } from "lucide-react";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { Message, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import PromptBox from "@/components/PromptBox";
import { LogoMark } from "@/components/Logo";

const SUGGESTIONS = [
  "Add 10 realistic test rows",
  "Email me a summary of the data",
  "Add a search bar",
  "Publish the latest version",
];

const PHASES: Record<string, string> = {
  planning: "Planning",
  working: "Running commands",
  building: "Updating your app",
};

const ACTION_ICONS: Record<string, typeof Database> = {
  create_table: Table2,
  add_rows: Database,
  update_rows: Database,
  delete_rows: Trash2,
  delete_table: Trash2,
  rename_project: PenLine,
  publish: Globe,
  unpublish: Globe,
  restore_version: History,
  send_email: Mail,
};

function ActionLine({ m }: { m: Message }) {
  const Icon = ACTION_ICONS[m.meta.action ?? ""] ?? Check;
  const ok = m.meta.ok !== false;
  return (
    <div
      className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[13px] leading-snug", ok ? "border-[#E5E5E3] bg-[#FBFBFA] text-[#111111]" : "border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]")}
      data-testid={`chat-action-${m.id}`}
    >
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", ok ? "text-[#0F766E]" : "text-[#DC2626]")} strokeWidth={1.8} />
      <span className="min-w-0 flex-1">{m.content}</span>
      {ok ? <Check className="mt-0.5 size-3.5 shrink-0 text-[#0F766E]" /> : <X className="mt-0.5 size-3.5 shrink-0" />}
    </div>
  );
}

export default function ChatPanel({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const messages = useQuery({
    queryKey: ["messages", project.id],
    queryFn: () => apiGet<Message[]>(`/projects/${project.id}/messages`),
    // While Kozzi works, poll so plan/command messages appear one by one.
    refetchInterval: project.generating ? 1500 : false,
  });

  const onStarted = (p: Project) => {
    qc.setQueryData(["project", project.id], p);
    qc.invalidateQueries({ queryKey: ["messages", project.id] });
  };
  const send = useMutation({
    mutationFn: (content: string) => apiPost<Project>(`/projects/${project.id}/messages`, { content }),
    onSuccess: (p) => {
      setText("");
      onStarted(p);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const retry = useMutation({
    mutationFn: () => apiPost<Project>(`/projects/${project.id}/retry`),
    onSuccess: onStarted,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const list = messages.data ?? [];
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [list.length, project.generating]);

  const last = list[list.length - 1];
  const canRetry = !project.generating && last?.kind === "error";
  const outOfCredits = !project.generating && project.gen_error === "AI credits exhausted";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="chat-panel">
      <div className="k-scroll flex-1 overflow-y-auto px-4 py-5" data-testid="chat-thread">
        {messages.isLoading && <div className="k-skeleton h-16 rounded-xl" />}
        {!messages.isLoading && list.length === 0 && !project.generating && (
          <div className="rounded-xl border border-dashed border-[#E5E5E3] p-5 text-sm leading-relaxed text-[#666664]" data-testid="chat-empty">
            Describe the app you want, the data it should keep and the screens it needs. You can also ask Kozzi to add rows, publish, or email you a summary.
          </div>
        )}
        <AnimatePresence initial={false}>
          {list.map((m, i) => {
            const prev = list[i - 1];
            const firstInRun = m.role === "assistant" && prev?.role !== "assistant";
            return (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                data-testid={`chat-message-${m.role}`}
                data-kind={m.kind}
                className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start", i > 0 && (firstInRun || m.role === "user" ? "mt-5" : "mt-2"))}
              >
                {m.role === "assistant" && (firstInRun ? <LogoMark className="mt-0.5 size-5 shrink-0" /> : <span className="w-5 shrink-0" />)}
                {m.kind === "action" ? (
                  <div className="min-w-0 max-w-[88%] flex-1"><ActionLine m={m} /></div>
                ) : (
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-xl text-sm leading-relaxed",
                      m.role === "user" ? "bg-[#F4F4F2] px-3.5 py-2.5 text-[#111111]" : "px-0.5 py-0.5 text-[#111111]",
                      m.kind === "error" && "border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[#991B1B]",
                    )}
                    data-testid={`chat-text-${m.id}`}
                  >
                    {m.kind === "error" && <AlertCircle className="mb-1 size-3.5" />}
                    {m.content}
                    {m.version_number && (
                      <span className="mt-1.5 block font-mono text-[11px] text-[#9A9A97]" data-testid={`chat-version-${m.id}`}>Saved as version {m.version_number}</span>
                    )}
                    {m.kind === "error" && canRetry && m.id === last?.id && (
                      <Button size="xs" variant="outline" className="k-press mt-2 border-[#FECACA] bg-white text-[#991B1B]" onClick={() => retry.mutate()} disabled={retry.isPending} data-testid="chat-retry-btn">
                        <RotateCcw className="size-3" /> Retry
                      </Button>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {project.generating && (
          <div className="mt-4 flex items-center gap-2.5 pl-0.5 text-sm text-[#666664]" data-testid="chat-generating-indicator">
            <span className="relative flex size-5 items-center justify-center">
              <span className="k-breathe absolute size-5 rounded-full bg-[#0F766E]/15" />
              <span className="k-breathe size-2 rounded-full bg-[#0F766E]" />
            </span>
            <span data-testid="chat-phase">{PHASES[project.gen_phase] ?? "Working"}</span>
            {project.gen_phase === "building" && project.gen_chars > 0 && (
              <span className="font-mono text-[11px] text-[#9A9A97]">{Math.round(project.gen_chars / 100) / 10}k chars</span>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-[#E5E5E3] p-3">
        {outOfCredits && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]" data-testid="chat-credits-banner">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="flex-1">The AI service ran out of credits. Your work is saved.</span>
            <button type="button" onClick={() => retry.mutate()} disabled={retry.isPending} className="font-medium underline-offset-2 hover:underline" data-testid="chat-credits-retry-btn">
              Retry
            </button>
          </div>
        )}
        {!project.generating && project.html && (
          <div className="k-scroll mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                data-testid={`chat-suggestion-${i}`}
                className="k-press shrink-0 rounded-md border border-[#E5E5E3] px-2.5 py-1 text-[11px] text-[#666664] transition-colors duration-150 hover:border-[#111111]/30 hover:text-[#111111]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <PromptBox
          value={text}
          onChange={setText}
          onSubmit={(t) => send.mutate(t)}
          pending={send.isPending || project.generating}
          size="md"
          testId="chat"
          placeholder={project.html ? "Ask for a change, data, publishing or an email" : "Describe the app to build"}
        />
      </div>
    </div>
  );
}
