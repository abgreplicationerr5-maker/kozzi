import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserButton, useUser } from "@clerk/react";
import { AnimatePresence, motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  Copy, ExternalLink, FolderKanban, LayoutGrid, Menu, PanelLeftClose, PanelLeftOpen, PenLine, Search, Settings, Sparkles, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, errorMessage } from "@/lib/api";
import type { Device, Me, ProjectSummary, Sample } from "@/lib/types";
import { useCreateProject, useDuplicateProject } from "@/lib/hooks";
import { takePending } from "@/lib/pending";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import PromptBox from "@/components/PromptBox";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STARTERS = [
  { label: "Client tracker", prompt: "A client tracker: clients with name, company, email, status (lead/active/paused/done) and deal value; searchable table, status filters and pipeline totals." },
  { label: "Habit log", prompt: "A habit log: create habits, check them off each day, see streaks and a 7-day grid for each habit." },
  { label: "Event RSVP page", prompt: "An event RSVP page with event details, an RSVP form (name, email, attending yes/no/maybe, guests, notes) and a live guest list with counts." },
  { label: "Inventory manager", prompt: "An inventory manager: products with SKU, category, quantity, reorder level and price; low-stock alerts, quick +/- buttons, search and CSV export." },
];

const DEVICE_LABELS: Record<string, string> = { desktop: "Desktop", tablet: "Tablet", phone: "Phone" };

