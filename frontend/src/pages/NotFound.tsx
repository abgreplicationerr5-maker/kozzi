import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-[#F9F9F8] p-6 text-center" data-testid="not-found-page">
      <LogoMark className="size-8" />
      <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-[#666664]">404</p>
      <h1 className="text-2xl font-medium tracking-tight">This page doesn't exist</h1>
      <Link to="/" className={cn(buttonVariants(), "k-press mt-2")} data-testid="not-found-home-link">Go home</Link>
    </div>
  );
}
