import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserButton, useUser } from "@clerk/react";
import { AnimatePresence, motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  Command, Copy, ExternalLink, FolderKanban, Menu, PanelLeftClose, PanelLeftOpen, PenLine, RotateCcw, Search, Settings, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import type { Device, Me, ProjectSummary, Trash } from "@/lib/types";
import { useCreateProject, useDuplicateProject } from "@/lib/hooks";
import { takePending } from "@/lib/pending";
import { cn } from "@/lib/utils";
import Logo from "@/components/Logo";
import PromptBox from "@/components/PromptBox";
import { openCommandMenu } from "@/components/CommandMenu";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STARTERS = [
  { label: "Client tracker", prompt: "A client tracker: clients with name, company, email, status (lead/active/paused/done) and deal value; searchable table, status filters and pipeline totals." },
  { label: "Habit log", prompt: "A habit log: create habits, check them off each day, see streaks and a 7-day grid for each habit." },
  { label: "Event RSVP page", prompt: "An event RSVP page with event details and an RSVP form (name, email, attending yes/no/maybe, guests, notes). Email each guest a confirmation with kozzi.email.sendReceipt and notify me with kozzi.email.notifyOwner. Show a live guest list with counts." },
  { label: "Inventory manager", prompt: "An inventory manager: products with SKU, category, quantity, reorder level and price; low-stock alerts, quick +/- buttons, search and CSV export." },
  { label: "Feedback inbox", prompt: "A feedback form for customers (name, email, rating 1-5, message) that emails me each new entry with kozzi.email.notifyOwner, plus an admin view with filters by rating and an average score." },
];

const DEVICE_LABELS: Record<string, string> = { desktop: "Desktop", tablet: "Tablet", phone: "Phone" };
type Section = "projects" | "bin";

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
        <div className="flex items-center gap-2 text-xs">
          <span data-testid={`project-status-${p.id}`} className={cn("inline-flex items-center gap-1.5 font-medium", p.published ? "text-[#0F766E]" : "text-[#666664]")}>
            <span className={cn("size-1.5 rounded-full", p.published ? "bg-[#0F766E]" : "bg-[#C4C4C0]")} />
            {p.published ? "Live" : "Draft"}
          </span>
          {p.generating && <span className="k-breathe text-[#0F766E]" data-testid={`project-working-${p.id}`}>Working</span>}
          {!p.generating && p.has_unpublished_changes && <span className="text-[#B45309]" data-testid={`project-unpublished-${p.id}`}>Changes not live</span>}
        </div>
        <h3 className="mt-3 line-clamp-1 text-base font-medium tracking-tight" data-testid={`project-title-${p.id}`}>{p.title}</h3>
        <p className="mt-1 line-clamp-2 min-h-[40px] text-sm leading-relaxed text-[#666664]" data-testid={`project-description-${p.id}`}>
          {p.description || "Empty project. Open it and describe what to build."}
        </p>
        <p className="mt-4 text-[11px] text-[#9A9A97]" data-testid={`project-updated-${p.id}`}>
          Updated {formatDistanceToNow(new Date(p.updated_at), { addSuffix: true })} · v{p.version_pointer}
          {p.published && ` · ${p.views.toLocaleString()} ${p.views === 1 ? "view" : "views"}`}
        </p>
        {p.custom_domain && (
          <p className="mt-1 truncate font-mono text-[11px] text-[#666664]" data-testid={`project-domain-${p.id}`}>
            {p.custom_domain}{p.domain_status === "connected" ? "" : " (not forwarding yet)"}
          </p>
        )}
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

function SidebarNav({ collapsed, onSettings, section, setSection, binCount }: {
  collapsed: boolean; onSettings: () => void; section: Section; setSection: (s: Section) => void; binCount: number;
}) {
  const items = [
    { id: "projects" as const, label: "Projects", icon: FolderKanban },
    { id: "bin" as const, label: "Bin", icon: Trash2 },
  ];
  const row = "k-press flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left";
  return (
    <nav className="flex flex-1 flex-col gap-1 px-2 py-3 text-sm">
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          data-testid={`sidebar-${id}-btn`}
          onClick={() => setSection(id)}
          className={cn(row, section === id ? "bg-white text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,0.04)]" : "text-[#666664] hover:bg-white/60 hover:text-[#111111]")}
          title={label}
        >
          <Icon className="size-4 shrink-0" strokeWidth={1.7} />
          {!collapsed && <span className="flex-1">{label}</span>}
          {!collapsed && id === "bin" && binCount > 0 && <span className="text-[11px] tabular-nums text-[#9A9A97]" data-testid="sidebar-bin-count">{binCount}</span>}
        </button>
      ))}
      <button type="button" data-testid="sidebar-settings-btn" onClick={onSettings} title="Settings" className={cn(row, "text-[#666664] hover:bg-white/60 hover:text-[#111111]")}>
        <Settings className="size-4 shrink-0" strokeWidth={1.7} />
        {!collapsed && <span>Settings</span>}
      </button>
      <button type="button" data-testid="sidebar-command-btn" onClick={openCommandMenu} title="Command menu" className={cn(row, "mt-auto text-[#666664] hover:bg-white/60 hover:text-[#111111]")}>
        <Command className="size-4 shrink-0" strokeWidth={1.7} />
        {!collapsed && <span className="flex-1">Quick jump</span>}
        {!collapsed && <kbd className="rounded border border-[#E5E5E3] bg-white px-1.5 font-mono text-[10px] text-[#9A9A97]">Ctrl K</kbd>}
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
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Your profile and default preferences.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input id="display-name" data-testid="settings-display-name-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Team or company name <span className="font-normal text-[#9A9A97]">(optional)</span></Label>
            <Input id="workspace-name" data-testid="settings-workspace-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Default preview size</Label>
            <Select value={device} onValueChange={(v: string) => setDevice(v as Device)}>
              <SelectTrigger className="w-full" data-testid="settings-device-select">
                <SelectValue>{(v) => DEVICE_LABELS[v as string]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="bg-white">
                <SelectItem value="desktop" data-testid="settings-device-desktop">Desktop</SelectItem>
                <SelectItem value="tablet" data-testid="settings-device-tablet">Tablet</SelectItem>
                <SelectItem value="phone" data-testid="settings-device-phone">Phone</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {me?.email && <p className="text-xs text-[#666664]" data-testid="settings-email">Emails from Kozzi and your apps go to {me.email}.</p>}
          <DialogFooter>
            <Button type="submit" className="k-press" disabled={save.isPending} data-testid="settings-save-btn">
              {save.isPending ? "Saving" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BinRow({ title, sub, onRestore, pending, testId }: { title: string; sub: string; onRestore: () => void; pending: boolean; testId: string }) {
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: 12 }} className="flex items-center gap-3 px-4 py-3" data-testid={testId}>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-[#111111]">{title}</p>
        <p className="truncate text-xs text-[#9A9A97]">{sub}</p>
      </div>
      <Button size="sm" variant="outline" className="k-press" onClick={onRestore} disabled={pending} data-testid={`${testId}-restore-btn`}>
        <RotateCcw className="size-3.5" /> Restore
      </Button>
    </motion.li>
  );
}

function BinSection() {
  const qc = useQueryClient();
  const trash = useQuery({ queryKey: ["trash"], queryFn: () => apiGet<Trash>("/trash") });
  const restore = useMutation({
    mutationFn: (path: string) => apiPost(path),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trash"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tables"] });
      qc.invalidateQueries({ queryKey: ["records"] });
      toast.success("Restored");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const ago = (d: string) => `Deleted ${formatDistanceToNow(new Date(d), { addSuffix: true })}`;
  const t = trash.data;
  const empty = t && !t.projects.length && !t.tables.length && !t.records.length;
  const group = (label: string, children: React.ReactNode, testId: string) => (
    <div className="overflow-hidden rounded-xl border border-[#E5E5E3] bg-white" data-testid={testId}>
      <p className="border-b border-[#E5E5E3] bg-[#FBFBFA] px-4 py-2 text-xs font-medium text-[#666664]">{label}</p>
      <ul className="divide-y divide-[#F0F0EE]"><AnimatePresence initial={false}>{children}</AnimatePresence></ul>
    </div>
  );
  return (
    <section className="mt-12" data-testid="bin-section">
      <h2 className="text-lg font-medium tracking-tight">Bin</h2>
      <p className="mt-1 text-sm text-[#666664]">Deleted projects, tables and rows stay here for 30 days.</p>
      <div className="mt-5 space-y-4">
        {trash.isLoading && <div className="k-skeleton h-32 rounded-xl" />}
        {trash.isError && <p className="text-sm text-[#666664]">Couldn't load the Bin. Refresh to retry.</p>}
        {empty && <p className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-10 text-center text-sm text-[#666664]" data-testid="bin-empty">The Bin is empty.</p>}
        {!!t?.projects.length && group("Projects", t.projects.map((p) => (
          <BinRow key={p.id} title={p.title} sub={ago(p.deleted_at)} pending={restore.isPending} testId={`bin-project-${p.id}`} onRestore={() => restore.mutate(`/trash/projects/${p.id}/restore`)} />
        )), "bin-projects")}
        {!!t?.tables.length && group("Tables", t.tables.map((x) => (
          <BinRow key={`${x.project_id}-${x.name}`} title={`${x.name} (${x.rows} rows)`} sub={`${x.project_title} · ${ago(x.deleted_at)}`} pending={restore.isPending}
            testId={`bin-table-${x.name}`} onRestore={() => restore.mutate(`/trash/projects/${x.project_id}/tables/${encodeURIComponent(x.name)}/restore`)} />
        )), "bin-tables")}
        {!!t?.records.length && group("Rows", t.records.map((r) => (
          <BinRow key={r.id} title={r.preview || r.id} sub={`${r.project_title} / ${r.table} · ${ago(r.deleted_at)}`} pending={restore.isPending}
            testId={`bin-record-${r.id}`} onRestore={() => restore.mutate(`/trash/records/${r.id}/restore`)} />
        )), "bin-records")}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const { user } = useUser();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);
  const create = useCreateProject();
  const dupPending = useDuplicateProject(true);

  const section: Section = params.get("section") === "bin" ? "bin" : "projects";
  const settingsOpen = params.get("settings") === "1";
  const setSection = (s: Section) => setParams(s === "bin" ? { section: "bin" } : {});
  const setSettingsOpen = (o: boolean) => {
    const next = new URLSearchParams(params);
    if (o) next.set("settings", "1");
    else next.delete("settings");
    setParams(next);
  };

  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const trash = useQuery({ queryKey: ["trash"], queryFn: () => apiGet<Trash>("/trash") });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<ProjectSummary[]>("/projects"),
    refetchInterval: (q) => (q.state.data?.some((p) => p.generating) ? 4000 : false),
  });
  const collapsed = me.data?.preferences.sidebar_collapsed ?? false;
  const binCount = (trash.data?.projects.length ?? 0) + (trash.data?.tables.length ?? 0) + (trash.data?.records.length ?? 0);

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
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["trash"] });
      setToDelete(null);
      toast.success("Moved to the Bin", {
        action: { label: "Undo", onClick: () => apiPost(`/trash/projects/${id}/restore`).then(() => {
          qc.invalidateQueries({ queryKey: ["projects"] });
          qc.invalidateQueries({ queryKey: ["trash"] });
        }) },
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (projects.data ?? []).filter((p) => !q || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [projects.data, search]);

  const label = me.data?.workspace_name || me.data?.display_name || user?.fullName || user?.primaryEmailAddress?.emailAddress || "";

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
        <SidebarNav collapsed={collapsed} onSettings={() => setSettingsOpen(true)} section={section} setSection={setSection} binCount={binCount} />
        <div className={cn("flex items-center gap-2.5 border-t border-[#E5E5E3] p-3", collapsed && "justify-center")}>
          <UserButton />
          {!collapsed && (
            <div className="min-w-0 text-xs">
              <p className="truncate font-medium text-[#111111]" data-testid="sidebar-account-name">{label}</p>
              <p className="truncate text-[#666664]" data-testid="sidebar-account-email">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          )}
        </div>
      </motion.aside>

      <Sheet open={mobileNav} onOpenChange={setMobileNav}>
        <SheetContent side="left" className="w-64 bg-[#F4F4F2] p-0">
          <SheetTitle className="flex h-14 items-center border-b border-[#E5E5E3] px-4"><Logo to="/dashboard" /></SheetTitle>
          <SidebarNav collapsed={false} binCount={binCount} onSettings={() => { setMobileNav(false); setSettingsOpen(true); }} section={section} setSection={(s) => { setSection(s); setMobileNav(false); }} />
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
          <h1 className="text-2xl font-medium tracking-tight sm:text-[28px]" data-testid="dashboard-heading">New app</h1>
          <p className="mt-1 text-sm text-[#666664]">Describe it in a sentence or two. You can keep changing it from the chat.</p>
          <div className="mt-5 max-w-3xl">
            <PromptBox value={prompt} onChange={setPrompt} onSubmit={(t) => create.mutate(t)} pending={create.isPending} size="md" testId="dashboard-prompt" />
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setPrompt(s.prompt)}
                  data-testid={`starter-idea-${i}`}
                  className="k-press rounded-md border border-[#E5E5E3] bg-white px-3 py-1.5 text-xs text-[#666664] transition-colors duration-150 hover:border-[#111111]/30 hover:text-[#111111]"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {section === "projects" ? (
            <section className="mt-12">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-medium tracking-tight">
                  Projects <span className="ml-1 text-sm font-normal tabular-nums text-[#9A9A97]" data-testid="projects-count">{projects.data?.length ?? 0}</span>
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
                <p className="rounded-xl border border-dashed border-[#E5E5E3] p-10 text-center text-sm text-[#666664]" data-testid="projects-error">Couldn't load your projects. Refresh to retry.</p>
              )}
              {projects.data && filtered.length === 0 && (
                <div className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-10 text-center" data-testid="projects-empty">
                  <p className="text-sm text-[#666664]">
                    {search ? `No projects match “${search}”.` : "No projects yet. Describe an app above or pick a starter."}
                  </p>
                  {!search && (
                    <Link to="/#gallery" className="mt-3 inline-block text-sm font-medium text-[#0F766E] hover:underline" data-testid="projects-empty-gallery-link">
                      Or copy one from the gallery
                    </Link>
                  )}
                </div>
              )}
            </section>
          ) : (
            <BinSection />
          )}
        </div>
      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} me={me.data} />

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="bg-white sm:max-w-md" data-testid="delete-dialog">
          <DialogHeader>
            <DialogTitle>Delete “{toDelete?.title}”?</DialogTitle>
            <DialogDescription>It moves to the Bin and its live link goes offline. You can restore it, with all its data, for 30 days.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)} data-testid="delete-cancel-btn">Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)} data-testid="delete-confirm-btn">
              {remove.isPending ? "Deleting" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {(create.isPending || dupPending.isPending) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F9F9F8]/70 backdrop-blur-sm" data-testid="creating-overlay">
          <div className="flex items-center gap-3 rounded-xl border border-[#E5E5E3] bg-white px-5 py-3 text-sm shadow-lg">
            <span className="k-breathe size-2 rounded-full bg-[#0F766E]" /> Setting up your project
          </div>
        </div>
      )}
    </div>
  );
}

