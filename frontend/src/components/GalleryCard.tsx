import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { motion } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import { Copy, ExternalLink } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { GalleryApp, PublicApp } from "@/lib/types";
import { useDuplicateProject } from "@/lib/hooks";
import { savePending } from "@/lib/pending";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import AppFrame from "@/components/AppFrame";

export default function GalleryCard({ app }: { app: GalleryApp }) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const dup = useDuplicateProject(true);
  const { data } = useQuery({
    queryKey: ["public-app", app.slug],
    queryFn: () => apiGet<PublicApp>(`/public/apps/${app.slug}`),
  });

  const copy = () => {
    if (isSignedIn) dup.mutate(app.id);
    else {
      savePending({ type: "remix", projectId: app.id, title: app.title });
      navigate("/sign-up");
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      data-testid={`gallery-card-${app.slug}`}
      className="k-card group overflow-hidden rounded-xl border border-[#E5E5E3] bg-white"
    >
      <Link to={`/app/${app.slug}`} data-testid={`gallery-preview-${app.slug}`} className="relative block aspect-[16/10] overflow-hidden border-b border-[#E5E5E3] bg-[#F9F9F8]">
        {data?.html ? (
          <div className="absolute inset-0 origin-top-left scale-[0.5]" style={{ width: "200%", height: "200%" }}>
            <AppFrame html={data.html} target={{ kind: "public", slug: app.slug }} title={app.title} interactive={false} testId={`gallery-frame-${app.slug}`} />
          </div>
        ) : (
          <div className="k-skeleton absolute inset-0" />
        )}
        <span className="absolute inset-0 bg-transparent transition-colors duration-200 group-hover:bg-black/[0.02]" />
      </Link>
      <div className="space-y-3 p-5">
        <div>
          <h3 className="text-base font-medium tracking-tight" data-testid={`gallery-title-${app.slug}`}>{app.title}</h3>
          {app.owner_username && (
            <Link to={`/u/${app.owner_username}`} className="mt-0.5 inline-block text-xs text-[#666664] hover:text-[#0F766E]" data-testid={`gallery-owner-${app.slug}`}>
              by {app.owner_name || `@${app.owner_username}`}
            </Link>
          )}
          <p className="mt-0.5 text-[11px] text-[#9A9A97]" data-testid={`gallery-meta-${app.slug}`}>
            {app.record_count.toLocaleString()} rows · {app.views.toLocaleString()} views · published {formatDistanceToNow(new Date(app.updated_at), { addSuffix: true })}
          </p>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-[#666664]">{app.description}</p>
        <div className="flex gap-2 pt-1">
          <Link to={`/app/${app.slug}`} data-testid={`gallery-open-btn-${app.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "k-press")}>
            <ExternalLink className="size-3.5" /> Open app
          </Link>
          <button type="button" onClick={copy} disabled={dup.isPending} data-testid={`gallery-copy-btn-${app.slug}`} className={cn(buttonVariants({ size: "sm" }), "k-press")}>
            <Copy className="size-3.5" /> {dup.isPending ? "Copying" : "Make a copy"}
          </button>
        </div>
      </div>
    </motion.article>
  );
}
