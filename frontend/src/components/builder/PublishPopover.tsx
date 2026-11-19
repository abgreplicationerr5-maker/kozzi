import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Globe, Loader2 } from "lucide-react";
import { apiPost, errorMessage } from "@/lib/api";
import type { Project } from "@/lib/types";
import { copyText } from "@/lib/hooks";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function PublishPopover({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(project.slug);
  useEffect(() => {
    if (open) setSlug(project.slug);
  }, [open, project.slug]);

  const url = `${window.location.origin}/app/${project.slug}`;
  const valid = SLUG_RE.test(slug) && slug.length >= 2 && slug.length <= 60;

  const publish = useMutation({
    mutationFn: () => apiPost<Project>(`/projects/${project.id}/publish`, { slug }),
    onSuccess: (p) => {
      qc.setQueryData(["project", project.id], p);
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success(project.published ? "Latest changes are live" : "Your app is live");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unpublish = useMutation({
    mutationFn: () => apiPost<Project>(`/projects/${project.id}/unpublish`),
    onSuccess: (p) => {
      qc.setQueryData(["project", project.id], p);
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("App unpublished");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button size="sm" className="k-press bg-[#0F766E] text-white hover:bg-[#0D6560]" data-testid="builder-publish-btn" disabled={!project.html}>
            <Globe className="size-3.5" />
            {project.published ? (project.has_unpublished_changes ? "Update" : "Published") : "Publish"}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-[340px] border border-[#E5E5E3] bg-white p-4 shadow-lg" data-testid="publish-popover">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium">{project.published ? "Your app is live" : "Publish your app"}</p>
            <p className="mt-0.5 text-xs text-[#666664]">
              {project.published
                ? project.has_unpublished_changes
                  ? "You have changes that aren't live yet."
                  : "Everything is up to date."
                : "Anyone with the link can use it, with your live data."}
            </p>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-[#666664]" htmlFor="slug-input">Link</label>
            <div className="flex items-center overflow-hidden rounded-lg border border-[#E5E5E3] focus-within:border-[#111111]">
              <span className="shrink-0 pl-2.5 font-mono text-xs text-[#9A9A97]">/app/</span>
              <Input
                id="slug-input"
                data-testid="publish-slug-input"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                className="h-8 border-0 pl-0.5 font-mono text-xs shadow-none focus-visible:ring-0"
              />
            </div>
            {!valid && <p className="mt-1 text-[11px] text-[#DC2626]">Use lowercase letters, numbers and single dashes.</p>}
          </div>
          <Button className="k-press w-full" disabled={!valid || publish.isPending} onClick={() => publish.mutate()} data-testid="publish-confirm-btn">
            {publish.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {project.published ? "Push latest changes live" : "Publish now"}
          </Button>
          {project.published && (
            <div className="space-y-2 border-t border-[#E5E5E3] pt-3">
              <div className="flex items-center gap-2 rounded-lg bg-[#F4F4F2] px-2.5 py-2">
                <span className="min-w-0 flex-1 truncate font-mono text-xs" data-testid="publish-live-url">{url}</span>
                <Button size="icon-xs" variant="ghost" aria-label="Copy link" onClick={() => copyText(url)} data-testid="publish-copy-btn">
                  <Copy className="size-3" />
                </Button>
                <a href={url} target="_blank" rel="noreferrer" aria-label="Open live app" data-testid="publish-open-link" className="text-[#111111] hover:text-[#0F766E]">
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
              <button type="button" onClick={() => unpublish.mutate()} disabled={unpublish.isPending} className="text-xs text-[#666664] hover:text-[#DC2626]" data-testid="unpublish-btn">
                Unpublish
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
