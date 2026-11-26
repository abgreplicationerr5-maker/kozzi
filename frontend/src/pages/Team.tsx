import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Mail, UserMinus, UserPlus } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Me, Team, TeamRole } from "@/lib/types";
import { notifyError } from "@/lib/notify";
import PageShell from "@/components/PageShell";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLE_LABEL: Record<TeamRole, string> = { viewer: "View only", editor: "Can edit", publisher: "Can publish" };

function RoleSelect({ value, onChange, testId, disabled }: { value: TeamRole; onChange: (r: TeamRole) => void; testId: string; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as TeamRole)} data-testid={testId}
      title="View only: open and look. Can edit: chat, data and versions. Can publish: also publish, links and domains."
      className="h-9 shrink-0 rounded-md border border-[#E5E5E3] bg-white px-2 text-xs text-[#111111] disabled:opacity-50">
      {(Object.keys(ROLE_LABEL) as TeamRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
    </select>
  );
}

export default function TeamPage() {
  const qc = useQueryClient();
  const team = useQuery({ queryKey: ["team"], queryFn: () => apiGet<Team>("/team") });
  const me = useQuery({ queryKey: ["me"], queryFn: () => apiGet<Me>("/me") });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamRole>("editor");
  const done = (t?: Team) => {
    if (t) qc.setQueryData(["team"], t);
    else qc.invalidateQueries({ queryKey: ["team"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["billing"] });
  };
  const invite = useMutation({
    mutationFn: () => apiPost<Team>("/team/invites", { email, role }),
    onSuccess: (t) => { done(t); setEmail(""); toast.success("Invite saved"); },
    onError: notifyError,
  });
  const setMemberRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: TeamRole }) => apiPatch<Team>(`/team/members/${id}`, { role }),
    onSuccess: (t) => { done(t); toast.success("Role updated"); },
    onError: notifyError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/team/members/${id}`),
    onSuccess: () => { done(); toast.success("Removed from your team"); },
    onError: notifyError,
  });
  const leave = useMutation({
    mutationFn: (ownerId: string) => apiDelete(`/team/memberships/${ownerId}`),
    onSuccess: () => { done(); toast.success("You left the team"); },
    onError: notifyError,
  });
  const t = team.data;
  const inviteMail = (to: string) => {
    const who = me.data?.display_name || me.data?.email || "I";
    const body = `${who} added you to their Kozzi team. Create your account with this email address to open our shared projects:\n\n${window.location.origin}/sign-up`;
    return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent("Join my team on Kozzi")}&body=${encodeURIComponent(body)}`;
  };

  return (
    <PageShell title="Team" sub="Choose what each teammate can do: view only, edit, or also publish. Only you can delete projects or change billing.">
      {team.isLoading && <div className="k-skeleton h-40 rounded-xl" />}
      {t && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <section className="rounded-xl border border-[#E5E5E3] bg-white" data-testid="team-members">
            <div className="flex items-center justify-between border-b border-[#E5E5E3] px-5 py-4">
              <p className="text-sm font-medium">Your team</p>
              <p className="text-xs tabular-nums text-[#666664]" data-testid="team-seats">{t.used} of {t.seats} {t.seats === 1 ? "seat" : "seats"} used</p>
            </div>
            {t.seats <= 1 ? (
              <div className="p-6 text-sm text-[#666664]" data-testid="team-upgrade">
                Teammates come with the Team plan (5 seats) and Enterprise (50 seats).
                <Link to="/billing?plan=team_monthly" className={`${buttonVariants({ size: "sm" })} k-press ml-0 mt-3 flex w-fit`} data-testid="team-upgrade-btn">See the Team plan</Link>
              </div>
            ) : (
              <form className="flex gap-2 border-b border-[#E5E5E3] p-4" onSubmit={(e) => { e.preventDefault(); invite.mutate(); }}>
                <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" disabled={!t.can_invite} data-testid="team-invite-input" />
                <RoleSelect value={role} onChange={setRole} testId="team-invite-role" disabled={!t.can_invite} />
                <Button type="submit" className="k-press shrink-0" disabled={!t.can_invite || invite.isPending} data-testid="team-invite-btn"><UserPlus className="size-3.5" /> Invite</Button>
              </form>
            )}
            <ul className="divide-y divide-[#F0F0EE]">
              <li className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{me.data?.display_name || me.data?.email} <span className="text-xs text-[#9A9A97]">(you, owner)</span></span>
              </li>
              {t.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3 text-sm" data-testid={`team-member-${m.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{m.display_name || m.email}</p>
                    <p className="truncate text-xs text-[#9A9A97]">
                      {m.email} · {m.status === "active" ? `joined ${formatDistanceToNow(new Date(m.joined_at ?? m.created_at), { addSuffix: true })}` : "waiting for them to sign up"}
                    </p>
                  </div>
                  <RoleSelect value={m.role} onChange={(r) => setMemberRole.mutate({ id: m.id, role: r })} testId={`team-member-role-${m.id}`} disabled={setMemberRole.isPending} />
                  {m.status === "invited" && (
                    <a href={inviteMail(m.email)} className={`${buttonVariants({ variant: "ghost", size: "sm" })} k-press`} data-testid={`team-email-invite-${m.id}`}><Mail className="size-3.5" /> Email invite</a>
                  )}
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" className="k-press text-[#DC2626] hover:text-[#DC2626]" onClick={() => remove.mutate(m.id)} disabled={remove.isPending} data-testid={`team-remove-${m.id}`}>
                    <UserMinus className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-[#E5E5E3] bg-white" data-testid="team-memberships">
            <p className="border-b border-[#E5E5E3] px-5 py-4 text-sm font-medium">Teams you're on</p>
            {t.memberships.length === 0 ? (
              <p className="p-5 text-sm text-[#666664]" data-testid="team-memberships-empty">None yet. When someone invites your email, their projects appear on your dashboard.</p>
            ) : (
              <ul className="divide-y divide-[#F0F0EE]">
                {t.memberships.map((m) => (
                  <li key={m.owner_id} className="flex items-center gap-3 px-5 py-3 text-sm" data-testid={`team-membership-${m.owner_id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{m.owner_name}</p>
                      <p className="truncate text-xs text-[#9A9A97]">{m.active ? `${m.owner_email} · ${ROLE_LABEL[m.role]}` : "Their plan no longer includes teammates"}</p>
                    </div>
                    <Button variant="outline" size="sm" className="k-press" onClick={() => leave.mutate(m.owner_id)} disabled={leave.isPending} data-testid={`team-leave-${m.owner_id}`}>Leave</Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </PageShell>
  );
}
