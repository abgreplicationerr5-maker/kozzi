import { useState } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Props {
  onSubmit: (prompt: string) => void;
  pending?: boolean;
  placeholder?: string;
  value?: string;
  onChange?: (v: string) => void;
  size?: "lg" | "md";
  testId?: string;
  autoFocus?: boolean;
}

export default function PromptBox({ onSubmit, pending, placeholder, value, onChange, size = "lg", testId = "prompt", autoFocus }: Props) {
  const [local, setLocal] = useState("");
  const text = value ?? local;
  const setText = onChange ?? setLocal;
  const canSend = text.trim().length > 2 && !pending;

  const submit = () => {
    if (canSend) onSubmit(text.trim());
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      data-testid={`${testId}-form`}
      className={cn(
        "group relative w-full rounded-2xl border border-[#E5E5E3] bg-white text-left shadow-[0_1px_2px_rgba(0,0,0,0.03)]",
        "transition-[border-color,box-shadow] duration-200 hover:border-[#111111]/30 focus-within:border-[#111111] focus-within:shadow-[0_0_0_4px_rgba(17,17,17,0.05)]",
        size === "lg" ? "p-3" : "p-2",
      )}
    >
      <textarea
        data-testid={`${testId}-input`}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={size === "lg" ? 3 : 2}
        maxLength={8000}
        placeholder={placeholder ?? "Describe the app you want to build…"}
        className={cn(
          "block w-full resize-none bg-transparent px-2 pt-1 text-[#111111] placeholder:text-[#9A9A97] focus:outline-none",
          size === "lg" ? "min-h-[84px] text-base" : "min-h-[52px] text-[15px]",
        )}
      />
      <div className="flex items-center justify-between px-2 pt-1">
        <span className="font-mono text-[11px] text-[#9A9A97]">Enter to send · Shift+Enter for new line</span>
        <motion.button
          type="submit"
          data-testid={`${testId}-submit-btn`}
          disabled={!canSend}
          whileTap={{ scale: 0.92 }}
          whileHover={canSend ? { y: -1 } : undefined}
          transition={{ type: "spring", stiffness: 500, damping: 28 }}
          aria-label="Send prompt"
          className={cn(
            "inline-flex size-9 items-center justify-center rounded-lg transition-colors duration-150",
            canSend ? "bg-[#111111] text-white hover:bg-[#2A2A2A]" : "bg-[#F4F4F2] text-[#B5B5B2]",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
        </motion.button>
      </div>
    </form>
  );
}
