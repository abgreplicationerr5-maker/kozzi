import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex size-6 items-center justify-center rounded-md bg-[#111111] text-white", className)}
      aria-hidden
    >
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M4 2.5v11M12 2.5 6.5 8l5.5 5.5" />
      </svg>
    </span>
  );
}

export default function Logo({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} data-testid="logo-link" className={cn("inline-flex items-center gap-2 font-medium tracking-tight text-[#111111]", className)}>
      <LogoMark />
      <span className="text-[15px]">Kozzi</span>
    </Link>
  );
}
