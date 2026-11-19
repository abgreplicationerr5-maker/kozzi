import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ClerkProvider, useAuth } from "@clerk/react";
import { setTokenGetter } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

const appearance = {
  variables: {
    colorPrimary: "#111111",
    colorPrimaryForeground: "#FFFFFF",
    colorBackground: "#FFFFFF",
    colorForeground: "#111111",
    colorInput: "#FFFFFF",
    colorInputForeground: "#111111",
    colorBorder: "#E5E5E3",
    fontFamily: "'Geist Variable', ui-sans-serif, system-ui, sans-serif",
    borderRadius: "0.6rem",
  },
};

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? "";

interface ClerkConfig {
  enabled: boolean;
  publishable_key: string;
  proxy_url: string;
}

// Registers Clerk's getToken with the fetch layer and clears cached data when the user changes.
function AuthBridge({ children }: { children: React.ReactNode }) {
  const { getToken, userId, isLoaded } = useAuth();
  setTokenGetter(() => getToken());
  const last = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!isLoaded) return;
    if (last.current !== undefined && last.current !== userId) queryClient.clear();
    last.current = userId ?? null;
  }, [userId, isLoaded]);
  return <>{children}</>;
}

export default function ClerkAuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [config, setConfig] = useState<ClerkConfig | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const cfg = (await (await fetch(`${BACKEND_URL}/api/clerk/config`)).json()) as ClerkConfig;
        if (cfg.enabled) {
          if (!cancelled) setConfig(cfg);
          return;
        }
      } catch {
        /* retry below */
      }
      if (cancelled) return;
      if (attempt >= 20) {
        setUnavailable(true);
        return;
      }
      setTimeout(() => load(attempt + 1), 1500);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (unavailable)
    return <p style={{ padding: 24 }}>Sign-in is unavailable right now. Refresh the page to try again.</p>;
  if (!config) return null;
  return (
    <ClerkProvider
      publishableKey={config.publishable_key}
      proxyUrl={config.proxy_url || undefined}
      appearance={appearance}
      routerPush={(to: string) => navigate(to)}
      routerReplace={(to: string) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/"
    >
      <AuthBridge>{children}</AuthBridge>
    </ClerkProvider>
  );
}
