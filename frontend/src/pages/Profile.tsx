import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { apiGet } from "@/lib/api";
import type { Profile } from "@/lib/types";
import Logo from "@/components/Logo";
import GalleryCard from "@/components/GalleryCard";
import NotFound from "@/pages/NotFound";

export default function ProfilePage() {
  const { username = "" } = useParams();
  const q = useQuery({ queryKey: ["profile", username], queryFn: () => apiGet<Profile>(`/public/profiles/${encodeURIComponent(username)}`), retry: false });
  if (q.isError) return <NotFound />;
  const p = q.data;
  const name = p?.display_name || (p ? `@${p.username}` : "");
  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <header className="flex h-14 items-center border-b border-[#E5E5E3] px-5"><Logo /></header>
      <main className="k-rise mx-auto max-w-5xl px-5 py-12">
        {!p ? <div className="k-skeleton h-28 rounded-xl" /> : (
          <>
            <div className="flex items-start gap-5" data-testid="profile-header">
              {p.avatar_url ? (
                <img src={p.avatar_url} alt="" className="size-16 rounded-full border border-[#E5E5E3] object-cover" data-testid="profile-avatar" />
              ) : (
                <span className="flex size-16 items-center justify-center rounded-full bg-[#111111] text-xl font-medium text-white" data-testid="profile-avatar">{name.replace("@", "")[0]?.toUpperCase()}</span>
              )}
              <div className="min-w-0">
                <h1 className="text-2xl font-medium tracking-tight" data-testid="profile-name">{name}</h1>
                <p className="text-sm text-[#666664]" data-testid="profile-username">@{p.username} · on Kozzi since {format(new Date(p.joined_at), "MMMM yyyy")}</p>
                {p.bio && <p className="mt-3 max-w-xl whitespace-pre-wrap text-sm leading-relaxed" data-testid="profile-bio">{p.bio}</p>}
              </div>
            </div>
            <h2 className="mb-5 mt-12 text-lg font-medium tracking-tight">Apps <span className="text-sm font-normal text-[#9A9A97]">{p.apps.length}</span></h2>
            {p.apps.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#E5E5E3] bg-white p-8 text-center text-sm text-[#666664]" data-testid="profile-apps-empty">No shared apps yet.</p>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3" data-testid="profile-apps">
                {p.apps.map((a) => <GalleryCard key={a.id} app={a} />)}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