function ProjectCard({ p, onDelete }: { p: ProjectSummary; onDelete: (p: ProjectSummary) => void }) {
  const dup = useDuplicateProject();
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      data-testid={`project-card-${p.id}`}
      className="k-card flex flex-col rounded-xl border border-[#E5E5E3] bg-white"
    >
      <Link to={`/builder/${p.id}`} className="block flex-1 p-5" data-testid={`project-card-link-${p.id}`}>
        <div className="flex items-center justify-between gap-2">
          <span
            data-testid={`project-status-${p.id}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
              p.published ? "bg-[#ECFDF5] text-[#065F46]" : "bg-[#F4F4F2] text-[#18181B]",
            )}
          >
            <span className={cn("size-1.5 rounded-full", p.published ? "bg-[#0F766E]" : "bg-[#A1A1AA]")} />
            {p.published ? "Live" : "Draft"}
          </span>
          {p.generating && <span className="k-breathe font-mono text-[11px] text-[#0F766E]">building…</span>}
          {!p.generating && p.has_unpublished_changes && (
            <span className="font-mono text-[11px] text-[#B45309]">unpublished changes</span>
          )}
        </div>
        <h3 className="mt-4 line-clamp-1 text-base font-medium tracking-tight" data-testid={`project-title-${p.id}`}>{p.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-[#666664]">
          {p.description || "No description yet — open the editor and describe what to build."}
        </p>
        <p className="mt-4 font-mono text-[11px] text-[#9A9A97]" data-testid={`project-updated-${p.id}`}>
          Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })} · v{p.version_pointer}
        </p>
      </Link>
      <div className="flex items-center gap-1 border-t border-[#E5E5E3] px-3 py-2">
        <Link to={`/builder/${p.id}`} data-testid={`project-open-btn-${p.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "k-press")}>
          <PenLine className="size-3.5" /> Edit
        </Link>
        {p.published && (
          <a href={`/app/${p.slug}`} target="_blank" rel="noreferrer" data-testid={`project-visit-btn-${p.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "k-press")}>
            <ExternalLink className="size-3.5" /> Visit
          </a>
        )}
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="icon-sm" className="k-press" aria-label="Duplicate" data-testid={`project-duplicate-btn-${p.id}`} disabled={dup.isPending} onClick={() => dup.mutate(p.id)}>
            <Copy className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="k-press text-[#DC2626] hover:text-[#DC2626]" aria-label="Delete" data-testid={`project-delete-btn-${p.id}`} onClick={() => onDelete(p)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function SidebarNav({ collapsed, onSettings, section, setSection }: { collapsed: boolean; onSettings: () => void; section: string; setSection: (s: string) => void }) {
  const items = [
    { id: "projects", label: "Projects", icon: FolderKanban },
    { id: "samples", label: "Sample apps", icon: LayoutGrid },
  ];
  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 py-3 text-sm">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          data-testid={`sidebar-${id}-btn`}
          onClick={() => setSection(id)}
          className={cn(
            "k-press flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
            section === id ? "bg-white text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#666664] hover:bg-white/60 hover:text-[#111111]",
          )}
          title={label}
        >
          <Icon className="size-4 shrink-0" strokeWidth={1.7} />
          {!collapsed && <span>{label}</span>}
        </button>
      ))}
      <button type="button" data-testid="sidebar-settings-btn" onClick={onSettings} title="Settings" className="k-press flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[#666664] hover:bg-white/60 hover:text-[#111111]">
        <Settings className="size-4 shrink-0" strokeWidth={1.7} />
        {!collapsed && <span>Settings</span>}
      </button>
    </nav>
  );
}

function SettingsDialog({ open, onOpenChange, me }: { open: boolean; onOpenChange: (o: boolean) => void; me: Me | undefined }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [device, setDevice] = useState<Device>("desktop");
  useEffect(() => {
    if (open && me) {
      setName(me.display_name);
      setWorkspace(me.workspace_name);
      setDevice(me.preferences.default_device);
    }
  }, [open, me]);
  const save = useMutation({
    mutationFn: () =>
      apiPatch<Me>("/me", {
        display_name: name.trim(),
        workspace_name: workspace.trim(),
        preferences: { ...(me?.preferences ?? { sidebar_collapsed: false }), default_device: device },
      }),
    onSuccess: (m) => {
      qc.setQueryData(["me"], m);
      toast.success("Settings saved");
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white sm:max-w-md" data-testid="settings-dialog">
        <DialogHeader>
          <DialogTitle>Workspace settings</DialogTitle>
          <DialogDescription>Your profile and default preferences.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!workspace.trim()) return toast.error("Workspace name is required");
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" data-testid="settings-display-name-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="How Kozzi greets you" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Workspace name</Label>
            <Input id="workspace-name" data-testid="settings-workspace-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Default preview size</Label>
            <Select value={device} onValueChange={(v: string) => setDevice(v as Device)}>
              <SelectTrigger className="w-full" data-testid="settings-device-select">
                <SelectValue>{(v) => DEVICE_LABELS[v as string]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="desktop">Desktop</SelectItem>
                <SelectItem value="tablet">Tablet</SelectItem>
                <SelectItem value="phone">Phone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" className="k-press" disabled={save.isPending} data-testid="settings-save-btn">
              {save.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SamplesSection() {
  const samples = useQuery({ queryKey: ["samples"], queryFn: () => apiGet<Sample[]>("/public/samples") });
  const dup = useDuplicateProject(true);
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="dashboard-samples">
      {samples.isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="k-skeleton h-40 rounded-xl" />)}
      {samples.data?.map((s) => (
        <div key={s.id} className="k-card flex flex-col rounded-xl border border-[#E5E5E3] bg-white p-5" data-testid={`dashboard-sample-${s.slug}`}>
          <h3 className="text-base font-medium tracking-tight">{s.title}</h3>
          <p className="mt-1 line-clamp-2 flex-1 text-sm text-[#666664]">{s.description}</p>
          <div className="mt-4 flex gap-2">
            <a href={`/app/${s.slug}`} target="_blank" rel="noreferrer" data-testid={`dashboard-sample-open-${s.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "k-press")}>
              <ExternalLink className="size-3.5" /> Open
            </a>
            <Button size="sm" className="k-press" disabled={dup.isPending} onClick={() => dup.mutate(s.id)} data-testid={`dashboard-sample-remix-${s.slug}`}>
              <Copy className="size-3.5" /> Duplicate
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user } = useUser();
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [section, setSection] = useState("projects");
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const create = useCreateProject();
  const dupPending = useDuplicateProject(true);

  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<ProjectSummary[]>("/projects"),
    refetchInterval: (q) => (q.state.data?.some((p) => p.generating) ? 4000 : false),
  });
  const collapsed = me.data?.preferences.sidebar_collapsed ?? false;

  // Finish whatever the visitor started before signing up.
  useEffect(() => {
    const intent = takePending();
    if (!intent) return;
    if (intent.type === "prompt") create.mutate(intent.prompt);
    else dupPending.mutate(intent.projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSidebar = useMutation({
    mutationFn: (value: boolean) =>
      apiPatch<Me>("/me", { preferences: { ...(me.data?.preferences ?? { default_device: "desktop" }), sidebar_collapsed: value } }),
    onMutate: (value) => {
      if (me.data) qc.setQueryData<Me>(["me"], { ...me.data, preferences: { ...me.data.preferences, sidebar_collapsed: value } });
    },
    onSuccess: (m) => qc.setQueryData(["me"], m),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project deleted");
      setToDelete(null);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects.data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [projects.data, search]);

  const greetingName = me.data?.display_name || user?.firstName || "";

  return (
    <div className="flex h-screen overflow-hidden bg-[#F9F9F8]">
      <motion.aside
        animate={{ width: collapsed ? 64 : 248 }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
        className="hidden shrink-0 flex-col border-r border-[#E5E5E3] bg-[#F4F4F2] md:flex"
        data-testid="dashboard-sidebar"
      >
        <div className={cn("flex h-14 items-center border-b border-[#E5E5E3] px-3", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && <Logo to="/dashboard" />}
          <Button variant="ghost" size="icon-sm" className="k-press" aria-label="Toggle sidebar" data-testid="sidebar-toggle-btn" onClick={() => toggleSidebar.mutate(!collapsed)}>
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
        </div>
        <SidebarNav collapsed={collapsed} onSettings={() => setSettingsOpen(true)} section={section} setSection={setSection} />
        <div className={cn("flex items-center gap-2.5 border-t border-[#E5E5E3] p-3", collapsed && "justify-center")}>
          <UserButton />
          {!collapsed && (
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-[#111111]" data-testid="sidebar-workspace-name">{me.data?.workspace_name ?? "Workspace"}</p>
              <p className="truncate text-[#666664]">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          )}
        </div>
      </motion.aside>

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 bg-[#F4F4F2] p-0">
          <SheetTitle className="flex h-14 items-center border-b border-[#E5E5E3] px-4"><Logo to="/dashboard" /></SheetTitle>
          <SidebarNav collapsed={false} onSettings={() => { setMobileNav(false); setSettingsOpen(true); }} section={section} setSection={(s) => { setSection(s); setMobileNav(false); }} />
        </SheetContent>
      </Sheet>

      <main className="k-scroll flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E5E5E3] bg-[#F9F9F8]/85 px-4 backdrop-blur-xl md:hidden">
          <Button variant="ghost" size="icon-sm" aria-label="Open menu" data-testid="mobile-menu-btn" onClick={() => setMobileNav(true)}>
            <Menu className="size-4" />
          </Button>
          <Logo to="/dashboard" />
          <UserButton />
        </div>
        <div className="k-rise mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#666664]" data-testid="dashboard-workspace-label">{me.data?.workspace_name ?? "Workspace"}</p>
          <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl" data-testid="dashboard-greeting">
            {greetingName ? `What are we building, ${greetingName}?` : "What are we building today?"}
          </h1>
          <div className="mt-6 max-w-3xl">
            <PromptBox value={prompt} onChange={setPrompt} onSubmit={(t) => create.mutate(t)} pending={create.isPending} size="md" testId="dashboard-prompt" />
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setPrompt(s.prompt)}
                  data-testid={`starter-idea-${i}`}
                  className="k-press inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E3] bg-white px-3 py-1.5 text-xs text-[#666664] hover:border-[#111111]/30 hover:text-[#111111]"
                >
                  <Sparkles className="size-3 text-[#0F766E]" /> {s.label}
                </button>
              ))}
            </div>
          </div>

          {section === "projects" ? (
            <section className="mt-12">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-medium tracking-tight">
                  Your projects <span className="ml-1 font-mono text-sm text-[#9A9A97]" data-testid="projects-count">{projects.data?.length ?? 0}</span>
                </h2>
                <div className="relative w-full sm:w-72">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#9A9A97]" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects" className="bg-white pl-8" data-testid="projects-search-input" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3" data-testid="projects-grid">
                {projects.isLoading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="k-skeleton h-52 rounded-xl" />)}
                <AnimatePresence mode="popLayout">
                  {filtered.map((p) => <ProjectCard key={p.id} p={p} onDelete={setToDelete} />)}
                </AnimatePresence>
              </div>
              {projects.isError && (
                <p className="rounded-xl border border-dashed border-[#E5E5E3] p-10 text-center text-sm text-[#666664]">Couldn't load your projects. Refresh to retry.</p>
              )}
              {projects.data && filtered.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-10 text-center" data-testid="projects-empty">
                  <p className="text-sm text-[#666664]">
                    {search ? `No projects match “${search}”.` : "No projects yet. Describe an app above or pick a starter idea."}
                  </p>
                  {!search && (
                    <button type="button" onClick={() => setSection("samples")} className="mt-3 text-sm font-medium text-[#0F766E] hover:underline" data-testid="projects-empty-samples-btn">
                      Or duplicate a sample app →
                    </button>
                  )}
                </div>
              )}
            </section>
          ) : (
            <section className="mt-12">
              <h2 className="mb-5 text-lg font-medium tracking-tight">Sample apps</h2>
              <SamplesSection />
            </section>
          )}
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} me={me.data} />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="bg-white sm:max-w-md" data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete “{toDelete?.title}”?</DialogTitle>
            <DialogDescription>This removes the project, its versions, chat history and all of its live data. This can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} data-testid="delete-cancel-btn">Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)} data-testid="delete-confirm-btn">
              {remove.isPending ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {(create.isPending || dupPending.isPending) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F9F9F8]/70 backdrop-blur-sm" data-testid="creating-overlay">
          <div className="flex items-center gap-3 rounded-xl border border-[#E5E5E3] bg-white px-5 py-3 text-sm shadow-lg">
            <span className="k-breathe size-2 rounded-full bg-[#0F766E]" /> Setting up your project…
          </div>
        </div>
      )}
    </div>
  );
}
