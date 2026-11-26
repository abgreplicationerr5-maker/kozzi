import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Columns3, Database, Download, Plus, RefreshCw, Table2, Trash2 } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, errorMessage } from "@/lib/api";
import type { RecordOut, TableInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { notifyError } from "@/lib/notify";

function display(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function parseLike(original: unknown, text: string): unknown {
  if (typeof original === "number") {
    const n = Number(text);
    return text.trim() !== "" && !Number.isNaN(n) ? n : text;
  }
  if (typeof original === "boolean") return text.trim().toLowerCase() === "true";
  if (original !== null && typeof original === "object") {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function Cell({ value, onSave, testId }: { value: unknown; onSave: (v: unknown) => void; testId: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const start = () => {
    setDraft(display(value));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    if (draft !== display(value)) onSave(parseLike(value, draft));
  };
  if (editing)
    return (
      <input
        autoFocus
        data-testid={`${testId}-input`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-full min-w-[120px] rounded-md border border-[#111111] bg-white px-2 text-[13px] outline-none"
      />
    );
  return (
    <button
      type="button"
      onClick={start}
      data-testid={testId}
      className="block h-8 w-full min-w-[120px] max-w-[280px] truncate rounded-md px-2 text-left text-[13px] transition-colors duration-150 hover:bg-[#F4F4F2]"
      title={display(value)}
    >
      {display(value) || <span className="text-[#C4C4C0]">empty</span>}
    </button>
  );
}

function toCsv(columns: string[], rows: RecordOut[]): string {
  const esc = (v: unknown) => {
    const t = display(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["id", ...columns, "created_at", "updated_at"];
  const body = rows.map((r) => [r.id, ...columns.map((c) => r.data[c]), r.created_at, r.updated_at].map(esc).join(","));
  return [head.map(esc).join(","), ...body].join("\r\n");
}

function downloadCsv(name: string, columns: string[], rows: RecordOut[]) {
  const blob = new Blob([toCsv(columns, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DataEditor({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [newColOpen, setNewColOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [name, setName] = useState("");

  const tables = useQuery({ queryKey: ["tables", projectId], queryFn: () => apiGet<TableInfo[]>(`/projects/${projectId}/tables`) });
  useEffect(() => {
    const list = tables.data ?? [];
    if (list.length && (!active || !list.some((t) => t.name === active))) setActive(list[0].name);
    if (!list.length) setActive(null);
  }, [tables.data, active]);

  const table = tables.data?.find((t) => t.name === active);
  const base = `/projects/${projectId}/tables/${encodeURIComponent(active ?? "")}`;
  const records = useQuery({
    queryKey: ["records", projectId, active],
    queryFn: () => apiGet<RecordOut[]>(`${base}/records`),
    enabled: !!active,
  });

  const columns = useMemo(() => {
    const set = new Set(table?.columns ?? []);
    records.data?.forEach((r) => Object.keys(r.data).forEach((k) => set.add(k)));
    return [...set];
  }, [table, records.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["tables", projectId] });
    qc.invalidateQueries({ queryKey: ["records", projectId] });
  };
  const onErr = (e: unknown) => notifyError(e);

  const addRow = useMutation({
    mutationFn: () => apiPost<RecordOut>(`${base}/records`, { data: Object.fromEntries(columns.map((c) => [c, ""])) }),
    onSuccess: () => {
      refresh();
      toast.success("Row added");
    },
    onError: onErr,
  });
  const updateCell = useMutation({
    mutationFn: ({ id, col, value }: { id: string; col: string; value: unknown }) => apiPatch<RecordOut>(`${base}/records/${id}`, { data: { [col]: value } }),
    onSuccess: refresh,
    onError: onErr,
  });
  const delRow = useMutation({
    mutationFn: (id: string) => apiDelete(`${base}/records/${id}`),
    onSuccess: () => {
      refresh();
      toast.success("Row moved to the Bin");
    },
    onError: onErr,
  });
  const createTable = useMutation({
    mutationFn: (n: string) => apiPost<TableInfo>(`/projects/${projectId}/tables`, { name: n, columns: ["name"] }),
    onSuccess: (t) => {
      refresh();
      setActive(t.name);
      setNewTableOpen(false);
      toast.success(`Table “${t.name}” created`);
    },
    onError: onErr,
  });
  const addColumn = useMutation({
    mutationFn: (n: string) => apiPost<TableInfo>(`${base}/columns`, { name: n }),
    onSuccess: () => {
      refresh();
      setNewColOpen(false);
      toast.success("Column added");
    },
    onError: onErr,
  });
  const dropTable = useMutation({
    mutationFn: () => apiDelete(base),
    onSuccess: () => {
      setActive(null);
      refresh();
      setDropOpen(false);
      toast.success("Table moved to the Bin");
    },
    onError: onErr,
  });

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#E5E5E3] bg-white md:flex-row" data-testid="data-editor">
      <aside className="flex shrink-0 flex-col border-b border-[#E5E5E3] md:w-52 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-xs font-medium text-[#111111]">Tables</span>
          <Button size="icon-xs" variant="ghost" aria-label="New table" onClick={() => { setName(""); setNewTableOpen(true); }} data-testid="data-new-table-btn">
            <Plus className="size-3.5" />
          </Button>
        </div>
        <div className="k-scroll flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-y-auto">
          {tables.data?.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={() => setActive(t.name)}
              data-testid={`data-table-${t.name}`}
              className={cn(
                "k-press flex shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px]",
                active === t.name ? "bg-[#F4F4F2] text-[#111111]" : "text-[#666664] hover:bg-[#F9F9F8] hover:text-[#111111]",
              )}
            >
              <Table2 className="size-3.5 shrink-0" />
              <span className="flex-1 truncate">{t.name}</span>
              <span className="font-mono text-[11px] text-[#9A9A97]">{t.count}</span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!tables.isLoading && !tables.data?.length ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center" data-testid="data-empty">
            <Database className="size-6 text-[#9A9A97]" strokeWidth={1.5} />
            <p className="max-w-sm text-sm text-[#666664]">
              No tables yet. They appear when your app saves its first record, or you can create one now.
            </p>
            <Button size="sm" className="k-press" onClick={() => { setName(""); setNewTableOpen(true); }} data-testid="data-empty-new-table-btn">
              <Plus className="size-3.5" /> New table
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E5E3] px-3 py-2">
              <p className="mr-auto text-sm font-medium" data-testid="data-active-table">
                {active} <span className="ml-1 font-mono text-xs text-[#9A9A97]">{records.data?.length ?? 0} rows</span>
              </p>
              <Button size="sm" variant="ghost" className="k-press" onClick={refresh} aria-label="Refresh" data-testid="data-refresh-btn">
                <RefreshCw className={cn("size-3.5", (records.isFetching || tables.isFetching) && "animate-spin")} />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="k-press"
                disabled={!active || !records.data?.length}
                onClick={() => {
                  if (!active || !records.data) return;
                  downloadCsv(active, columns, records.data);
                  toast.success(`Exported ${records.data.length} rows`);
                }}
                data-testid="data-export-csv-btn"
              >
                <Download className="size-3.5" /> CSV
              </Button>
              <Button size="sm" variant="outline" className="k-press" onClick={() => { setName(""); setNewColOpen(true); }} disabled={!active} data-testid="data-add-column-btn">
                <Columns3 className="size-3.5" /> Column
              </Button>
              <Button size="sm" className="k-press" onClick={() => addRow.mutate()} disabled={!active || addRow.isPending} data-testid="data-add-row-btn">
                <Plus className="size-3.5" /> Row
              </Button>
              <Button size="icon-sm" variant="ghost" className="k-press text-[#DC2626] hover:text-[#DC2626]" aria-label="Delete table" onClick={() => setDropOpen(true)} disabled={!active} data-testid="data-delete-table-btn">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="k-scroll flex-1 overflow-auto">
              <table className="w-full border-collapse text-left" data-testid="data-grid">
                <thead className="sticky top-0 z-10 bg-[#F9F9F8]">
                  <tr>
                    {columns.map((c) => (
                      <th key={c} className="border-b border-r border-[#E5E5E3] px-3 py-2 font-mono text-[11px] font-normal text-[#666664]">{c}</th>
                    ))}
                    <th className="border-b border-r border-[#E5E5E3] px-3 py-2 font-mono text-[11px] font-normal text-[#666664]">created</th>
                    <th className="w-10 border-b border-[#E5E5E3]" />
                  </tr>
                </thead>
                <tbody>
                  {records.data?.map((r) => (
                    <tr key={r.id} className="group" data-testid={`data-row-${r.id}`}>
                      {columns.map((c) => (
                        <td key={c} className="border-b border-r border-[#F0F0EE] px-1 py-0.5">
                          <Cell value={r.data[c]} testId={`data-cell-${r.id}-${c}`} onSave={(value) => updateCell.mutate({ id: r.id, col: c, value })} />
                        </td>
                      ))}
                      <td className="whitespace-nowrap border-b border-r border-[#F0F0EE] px-3 text-[12px] text-[#9A9A97]">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </td>
                      <td className="border-b border-[#F0F0EE] px-1">
                        <Button size="icon-xs" variant="ghost" aria-label="Delete row" className="opacity-60 group-hover:opacity-100" onClick={() => delRow.mutate(r.id)} data-testid={`data-delete-row-${r.id}`}>
                          <Trash2 className="size-3 text-[#DC2626]" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.data?.length === 0 && (
                <p className="p-8 text-center text-sm text-[#666664]" data-testid="data-no-rows">This table has no rows yet. Add one here or from your app's preview.</p>
              )}
            </div>
          </>
        )}
      </section>

      <Dialog open={newTableOpen || newColOpen} onOpenChange={(o) => { if (!o) { setNewTableOpen(false); setNewColOpen(false); } }}>
        <DialogContent className="bg-white sm:max-w-sm" data-testid="data-name-dialog">
          <DialogHeader>
            <DialogTitle>{newTableOpen ? "New table" : "New column"}</DialogTitle>
            <DialogDescription>{newTableOpen ? "Letters, numbers, dashes and underscores." : `Adds a column to ${active}.`}</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = name.trim();
              if (!n) return toast.error("Enter a name");
              if (newTableOpen) {
                if (!/^[A-Za-z0-9_-]+$/.test(n)) return toast.error("Use letters, numbers, - or _");
                createTable.mutate(n);
              } else addColumn.mutate(n);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="data-name">Name</Label>
              <Input id="data-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={64} data-testid="data-name-input" />
            </div>
            <DialogFooter>
              <Button type="submit" className="k-press" disabled={createTable.isPending || addColumn.isPending} data-testid="data-name-submit-btn">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dropOpen} onOpenChange={setDropOpen}>
        <DialogContent className="bg-white sm:max-w-sm" data-testid="data-drop-dialog">
          <DialogHeader>
            <DialogTitle>Delete table “{active}”?</DialogTitle>
            <DialogDescription>The table and its {table?.count ?? 0} rows move to the Bin. You can restore them from the dashboard for 30 days.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropOpen(false)} data-testid="data-drop-cancel-btn">Cancel</Button>
            <Button variant="destructive" onClick={() => dropTable.mutate()} disabled={dropTable.isPending} data-testid="data-drop-confirm-btn">Delete table</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
