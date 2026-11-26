import { Link } from "react-router-dom";
import { UserButton } from "@clerk/react";
import { ArrowLeft } from "lucide-react";
import Logo from "@/components/Logo";

export default function PageShell({ title, sub, children, actions }: { title: string; sub?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F9F9F8]">
      <header className="sticky top-0 z-20 border-b border-[#E5E5E3] bg-[#F9F9F8]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-4">
            <Logo to="/dashboard" />
            <Link to="/dashboard" className="hidden items-center gap-1 text-xs text-[#666664] hover:text-[#111111] sm:inline-flex" data-testid="page-back-link">
              <ArrowLeft className="size-3" /> Dashboard
            </Link>
          </div>
          <UserButton />
        </div>
      </header>
      <main className="k-rise mx-auto max-w-6xl px-5 py-10">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight" data-testid="page-title">{title}</h1>
            {sub && <p className="mt-1 text-sm text-[#666664]">{sub}</p>}
          </div>
          {actions}
        </div>
        {children}
      </main>
    </div>
  );
}
