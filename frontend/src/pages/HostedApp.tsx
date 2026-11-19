import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, apiGet } from "@/lib/api";
import type { PublicApp } from "@/lib/types";
import AppFrame from "@/components/AppFrame";
import { LogoMark } from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function HostedApp() {
  const { slug = "" } = useParams();
  const app = useQuery({
    queryKey: ["public-app", slug],
    queryFn: () => apiGet<PublicApp>(`/public/apps/${encodeURIComponent(slug)}`),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });

  useEffect(() => {
    if (app.data) document.title = app.data.title;
    return () => {
      document.title = "Kozzi — Build and host web apps from a prompt";
    };
  }, [app.data]);

  if (app.isLoading) return <div className="k-skeleton h-[100dvh] w-full" data-testid="hosted-loading" />;

  if (!app.data)
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F9F9F8] p-6 text-center" data-testid="hosted-not-found">
        <LogoMark className="size-8" />
        <p className="mt-2 text-lg font-medium">This app isn't available</p>
        <p className="max-w-sm text-sm text-[#666664]">
          {app.error instanceof ApiError && app.error.status === 404
            ? "The link may be mistyped, or the owner hasn't published it yet."
            : "We couldn't reach the server. Please try again in a moment."}
        </p>
        <Link to="/" className={cn(buttonVariants(), "k-press mt-2")} data-testid="hosted-home-link">Build your own with Kozzi</Link>
      </div>
    );

  return (
    <div className="relative h-[100dvh] w-full bg-white" data-testid="hosted-app">
      <AppFrame html={app.data.html} title={app.data.title} target={{ kind: "public", slug }} testId="hosted-frame" />
      <Link
        to="/"
        data-testid="hosted-kozzi-badge"
        className="k-press fixed bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-full border border-[#E5E5E3] bg-white/90 px-2.5 py-1 text-[11px] font-medium text-[#111111] shadow-sm backdrop-blur"
      >
        <LogoMark className="size-4 rounded" /> Built with Kozzi
      </Link>
    </div>
  );
}
