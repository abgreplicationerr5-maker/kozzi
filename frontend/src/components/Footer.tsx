import { Link } from "react-router-dom";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer data-testid="site-footer" className="border-t border-[#E5E5E3] bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-[#666664]">
            Describe an app in plain words. Kozzi builds it, gives it a live database, and hosts it at a link you can share.
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#666664]">Product</p>
          <a href="/#gallery" data-testid="footer-gallery-link" className="block text-[#111111] hover:text-[#0F766E]">Sample apps</a>
          <a href="/#pricing" data-testid="footer-pricing-link" className="block text-[#111111] hover:text-[#0F766E]">Pricing</a>
          <a href="/#how" data-testid="footer-how-link" className="block text-[#111111] hover:text-[#0F766E]">How it works</a>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#666664]">Account</p>
          <Link to="/sign-up" data-testid="footer-signup-link" className="block text-[#111111] hover:text-[#0F766E]">Create account</Link>
          <Link to="/sign-in" data-testid="footer-signin-link" className="block text-[#111111] hover:text-[#0F766E]">Sign in</Link>
          <Link to="/dashboard" data-testid="footer-dashboard-link" className="block text-[#111111] hover:text-[#0F766E]">Dashboard</Link>
        </div>
        <div className="space-y-3 text-sm">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#666664]">Try</p>
          <Link to="/app/client-tracker" data-testid="footer-sample-client" className="block text-[#111111] hover:text-[#0F766E]">Client Tracker</Link>
          <Link to="/app/habit-log" data-testid="footer-sample-habit" className="block text-[#111111] hover:text-[#0F766E]">Habit Log</Link>
          <Link to="/app/inventory-manager" data-testid="footer-sample-inventory" className="block text-[#111111] hover:text-[#0F766E]">Inventory Manager</Link>
        </div>
      </div>
      <div className="border-t border-[#E5E5E3]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5 text-xs text-[#666664]">
          <span>© {new Date().getFullYear()} Kozzi</span>
          <span className="font-mono">Build · Store · Ship</span>
        </div>
      </div>
    </footer>
  );
}
