import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  Activity, ArrowLeft, Check, Code2, Command, Database, ExternalLink, Eye, Loader2, MessageSquare, Monitor, Redo2, RotateCw, Smartphone, Tablet, Undo2, X,
} from "lucide-react";
import { ApiError, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import type { Device, Me, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import AppFrame from "@/components/AppFrame";
import ChatPanel from "@/components/builder/ChatPanel";
import DataEditor from "@/components/builder/DataEditor";
import CodeViewer from "@/components/builder/CodeViewer";
import PublishPopover from "@/components/builder/PublishPopover";
import VersionMenu from "@/components/builder/VersionMenu";
import StatsPanel from "@/components/builder/StatsPanel";
import { openCommandMenu } from "@/components/CommandMenu";
import { notifyError } from "@/lib/notify";

type Tab = "preview" | "data" | "code" | "activity";
const WIDTHS: Record<Device, string> = { desktop: "100%", tablet: "768px", phone: "375px" };

function TitleField({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(project.title);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focused.current) setValue(project.title);
  }, [project.title]);

  const save = useMutation({
    mutationFn: (title: string) => apiPatch<Project>(`/projects/${project.id}`, { title }),
    onSuccess: (p) => {
      qc.setQueryData<Project>(["project", project.id], (old) => (old ? { ...old, title: p.title, updated_at: p.updated_at } : p));
      qc.invalidateQueries({ queryKey: ["projects"] });
      setState("saved");
    },
    onError: (e) => {
      setState("idle");
      notifyError(e);
    },
  });

  const onChange = (v: string) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) return;
    setState("saving");
    timer.current = setTimeout(() => save.mutate(v.trim()), 700);
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (!value.trim()) setValue(project.title);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        maxLength={120}
        aria-label="Project title"
        data-testid="builder-title-input"
        className="min-w-0 max-w-[140px] truncate rounded-md bg-transparent px-1.5 py-1 text-sm font-medium outline-none transition-colors duration-150 hover:bg-[#F4F4F2] focus:bg-[#F4F4F2] sm:max-w-[260px]"
      />
      <span className="hidden items-center gap-1 whitespace-nowrap font-mono text-[11px] text-[#9A9A97] md:inline-flex" data-testid="builder-save-indicator">
        {project.generating ? (
          <><span className="k-breathe size-1.5 rounded-full bg-[#0F766E]" /> Building</>
        ) : state === "saving" ? (
          <><Loader2 className="size-3 animate-spin" /> Saving</>
        ) : (
          <><Check className="size-3 text-[#0F766E]" /> Saved</>
        )}
      </span>
    </div>
  );
}

