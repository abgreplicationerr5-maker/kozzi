import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth, useClerk } from "@clerk/react";
import { AnimatePresence, motion } from "motion/react";
import { CreditCard, Users, CornerDownLeft, ExternalLink, FilePlus2, FolderOpen, Inbox, LayoutDashboard, LogOut, Search, Settings, Trash2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";
import { useCreateProject } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  label: string;
  hint?: string;
  group: "Actions" | "Projects" | "Live apps";
  icon: typeof Search;
  run: () => void;
}

/** Ctrl/Cmd + K anywhere in the signed-in app. */
export default function CommandMenu() {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const create = useCreateProject();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    const onOpen = () => setOpen(true);
    const onNav = (e: Event) => navigate((e as CustomEvent<string>).detail);
    window.addEventListener("kozzi:navigate", onNav);
    window.addEventListener("keydown", onKey);
    window.addEventListener("kozzi:command-menu", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("kozzi:command-menu", onOpen);
      window.removeEventListener("kozzi:navigate", onNav);
    };
  }, [navigate]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
    }
  }, [open]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<ProjectSummary[]>("/projects"),
    enabled: !!isSignedIn && open,
  });

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => navigate(path);
    const base: Item[] = [
      { id: "new", label: "New blank project", group: "Actions", icon: FilePlus2, run: () => create.mutate("") },
      { id: "dashboard", label: "Go to dashboard", group: "Actions", icon: LayoutDashboard, run: go("/dashboard") },
      { id: "inbox", label: "Open the Inbox", hint: "emails from Kozzi and your apps", group: "Actions", icon: Inbox, run: go("/dashboard?section=inbox") },
      { id: "bin", label: "Open the Bin", hint: "restore deleted items", group: "Actions", icon: Trash2, run: go("/dashboard?section=bin") },
      { id: "billing", label: "Plan and billing", group: "Actions", icon: CreditCard, run: go("/billing") },
      { id: "team", label: "Team", hint: "invite teammates", group: "Actions", icon: Users, run: go("/team") },
      { id: "settings", label: "Settings", group: "Actions", icon: Settings, run: go("/dashboard?settings=1") },
      { id: "signout", label: "Sign out", group: "Actions", icon: LogOut, run: () => void signOut({ redirectUrl: "/" }) },
    ];
    const ps = projects.data ?? [];
    const open_ = ps.map<Item>((p) => ({ id: `p-${p.id}`, label: p.title, hint: p.published ? "Live" : "Draft", group: "Projects", icon: FolderOpen, run: go(`/builder/${p.id}`) }));
    const live = ps.filter((p) => p.published).map<Item>((p) => ({
      id: `l-${p.id}`, label: `/app/${p.slug}`, hint: p.title, group: "Live apps", icon: ExternalLink,
      run: () => window.open(`/app/${p.slug}`, "_blank", "noopener"),
    }));
    const term = q.trim().toLowerCase();
    return [...base, ...open_, ...live].filter((i) => !term || `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(term));
  }, [projects.data, q, navigate, signOut, create]);

  useEffect(() => setIndex(0), [q]);

  if (!isSignedIn) return null;

  const run = (item: Item | undefined) => {
    if (!item) return;
    setOpen(false);
    item.run();
  };

  let lastGroup = "";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-[#111111]/20 px-4 pt-[12vh] backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={() => setOpen(false)}
          data-testid="command-menu-overlay"
        >
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 520, damping: 38 }}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full max-w-lg overflow-hidden rounded-xl border border-[#E5E5E3] bg-white shadow-[0_24px_60px_-20px_rgba(0,0,0,0.25)]"
            data-testid="command-menu"
            role="dialog"
            aria-label="Command menu"
          >
            <div className="flex items-center gap-2 border-b border-[#E5E5E3] px-3.5">
              <Search className="size-4 text-[#9A9A97]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, items.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") { e.preventDefault(); run(items[index]); }
                }}
                placeholder="Search projects and actions"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-[#9A9A97]"
                data-testid="command-menu-input"
              />
              <kbd className="rounded border border-[#E5E5E3] px-1.5 font-mono text-[10px] text-[#9A9A97]">esc</kbd>
            </div>
            <div className="k-scroll max-h-[50vh] overflow-y-auto p-1.5" data-testid="command-menu-list">
              {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-[#666664]" data-testid="command-menu-empty">Nothing matches “{q}”.</p>}
              {items.map((item, i) => {
                const header = item.group !== lastGroup ? item.group : null;
                lastGroup = item.group;
                const Icon = item.icon;
                return (
                  <div key={item.id}>
                    {header && <p className="px-2.5 pb-1 pt-2.5 text-[11px] text-[#9A9A97]">{header}</p>}
                    <button
                      type="button"
                      onMouseEnter={() => setIndex(i)}
                      onClick={() => run(item)}
                      data-testid={`command-item-${item.id}`}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-100", i === index ? "bg-[#F4F4F2] text-[#111111]" : "text-[#333331]")}
                    >
                      <Icon className="size-4 shrink-0 text-[#666664]" strokeWidth={1.7} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint && <span className="truncate text-xs text-[#9A9A97]">{item.hint}</span>}
                      {i === index && <CornerDownLeft className="size-3.5 shrink-0 text-[#9A9A97]" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function openCommandMenu() {
  window.dispatchEvent(new Event("kozzi:command-menu"));
}
