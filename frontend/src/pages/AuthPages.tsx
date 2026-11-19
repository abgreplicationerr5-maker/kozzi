import { Link, useLocation } from "react-router-dom";
import { SignIn, SignUp } from "@clerk/react";
import Logo from "@/components/Logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Shell({ children, mode }: { children: React.ReactNode; mode: "in" | "up" }) {
  const pending = typeof window !== "undefined" && localStorage.getItem("kozzi_pending_intent");
  return (
    <div className="grid min-h-[100dvh] bg-[#F9F9F8] lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-[#E5E5E3] bg-white p-10 lg:flex">
        <div className="k-grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <Logo className="relative" />
        <div className="relative max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[#666664]">{mode === "up" ? "Create your account" : "Welcome back"}</p>
          <h1 className="mt-3 text-3xl font-medium leading-tight tracking-tight">
            {mode === "up" ? "Your first app is one sentence away." : "Pick up right where you left off."}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[#666664]">
            Projects, chat history, versions and live data are saved to your workspace automatically.
          </p>
        </div>
        <p className="relative font-mono text-[11px] text-[#9A9A97]">Build · Store · Ship</p>
      </aside>
      <main className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="lg:hidden"><Logo /></div>
        {pending && mode === "up" && (
          <p className="max-w-sm rounded-lg border border-[#E5E5E3] bg-white px-3 py-2 text-center text-xs text-[#666664]" data-testid="auth-pending-note">
            Create an account and we'll start building your app right away.
          </p>
        )}
        <div className="k-rise">{children}</div>
        <Link to="/" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-[#666664]")} data-testid="auth-back-home-link">← Back to Kozzi</Link>
      </main>
    </div>
  );
}

export function SignInPage() {
  const loc = useLocation();
  const redirect = new URLSearchParams(loc.search).get("redirect_url") || "/dashboard";
  return (
    <Shell mode="in">
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" withSignUp forceRedirectUrl={redirect} />
    </Shell>
  );
}

export function SignUpPage() {
  return (
    <Shell mode="up">
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </Shell>
  );
}
