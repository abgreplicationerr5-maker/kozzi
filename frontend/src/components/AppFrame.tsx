import { useEffect, useMemo, useRef } from "react";
import { buildSrcDoc, errorMessage, handleOp, WRITE_OPS, type RuntimeTarget } from "@/lib/runtime";
import { cn } from "@/lib/utils";

interface Props {
  html: string;
  target: RuntimeTarget;
  title: string;
  className?: string;
  onWrite?: () => void;
  onAppError?: (message: string) => void;
  interactive?: boolean;
  testId?: string;
}

export default function AppFrame({ html, target, title, className, onWrite, onAppError, interactive = true, testId }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => buildSrcDoc(html), [html]);
  const targetKey = target.kind === "owner" ? target.projectId : target.slug;
  const cb = useRef({ onWrite, onAppError, target });
  cb.current = { onWrite, onAppError, target };

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      const frame = ref.current;
      if (!frame || e.source !== frame.contentWindow) return;
      const d = e.data as { __kozzi?: number; __kozziLog?: number; id?: number; op?: string; args?: Record<string, unknown>; message?: string };
      if (d?.__kozziLog) {
        cb.current.onAppError?.(d.message ?? "Script error");
        return;
      }
      if (!d?.__kozzi || typeof d.op !== "string") return;
      const reply = (payload: Record<string, unknown>) =>
        frame.contentWindow?.postMessage({ __kozziRes: 1, id: d.id, ...payload }, "*");
      try {
        const result = await handleOp(cb.current.target, d.op, d.args ?? {});
        reply({ ok: true, result });
        if (WRITE_OPS.has(d.op)) cb.current.onWrite?.();
      } catch (err) {
        reply({ ok: false, error: errorMessage(err) });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [targetKey]);

  return (
    <iframe
      ref={ref}
      title={title}
      data-testid={testId ?? "app-frame"}
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
      className={cn("h-full w-full border-0 bg-white", !interactive && "pointer-events-none", className)}
    />
  );
}