export default function Builder() {
  const { projectId = "" } = useParams();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("preview");
  const [device, setDevice] = useState<Device | null>(null);
  const [mobilePane, setMobilePane] = useState<"chat" | "canvas">("chat");
  const [frameKey, setFrameKey] = useState(0);
  const [appError, setAppError] = useState<string | null>(null);

  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => apiGet<Project>(`/projects/${projectId}`),
    refetchInterval: (q) => (q.state.data?.generating ? 1500 : false),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const p = project.data;
  const activeDevice: Device = device ?? me.data?.preferences.default_device ?? "desktop";

  // When a generation finishes, refresh everything that depends on it.
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (!p) return;
    if (wasGenerating.current && !p.generating) {
      qc.invalidateQueries({ queryKey: ["messages", projectId] });
      qc.invalidateQueries({ queryKey: ["versions", projectId] });
      qc.invalidateQueries({ queryKey: ["tables", projectId] });
      qc.invalidateQueries({ queryKey: ["records", projectId] });
      qc.invalidateQueries({ queryKey: ["stats", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      if (p.gen_error) toast.error("Kozzi stopped before finishing. You can retry from the chat.");
      else {
        toast.success("Done");
        setMobilePane("canvas");
      }
      setAppError(null);
    }
    wasGenerating.current = p.generating;
  }, [p, projectId, qc]);

  const step = useMutation({
    mutationFn: (dir: "undo" | "redo") => apiPost<Project>(`/projects/${projectId}/${dir}`),
    onSuccess: (data) => {
      qc.setQueryData(["project", projectId], data);
      setAppError(null);
    },
    onError: (e) => notifyError(e),
  });

  const onWrite = () => {
    qc.invalidateQueries({ queryKey: ["tables", projectId] });
    qc.invalidateQueries({ queryKey: ["records", projectId] });
  };

  if (project.isError && project.error instanceof ApiError && project.error.status === 404)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#F9F9F8] p-6 text-center" data-testid="builder-not-found">
        <p className="text-lg font-medium">Project not found</p>
        <p className="text-sm text-[#666664]">It may have been deleted, or it belongs to another account.</p>
        <Link to="/dashboard" className={cn(buttonVariants(), "k-press mt-2")} data-testid="builder-back-dashboard-link">Back to dashboard</Link>
      </div>
    );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#F9F9F8]" data-testid="builder-page">
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[#E5E5E3] bg-white px-2 sm:px-3">
        <div className="flex min-w-0 items-center gap-1">
          <Link to="/dashboard" aria-label="Back to dashboard" data-testid="builder-back-btn" className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "k-press")}>
            <ArrowLeft className="size-4" />
          </Link>
          <LogoMark className="mx-1 hidden size-5 sm:inline-flex" />
          {p ? (p.access === "viewer" ? <span className="truncate text-sm font-medium" data-testid="builder-title-readonly">{p.title}</span> : <TitleField project={p} />) : <div className="k-skeleton h-6 w-40 rounded-md" />}
          {p && p.access !== "owner" && (
            <span className="ml-2 hidden shrink-0 text-[11px] text-[#666664] md:inline" data-testid="builder-access-label">
              {p.access === "viewer" ? "View only" : p.access === "editor" ? "Can edit" : "Can publish"}
            </span>
          )}
        </div>
        {p && (
          <div className="flex items-center gap-0.5 sm:gap-1">
            <button
              type="button"
              onClick={openCommandMenu}
              aria-label="Open command menu"
              data-testid="builder-command-menu-btn"
              className="k-press mr-1 hidden items-center gap-1 rounded-md border border-[#E5E5E3] px-1.5 py-1 text-[11px] text-[#9A9A97] transition-colors duration-150 hover:text-[#111111] xl:inline-flex"
            >
              <Command className="size-3" /> K
            </button>
            {p.access !== "viewer" && <>
            <Button variant="ghost" size="icon-sm" className="k-press" aria-label="Undo" data-testid="builder-undo-btn" disabled={!p.can_undo || step.isPending || p.generating} onClick={() => step.mutate("undo")}>
              <Undo2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" className="k-press" aria-label="Redo" data-testid="builder-redo-btn" disabled={!p.can_redo || step.isPending || p.generating} onClick={() => step.mutate("redo")}>
              <Redo2 className="size-4" />
            </Button>
            <VersionMenu project={p} />
            </>}
            {p.published && (
              <a href={`/app/${p.slug}`} target="_blank" rel="noreferrer" data-testid="builder-visit-live-btn" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "k-press hidden sm:inline-flex")}>
                <ExternalLink className="size-3.5" /> Live
              </a>
            )}
            {(p.access === "owner" || p.access === "publisher") && <PublishPopover project={p} />}
          </div>
        )}
      </header>

      <div className="flex shrink-0 border-b border-[#E5E5E3] bg-white p-1.5 lg:hidden">
        {(["chat", "canvas"] as const).map((pane) => (
          <button
            key={pane}
            type="button"
            onClick={() => setMobilePane(pane)}
            data-testid={`mobile-pane-${pane}-btn`}
            className={cn("k-press flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs", mobilePane === pane ? "bg-[#F4F4F2] font-medium text-[#111111]" : "text-[#666664]")}
          >
            {pane === "chat" ? <MessageSquare className="size-3.5" /> : <Eye className="size-3.5" />}
            {pane === "chat" ? "Chat" : "App"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={cn("min-h-0 w-full shrink-0 border-r border-[#E5E5E3] lg:block lg:w-[380px] xl:w-[400px]", mobilePane === "chat" ? "block" : "hidden")}>
          {p ? <ChatPanel project={p} readOnly={p.access === "viewer"} /> : <div className="k-skeleton m-4 h-24 rounded-xl" />}
        </aside>

        <section className={cn("min-h-0 min-w-0 flex-1 flex-col lg:flex", mobilePane === "canvas" ? "flex" : "hidden")}>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
            <div className="relative flex rounded-lg border border-[#E5E5E3] bg-white p-0.5" role="tablist">
              {([
                { id: "preview", label: "Preview", icon: Eye },
                { id: "data", label: "Data", icon: Database },
                { id: "code", label: "Code", icon: Code2 },
                { id: "activity", label: "Activity", icon: Activity },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  data-testid={`tab-${id}-btn`}
                  className={cn("relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs sm:px-3 transition-colors duration-150", tab === id ? "text-[#111111]" : "text-[#666664] hover:text-[#111111]")}
                >
                  {tab === id && <motion.span layoutId="builder-tab" className="absolute inset-0 rounded-md bg-[#F4F4F2]" transition={{ type: "spring", stiffness: 500, damping: 38 }} />}
                  <Icon className="relative size-3.5" />
                  <span className="relative">{label}</span>
                </button>
              ))}
            </div>
            {tab === "preview" && (
              <div className="flex items-center gap-1">
                <div className="flex rounded-lg border border-[#E5E5E3] bg-white p-0.5">
                  {([
                    { id: "desktop", icon: Monitor },
                    { id: "tablet", icon: Tablet },
                    { id: "phone", icon: Smartphone },
                  ] as const).map(({ id, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={`${id} width`}
                      onClick={() => setDevice(id)}
                      data-testid={`device-${id}-btn`}
                      className={cn("k-press rounded-md p-1.5", activeDevice === id ? "bg-[#F4F4F2] text-[#111111]" : "text-[#9A9A97] hover:text-[#111111]")}
                    >
                      <Icon className="size-3.5" />
                    </button>
                  ))}
                </div>
                <Button variant="ghost" size="icon-sm" className="k-press" aria-label="Reload preview" data-testid="preview-reload-btn" onClick={() => setFrameKey((k) => k + 1)} disabled={!p?.html}>
                  <RotateCw className="size-3.5" />
                </Button>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-4">
            {tab === "preview" && (
              <div className="flex h-full justify-center overflow-hidden">
                <motion.div
                  animate={{ width: WIDTHS[activeDevice] }}
                  transition={{ type: "spring", stiffness: 260, damping: 32 }}
                  className="relative flex h-full max-w-full flex-col overflow-hidden rounded-xl border border-[#E5E5E3] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                  data-testid="preview-viewport"
                >
                  {appError && (
                    <div className="flex items-center gap-2 border-b border-[#FDE68A] bg-[#FFFBEB] px-3 py-1.5 text-xs text-[#92400E]" data-testid="preview-app-error">
                      <span className="min-w-0 flex-1 truncate">Your app reported an error: {appError}</span>
                      <button type="button" onClick={() => setAppError(null)} aria-label="Dismiss" data-testid="preview-app-error-dismiss"><X className="size-3.5" /></button>
                    </div>
                  )}
                  {p?.html ? (
                    <AppFrame
                      key={frameKey}
                      html={p.html}
                      title={p.title}
                      target={{ kind: "owner", projectId }}
                      onWrite={onWrite}
                      onAppError={setAppError}
                      testId="preview-frame"
                    />
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center" data-testid="preview-empty">
                      {p?.generating ? (
                        <>
                          <span className="relative flex size-10 items-center justify-center">
                            <span className="k-breathe absolute size-10 rounded-full bg-[#0F766E]/10" />
                            <span className="k-breathe size-3 rounded-full bg-[#0F766E]" />
                          </span>
                          <p className="text-sm text-[#666664]" data-testid="preview-building-text">Building the first version</p>
                          <div className="w-full max-w-md space-y-2">
                            <div className="k-skeleton h-8 rounded-lg" />
                            <div className="k-skeleton h-24 rounded-lg" />
                            <div className="k-skeleton h-8 w-2/3 rounded-lg" />
                          </div>
                        </>
                      ) : (
                        <p className="max-w-xs text-sm text-[#666664]">Your app will appear here. Describe it in the chat to get started.</p>
                      )}
                    </div>
                  )}
                  {p?.generating && p.html && (
                    <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-full border border-[#E5E5E3] bg-white/90 px-3 py-1 text-[11px] text-[#666664] shadow-sm backdrop-blur" data-testid="preview-updating-badge">
                      <span className="k-breathe size-1.5 rounded-full bg-[#0F766E]" /> Updating
                    </div>
                  )}
                </motion.div>
              </div>
            )}
            {tab === "data" && (
              <fieldset disabled={p?.access === "viewer"} className="contents" data-testid="data-fieldset">
                <DataEditor projectId={projectId} />
              </fieldset>
            )}
            {tab === "code" && <CodeViewer html={p?.html ?? ""} filename={`${p?.slug || "app"}.html`} />}
            {tab === "activity" && <StatsPanel projectId={projectId} published={!!p?.published} />}
          </div>
        </section>
      </div>
    </div>
  );
}
