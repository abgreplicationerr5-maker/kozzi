import { toast } from "sonner";
import { ApiError, errorMessage } from "@/lib/api";

export function goTo(path: string) {
  window.dispatchEvent(new CustomEvent("kozzi:navigate", { detail: path }));
}

/** Error toast; plan-limit errors (402) offer a jump to the billing page. */
export function notifyError(e: unknown) {
  if (e instanceof ApiError && e.status === 402) {
    toast.error(errorMessage(e), { action: { label: "See plans", onClick: () => goTo("/billing") } });
    return;
  }
  toast.error(errorMessage(e));
}
