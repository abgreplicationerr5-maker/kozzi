import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { Message, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import PromptBox from "@/components/PromptBox";
import { LogoMark } from "@/components/Logo";

const SUGGESTIONS = ["Add a search bar", "Switch to a warm, earthy colour palette", "Add an export to CSV button", "Add a dashboard with summary stats"];

export default function ChatPanel({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const messages = useQuery({
    queryKey: ["messages", project.id],
    queryFn: () => apiGet<Message[]>(`/projects/${project.id}/messages`),
  });

  const send = useMutation({
    mutationFn: (content: string) => apiPost<Project>(`/projects/${project.id}/messages`, { content }),
    onSuccess: (p) => {
      setText("");
      qc.setQueryData(["project", project.id], p);
      qc.invalidateQueries({ queryKey: ["messages", project.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.data?.length, project.generating]);

  const list = messages.data ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="chat-panel">
      <div className="k-scroll flex-1 space-y-4 overflow-y-auto px-4 py-5" data-testid="chat-thread">
        {messages.isLoading && <div className="k-skeleton h-16 rounded-xl" />}
        {!messages.isLoading && list.length === 0 && !project.generating && (
          <div className="rounded-xl border border-dashed border-[#E5E5E3] p-5 text-sm text-[#666664]" data-testid="chat-empty">
            Describe the app you want. Be specific about the data it should keep and the screens it needs.
          </div>
        )}
        <AnimatePresence initial={false}>
          {list.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              data-testid={`chat-message-${m.role}`}
              className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}
            >
              {m.role === "assistant" && <LogoMark className="mt-0.5 size-5 shrink-0" />}
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user" ? "bg-[#F4F4F2] text-[#111111]" : "text-[#111111]",
                  m.error && "border border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]",
                )}
              >
                {m.error && <AlertCircle className="mb-1 size-3.5" />}
                {m.content}
                {m.version_number && (
                  <span className="mt-1.5 block font-mono text-[11px] text-[#9A9A97]">Saved as version {m.version_number}</span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {project.generating && (
          <div className="flex items-center gap-2.5 pl-0.5 text-sm text-[#666664]" data-testid="chat-generating-indicator">
            <span className="relative flex size-5 items-center justify-center">
              <span className="k-breathe absolute size-5 rounded-full bg-[#0F766E]/15" />
              <span className="k-breathe size-2 rounded-full bg-[#0F766E]" />
            </span>
            Kozzi is updating your app
            {project.gen_chars > 0 && <span className="font-mono text-[11px] text-[#9A9A97]">{Math.round(project.gen_chars / 100) / 10}k chars</span>}
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-[#E5E5E3] p-3">
        {!project.generating && project.html && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {SUGGESTIONS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                data-testid={`chat-suggestion-${i}`}
                className="k-press shrink-0 rounded-full border border-[#E5E5E3] px-2.5 py-1 text-[11px] text-[#666664] hover:border-[#111111]/30 hover:text-[#111111]"
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
          placeholder={project.html ? "Ask for a change…" : "Describe the app to build…"}
        />
      </div>
    </div>
  );
}
