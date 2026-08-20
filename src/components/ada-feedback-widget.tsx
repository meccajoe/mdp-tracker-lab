"use client";

import { FormEvent, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { adaFetch } from "@/lib/ada-client";

type Category = "bug" | "idea" | "confusing" | "other";

const OPTIONS: Array<{ value: Category; label: string }> = [
  { value: "bug", label: "Bug or problem" },
  { value: "idea", label: "Idea or request" },
  { value: "confusing", label: "Something confusing" },
  { value: "other", label: "Other feedback" },
];

export function AdaFeedbackWidget({ workspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError(null);
    const response = await adaFetch("/api/ada/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, message, workspaceId: workspaceId ?? null, pagePath: pathname }),
    });
    const result = await response.json().catch(() => ({}));
    setSending(false);
    if (!response.ok) {
      setError(result.error ?? "Feedback could not be saved.");
      return;
    }
    setMessage("");
    setSent(true);
  }

  function openForm() {
    setOpen(true);
    setSent(false);
    setError(null);
  }

  return <>
    <button type="button" aria-label="Send feedback" onClick={openForm} className="fixed bottom-4 left-4 z-40 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-3 text-xs font-medium shadow-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span aria-hidden="true" className="text-base">◌</span><span>Feedback</span>
    </button>
    {open ? <section role="dialog" aria-modal="false" aria-label="Send Ada feedback" className="fixed bottom-16 left-4 z-50 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-border bg-background p-4 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">Send feedback</h2><p className="mt-1 text-xs text-muted-foreground">Share a problem, confusing moment, or idea while it is fresh.</p></div><button type="button" aria-label="Close feedback" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-muted-foreground hover:bg-accent">×</button></div>
      {sent ? <div role="status" className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900"><p className="font-medium">Feedback saved. Thank you.</p><button type="button" onClick={() => setOpen(false)} className="mt-3 rounded border border-emerald-400 px-3 py-1.5 text-xs font-medium">Done</button></div> : <form onSubmit={submit} className="mt-4 space-y-3">
        <label className="block text-xs font-medium">Type<select value={category} onChange={(event) => setCategory(event.target.value as Category)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm">{OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="block text-xs font-medium">What happened or what would help?<textarea autoFocus required maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} rows={5} placeholder="Include what you were trying to do and what you expected." className="mt-1 w-full resize-y rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring/30" /></label>
        <div className="flex items-center justify-between gap-3"><span className="text-[11px] text-muted-foreground">{message.length}/2000</span><button disabled={sending || !message.trim()} type="submit" className="rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background disabled:opacity-50">{sending ? "Sending…" : "Send feedback"}</button></div>
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      </form>}
    </section> : null}
  </>;
}
