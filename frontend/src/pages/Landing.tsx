import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Show, useAuth } from "@clerk/react";
import { motion } from "motion/react";
import { ArrowRight, Check, Copy, Database, ExternalLink, Globe, MessageSquare } from "lucide-react";
import { useState } from "react";
import { apiGet } from "@/lib/api";
import type { PublicApp, Sample } from "@/lib/types";
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
    features: ["Unlimited drafts", "Live database for every app", "Publish to a kozzi link", "Version history & restore"],
    cta: "Start building",
    plan: "free",
  },
  {
    name: "Pro",
    price: "$20",
    note: "per month",
    features: ["Everything in Free", "Priority AI generation", "Larger tables (25k rows)", "Remove Kozzi badge"],
    cta: "Choose Pro",
    plan: "pro",
    featured: true,
  },
  {
    name: "Team",
    price: "$50",
    note: "per month, 5 seats",
    features: ["Everything in Pro", "Shared workspace", "Role-based editing", "Priority support"],
    cta: "Choose Team",
    plan: "team",
  },
];

function SampleCard({ sample }: { sample: Sample }) {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const dup = useDuplicateProject(true);
  const { data } = useQuery({
    queryKey: ["public-app", sample.slug],
    queryFn: () => apiGet<PublicApp>(`/public/apps/${sample.slug}`),
  });

  const remix = () => {
    if (isSignedIn) dup.mutate(sample.id);
    else {
      savePending({ type: "remix", projectId: sample.id, title: sample.title });
      navigate("/sign-up");
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      data-testid={`sample-card-${sample.slug}`}
      className="k-card group overflow-hidden rounded-xl border border-[#E5E5E3] bg-white"
    >
      <Link to={`/app/${sample.slug}`} data-testid={`sample-open-preview-${sample.slug}`} className="relative block aspect-[16/10] overflow-hidden border-b border-[#E5E5E3] bg-[#F9F9F8]">
        {data?.html ? (
          <div className="absolute inset-0 origin-top-left scale-[0.5]" style={{ width: "200%", height: "200%" }}>
            <AppFrame html={data.html} target={{ kind: "public", slug: sample.slug }} title={sample.title} interactive={false} testId={`sample-frame-${sample.slug}`} />
          </div>
        ) : (
          <div className="k-skeleton absolute inset-0" />
        )}
        <span className="absolute inset-0 bg-transparent transition-colors duration-200 group-hover:bg-black/[0.02]" />
      </Link>
      <div className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-medium tracking-tight">{sample.title}</h3>
          <span className="shrink-0 rounded-full bg-[#ECFDF5] px-2 py-0.5 font-mono text-[11px] text-[#065F46]" data-testid={`sample-records-${sample.slug}`}>
            {sample.record_count} live rows
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-relaxed text-[#666664]">{sample.description}</p>
        <div className="flex gap-2 pt-1">
          <Link to={`/app/${sample.slug}`} data-testid={`sample-open-btn-${sample.slug}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "k-press")}>
            <ExternalLink className="size-3.5" /> Open app
          </Link>
          <button type="button" onClick={remix} disabled={dup.isPending} data-testid={`sample-remix-btn-${sample.slug}`} className={cn(buttonVariants({ size: "sm" }), "k-press")}>
            <Copy className="size-3.5" /> {dup.isPending ? "Copying…" : "Duplicate"}
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
  const samples = useQuery({ queryKey: ["samples"], queryFn: () => apiGet<Sample[]>("/public/samples") });

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
              <a href="#gallery" data-testid="nav-gallery-link" className="transition-colors hover:text-[#111111]">Samples</a>
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
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#E5E5E3] bg-white px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-[#666664]">
            <span className="size-1.5 rounded-full bg-[#0F766E]" /> Apps with a real database, hosted
          </span>
          <h1 className="text-4xl font-medium leading-[1.06] tracking-tight text-[#111111] sm:text-5xl lg:text-6xl" data-testid="hero-title">
            Say what you need.
            <br />
            <span className="text-[#666664]">Ship the working app.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#666664] sm:text-lg">
            Kozzi writes the code, wires up live tables, and publishes it to a link anyone can use — all from one sentence.
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
        <div className="mx-auto grid max-w-6xl gap-px bg-[#E5E5E3] md:grid-cols-3">
          {[
            { icon: MessageSquare, t: "Describe it", d: "Chat with Kozzi like a teammate. Ask for features, layout or colour changes and watch the app update." },
            { icon: Database, t: "Real data, instantly", d: "Every app gets its own tables. Inspect, add and edit rows in a spreadsheet view while you build." },
            { icon: Globe, t: "Publish in one click", d: "Pick a link, hit publish. Anyone with the URL can use the finished app — no editing tools in sight." },
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
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#666664]">Gallery</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Working apps, built in Kozzi</h2>
          </div>
          <p className="max-w-md text-sm text-[#666664]">Open any of these and use it for real — the rows you add are stored live. Duplicate one to make it your own.</p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3" data-testid="sample-gallery">
          {samples.isLoading &&
            Array.from({ length: 3 }).map((_, i) => <div key={i} className="k-skeleton aspect-[4/3] rounded-xl" />)}
          {samples.isError && (
            <p className="col-span-full rounded-xl border border-dashed border-[#E5E5E3] p-8 text-center text-sm text-[#666664]">
              The gallery couldn't load right now. Refresh to try again.
            </p>
          )}
          {samples.data?.length === 0 && (
            <p className="col-span-full rounded-xl border border-dashed border-[#E5E5E3] p-8 text-center text-sm text-[#666664]">
              Sample apps are being built. Check back in a minute.
            </p>
          )}
          {samples.data?.map((s) => <SampleCard key={s.id} sample={s} />)}
        </div>
      </section>

      <section id="pricing" className="border-t border-[#E5E5E3] bg-white">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="mb-12 text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#666664]">Pricing</p>
            <h2 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">Simple plans that grow with you</h2>
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
                  {p.featured && <span className="rounded-full bg-[#111111] px-2 py-0.5 text-[11px] text-white">Popular</span>}
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
