import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Show, useAuth } from "@clerk/react";
import { motion } from "motion/react";
import { ArrowRight, Check, Copy, Database, ExternalLink, Globe, Mail, MessageSquare } from "lucide-react";
import { useState } from "react";
import { apiGet } from "@/lib/api";
import type { GalleryApp, PublicApp } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import { buttonVariants } from "@/components/ui/button";
import Logo from "@/components/Logo";
import Footer from "@/components/Footer";
import PromptBox from "@/components/PromptBox";
import AppFrame from "@/components/AppFrame";
import { savePending } from "@/lib/pending";
import { useCreateProject, useDuplicateProject } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const IDEAS = [
  "A client tracker with deal values and status pipeline",
  "A reading list where I rate books and filter by genre",
  "A potluck sign-up sheet for our office party",
  "A workout log with weekly volume charts",
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    note: "for trying ideas",
    features: ["Unlimited projects", "Live database for every app", "Publish to a kozzi link", "Version history and a 30-day Bin"],
    cta: "Start building",
    plan: "free",
  },
  {
    name: "Pro",
    price: "$20",
    note: "per month",
    features: ["Everything in Free", "Priority AI generation", "Higher daily email limit", "No Kozzi badge on live apps"],
    cta: "Choose Pro",
    plan: "pro",
    featured: true,
  },
  {
    name: "Team",
    price: "$50",
    note: "per month, 5 seats",
    features: ["Everything in Pro", "Five seats on one bill", "Highest email limit", "Priority support"],
    cta: "Choose Team",
    plan: "team",
  },
];

function GalleryCard({ app }: { app: GalleryApp }) {
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

export default function Landing() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const create = useCreateProject();
  const [prompt, setPrompt] = useState("");
  const gallery = useQuery({ queryKey: ["gallery"], queryFn: () => apiGet<GalleryApp[]>("/public/gallery") });

  const start = (text: string) => {
    if (isSignedIn) create.mutate(text);
    else {
      savePending({ type: "prompt", prompt: text });
      navigate("/sign-up");
    }
  };

  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <header className="sticky top-0 z-30 border-b border-[#E5E5E3] bg-[#F9F9F8]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-6 text-sm text-[#666664] md:flex">
              <a href="#gallery" data-testid="nav-gallery-link" className="transition-colors hover:text-[#111111]">Gallery</a>
              <a href="#how" data-testid="nav-how-link" className="transition-colors hover:text-[#111111]">How it works</a>
              <a href="#pricing" data-testid="nav-pricing-link" className="transition-colors hover:text-[#111111]">Pricing</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Show when="signed-out">
              <Link to="/sign-in" data-testid="nav-signin-link" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "k-press")}>Sign in</Link>
              <Link to="/sign-up" data-testid="nav-signup-link" className={cn(buttonVariants({ size: "sm" }), "k-press")}>Get started</Link>
            </Show>
            <Show when="signed-in">
              <Link to="/dashboard" data-testid="nav-dashboard-link" className={cn(buttonVariants({ size: "sm" }), "k-press")}>
                Dashboard <ArrowRight className="size-3.5" />
              </Link>
            </Show>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="k-grid-bg pointer-events-none absolute inset-0 opacity-60" />
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto flex max-w-3xl flex-col items-center px-6 pb-20 pt-20 text-center sm:pt-28"
        >
          <h1 className="text-4xl font-medium leading-[1.06] tracking-tight text-[#111111] sm:text-5xl lg:text-6xl" data-testid="hero-title">
            Say what you need.
            <br />
            <span className="text-[#666664]">Ship the working app.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#666664] sm:text-lg">
            Kozzi writes the code, sets up live tables, runs your data and email commands, and publishes the app to a link anyone can use.
          </p>
          <div className="mt-10 w-full max-w-2xl">
            <PromptBox value={prompt} onChange={setPrompt} onSubmit={start} pending={create.isPending} testId="hero-prompt" />
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {IDEAS.map((idea, i) => (
                <button
                  key={idea}
                  type="button"
                  onClick={() => setPrompt(idea)}
                  data-testid={`hero-idea-${i}`}
                  className="k-press rounded-full border border-[#E5E5E3] bg-white px-3 py-1.5 text-xs text-[#666664] hover:border-[#111111]/30 hover:text-[#111111]"
                >
                  {idea}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      <section id="how" className="border-y border-[#E5E5E3] bg-white">
        <div className="mx-auto grid max-w-6xl gap-px bg-[#E5E5E3] sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: MessageSquare, t: "Describe it", d: "Chat with Kozzi like a teammate. Ask for features, layout or colour changes and watch the app update." },
            { icon: Database, t: "Real data, instantly", d: "Every app gets its own tables. Inspect, add and edit rows in a spreadsheet view while you build." },
            { icon: Mail, t: "Commands and email", d: "Ask Kozzi to add rows, clean up data, publish, or email you a summary. Your apps can send confirmations too." },
            { icon: Globe, t: "Publish in one click", d: "Pick a link and publish. Anyone with the URL can use the finished app, without any editing tools." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="bg-white p-8">
              <Icon className="size-5 text-[#0F766E]" strokeWidth={1.6} />
              <h3 className="mt-5 text-base font-medium tracking-tight">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#666664]">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="gallery" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-10 flex flex-col justify-between gap-3 md:flex-row md:items-end">
          <div>
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Gallery</h2>
            <p className="mt-1 text-sm text-[#666664]">Apps people built in Kozzi and chose to share.</p>
          </div>
          <p className="max-w-md text-sm text-[#666664]">Open one to use it for real, or make a copy to start from its design. Copies start with empty tables.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="gallery-grid">
          {gallery.isLoading &&
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="k-skeleton aspect-[4/3] rounded-xl" />)}
          {gallery.isError && (
            <p className="col-span-full rounded-xl border border-dashed border-[#E5E5E3] p-8 text-center text-sm text-[#666664]">
              The gallery couldn't load right now. Refresh to try again.
            </p>
          )}
          {gallery.data?.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-[#E5E5E3] bg-white p-8 text-center text-sm text-[#666664]" data-testid="gallery-empty">
              Nothing shared yet. Publish an app and switch on Show in the Kozzi gallery to list it here.
            </p>
          )}
          {gallery.data?.map((a) => <GalleryCard key={a.id} app={a} />)}
        </div>
      </section>

      <section id="pricing" className="border-t border-[#E5E5E3] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="mb-12 text-center">
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Simple plans that grow with you</h2>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {PLANS.map((p) => (
              <div
                key={p.name}
                data-testid={`pricing-plan-${p.plan}`}
                className={cn(
                  "k-card flex flex-col rounded-xl border bg-white p-6",
                  p.featured ? "border-[#111111]" : "border-[#E5E5E3]",
                )}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-medium">{p.name}</h3>
                </div>
                <p className="mt-4 text-3xl font-medium tracking-tight">
                  {p.price} <span className="text-sm font-normal text-[#666664]">{p.note}</span>
                </p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-[#0F766E]" /> {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to={isSignedIn ? "/dashboard" : `/sign-up?plan=${p.plan}`}
                  data-testid={`pricing-cta-${p.plan}`}
                  className={cn(buttonVariants({ variant: p.featured ? "default" : "outline" }), "k-press mt-8 w-full")}
                >
                  {p.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
