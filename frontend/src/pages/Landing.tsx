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
import GalleryCard from "@/components/GalleryCard";
import PlanCards, { IntervalToggle, type Interval } from "@/components/PlanCards";
import EnquiryDialog from "@/components/EnquiryDialog";
import { PLAN_INTENT_KEY, savePending } from "@/lib/pending";
import { useCreateProject, useDuplicateProject } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const IDEAS = [
  "A client tracker with deal values and status pipeline",
  "A reading list where I rate books and filter by genre",
  "A potluck sign-up sheet for our office party",
  "A workout log with weekly volume charts",
];


export default function Landing() {
  const navigate = useNavigate();
  const { isSignedIn } = useAuth();
  const create = useCreateProject();
  const [prompt, setPrompt] = useState("");
  const gallery = useQuery({ queryKey: ["gallery"], queryFn: () => apiGet<GalleryApp[]>("/public/gallery") });
  const [interval, setInterval] = useState<Interval>("month");
  const [enquiry, setEnquiry] = useState(false);
  const pickPlan = (plan: string) => {
    if (plan === "enterprise") return setEnquiry(true);
    if (plan === "free") return navigate(isSignedIn ? "/dashboard" : "/sign-up");
    const key = `${plan}_${interval === "month" ? "monthly" : "yearly"}`;
    if (isSignedIn) navigate(`/billing?plan=${key}`);
    else {
      localStorage.setItem(PLAN_INTENT_KEY, key);
      navigate("/sign-up");
    }
  };

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
        <div className="mx-auto max-w-6xl px-6 py-20">
          <div className="mb-10 flex flex-col items-center gap-4 text-center">
            <h2 className="text-2xl font-medium tracking-tight sm:text-3xl">Simple plans that grow with you</h2>
            <IntervalToggle value={interval} onChange={setInterval} />
          </div>
          <PlanCards interval={interval} onSelect={pickPlan} />
        </div>
      </section>
      <EnquiryDialog open={enquiry} onOpenChange={setEnquiry} />
      <Footer />
    </div>
  );
}
