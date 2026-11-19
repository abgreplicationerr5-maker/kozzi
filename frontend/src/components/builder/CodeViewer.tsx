import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import javascript from "highlight.js/lib/languages/javascript";
import "highlight.js/styles/github-dark.css";
import { Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/hooks";

hljs.registerLanguage("xml", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("javascript", javascript);

export default function CodeViewer({ html, filename }: { html: string; filename: string }) {
  const highlighted = useMemo(() => (html ? hljs.highlight(html, { language: "xml" }).value : ""), [html]);
  const lines = useMemo(() => (html ? html.split("\n").length : 0), [html]);

  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!html)
    return (
      <div className="flex h-full items-center justify-center p-8 text-sm text-[#666664]" data-testid="code-empty">
        No code yet. Describe your app in the chat to generate it.
      </div>
    );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-[#27272A] bg-[#18181B]" data-testid="code-viewer">
      <div className="flex items-center justify-between border-b border-[#27272A] px-4 py-2">
        <span className="font-mono text-xs text-[#A1A1AA]" data-testid="code-filename">
          {filename} <span className="ml-2 text-[#71717A]">{lines} lines</span>
        </span>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="k-press h-7 text-[#FAFAFA] hover:bg-white/10 hover:text-white" onClick={download} data-testid="code-download-btn">
            <Download className="size-3.5" /> Download
          </Button>
          <Button size="sm" variant="ghost" className="k-press h-7 text-[#FAFAFA] hover:bg-white/10 hover:text-white" onClick={() => copyText(html, "Code copied")} data-testid="code-copy-btn">
            <Copy className="size-3.5" /> Copy
          </Button>
        </div>
      </div>
      <div className="k-scroll flex-1 overflow-auto">
        <div className="flex min-w-max font-mono text-[12.5px] leading-[1.65]">
          <pre aria-hidden className="select-none border-r border-[#27272A] px-3 py-4 text-right text-[#52525B]">
            {Array.from({ length: lines }, (_, i) => i + 1).join("\n")}
          </pre>
          <pre className="px-4 py-4">
            <code className="hljs !bg-transparent !p-0" dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </div>
      </div>
    </div>
  );
}
