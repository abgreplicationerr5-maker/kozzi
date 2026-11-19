import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, errorMessage } from "@/lib/api";
import type { Project, Version } from "@/lib/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function VersionMenu({ project }: { project: Project }) {
  const qc = useQueryClient();
  const versions = useQuery({
    queryKey: ["versions", project.id, project.version_count],
    queryFn: () => apiGet<Version[]>(`/projects/${project.id}/versions`),
  });
  const restore = useMutation({
    mutationFn: (n: number) => apiPost<Project>(`/projects/${project.id}/versions/${n}/restore`),
    onSuccess: (p, n) => {
      qc.setQueryData(["project", project.id], p);
      qc.invalidateQueries({ queryKey: ["messages", project.id] });
      toast.success(`Restored version ${n}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm" className="k-press" data-testid="version-history-btn" disabled={project.version_count === 0}>
            <History className="size-3.5" /> <span className="hidden sm:inline">v{project.version_pointer}</span>
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 border border-[#E5E5E3] bg-white p-0 shadow-lg" data-testid="version-history-menu">
        <p className="border-b border-[#E5E5E3] px-3 py-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[#666664]">Version history</p>
        <div className="k-scroll max-h-80 overflow-y-auto p-1">
          {versions.data?.map((v) => (
            <div
              key={v.id}
              data-testid={`version-item-${v.number}`}
              className={cn("group flex items-start gap-2 rounded-lg px-2.5 py-2", v.number === project.version_pointer ? "bg-[#F4F4F2]" : "hover:bg-[#F9F9F8]")}
            >
              <span className="mt-0.5 font-mono text-[11px] text-[#666664]">v{v.number}</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-xs text-[#111111]">{v.label}</p>
                <p className="mt-0.5 text-[11px] text-[#9A9A97]">{formatDistanceToNow(new Date(v.created_at), { addSuffix: true })}</p>
              </div>
              {v.number === project.version_pointer ? (
                <span className="text-[11px] text-[#0F766E]">current</span>
              ) : (
                <Button
                  size="xs"
                  variant="outline"
                  className="k-press"
                  disabled={restore.isPending || project.generating}
                  onClick={() => restore.mutate(v.number)}
                  data-testid={`version-restore-btn-${v.number}`}
                >
                  <RotateCcw className="size-3" /> Restore
                </Button>
              )}
            </div>
          ))}
          {versions.data?.length === 0 && <p className="p-3 text-xs text-[#666664]">No versions yet.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
