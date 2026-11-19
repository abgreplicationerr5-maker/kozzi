import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import ClerkAuthProvider from "@/components/auth/ClerkAuthProvider";
import RequireAuth from "@/components/RequireAuth";
import { Toaster } from "@/components/ui/sonner";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Builder from "@/pages/Builder";
import HostedApp from "@/pages/HostedApp";
import NotFound from "@/pages/NotFound";
import { SignInPage, SignUpPage } from "@/pages/AuthPages";

function Page({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

export default function App() {
  const location = useLocation();
  const top = location.pathname.split("/")[1] ?? "";
  return (
    <>
      <Routes>
        {/* Hosted apps render without Clerk so they load fast and stay free of Kozzi chrome */}
        <Route path="/app/:slug" element={<HostedApp />} />
        <Route
          path="*"
          element={
            <ClerkAuthProvider>
              <AnimatePresence mode="wait">
                <Routes location={location} key={top}>
                  <Route path="/" element={<Page><Landing /></Page>} />
                  <Route path="/sign-in/*" element={<Page><SignInPage /></Page>} />
                  <Route path="/sign-up/*" element={<Page><SignUpPage /></Page>} />
                  <Route path="/dashboard" element={<Page><RequireAuth><Dashboard /></RequireAuth></Page>} />
                  <Route path="/builder/:projectId" element={<Page><RequireAuth><Builder /></RequireAuth></Page>} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </AnimatePresence>
            </ClerkAuthProvider>
          }
        />
      </Routes>
      <Toaster position="bottom-right" />
    </>
  );
}
