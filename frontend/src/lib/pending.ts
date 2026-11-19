// Carries a visitor's intent (a prompt or a sample to remix) across sign-up.
const KEY = "kozzi_pending_intent";

export type Intent = { type: "prompt"; prompt: string } | { type: "remix"; projectId: string; title: string };

export function savePending(intent: Intent) {
  localStorage.setItem(KEY, JSON.stringify(intent));
}

// Reads AND clears in one step so a StrictMode double-effect can't act twice.
export function takePending(): Intent | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  localStorage.removeItem(KEY);
  try {
    return JSON.parse(raw) as Intent;
  } catch {
    return null;
  }
}
