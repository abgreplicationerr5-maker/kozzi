import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { apiPost } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export default function EnquiryDialog({ open, onOpenChange, defaultEmail = "" }: { open: boolean; onOpenChange: (o: boolean) => void; defaultEmail?: string }) {
  const [form, setForm] = useState({ name: "", email: defaultEmail, company: "", team_size: "51-200" as (typeof SIZES)[number], message: "" });
  const [done, setDone] = useState(false);
  const send = useMutation({
    mutationFn: () => apiPost("/enquiries", form),
    onSuccess: () => {
      setDone(true);
      toast.success("Thanks, we'll be in touch");
    },
    onError: notifyError,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDone(false); }}>
      <DialogContent className="bg-white sm:max-w-md" data-testid="enquiry-dialog">
        <DialogHeader>
          <DialogTitle>Talk to us about Enterprise</DialogTitle>
          <DialogDescription>50 seats, unlimited live apps, higher email limits and a plan set up for your company.</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center" data-testid="enquiry-done">
            <span className="flex size-9 items-center justify-center rounded-full bg-[#ECFDF5] text-[#0F766E]"><Check className="size-4" /></span>
            <p className="text-sm font-medium">Enquiry sent</p>
            <p className="text-sm text-[#666664]">We reply to {form.email} within one working day.</p>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="enq-name">Name</Label><Input id="enq-name" required value={form.name} onChange={set("name")} data-testid="enquiry-name-input" /></div>
              <div className="space-y-1.5"><Label htmlFor="enq-company">Company</Label><Input id="enq-company" required value={form.company} onChange={set("company")} data-testid="enquiry-company-input" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="enq-email">Work email</Label><Input id="enq-email" type="email" required value={form.email} onChange={set("email")} data-testid="enquiry-email-input" /></div>
            <div className="space-y-1.5">
              <Label>Team size</Label>
              <div className="flex flex-wrap gap-1.5" role="radiogroup">
                {SIZES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={form.team_size === s} onClick={() => setForm({ ...form, team_size: s })} data-testid={`enquiry-size-${s}`}
                    className={`k-press rounded-md border px-2.5 py-1 text-xs transition-colors duration-150 ${form.team_size === s ? "border-[#111111] bg-[#111111] text-white" : "border-[#E5E5E3] text-[#666664] hover:text-[#111111]"}`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="enq-msg">What do you need?</Label><Textarea id="enq-msg" rows={3} value={form.message} onChange={set("message")} data-testid="enquiry-message-input" /></div>
            <Button type="submit" className="k-press w-full" disabled={send.isPending} data-testid="enquiry-submit-btn">{send.isPending ? "Sending" : "Send enquiry"}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
