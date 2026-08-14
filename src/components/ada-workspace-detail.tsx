"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AdaEvidenceViewer } from "@/components/ada-evidence-viewer";
import { AdaFileUpload } from "@/components/ada-file-upload";

type Message = { id: string; concept_id: string; role: "user" | "assistant" | "system"; content: string };
type Asset = { id: string; concept_id: string | null; original_name: string; mime_type: string; byte_size: number; analysis_status: "uploading" | "uploaded" | "analyzing" | "ready" | "failed"; created_at: string };
type Detail = { workspace: { title: string; client_name: string | null }; concepts: Array<{ id: string }>; messages: Message[]; assets: Asset[] };

export function AdaWorkspaceDetail({ workspaceId }: { workspaceId: string }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const conceptId = detail?.concepts[0]?.id ?? "";
  const load = useCallback(async () => { setLoading(true); setError(null); const response = await fetch(`/api/ada/workspaces/${workspaceId}`); const result = await response.json().catch(() => ({})); if (!response.ok) { setDetail(null); setError(result.error ?? "Ada chat could not load."); } else setDetail(result); setLoading(false); }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);
  const messages = useMemo(() => detail?.messages.filter((message) => message.concept_id === conceptId) ?? [], [conceptId, detail]);
  async function sendMessage(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!draft.trim() || !conceptId) return; setSaving(true); const response = await fetch(`/api/ada/workspaces/${workspaceId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conceptId, content: draft }) }); const result = await response.json().catch(() => ({})); setSaving(false); if (!response.ok) { setError(result.error ?? "Message could not be saved."); return; } setDraft(""); await load(); }
  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading chat…</p>;
  if (error) return <div className="p-6"><p className="font-medium">Ada needs setup attention</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><button type="button" onClick={() => void load()} className="mt-3 rounded-md border border-border px-3 py-2 text-sm">Try again</button></div>;
  if (!detail) return null;
  return <div className="flex h-full min-w-0 text-left">{showEvidence && <AdaEvidenceViewer workspaceId={workspaceId} conceptId={conceptId} assets={detail.assets} onChanged={load} onClose={() => setShowEvidence(false)} />}<section aria-label="Persistent conversation" className="flex min-w-0 flex-1 flex-col"><header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-6"><div className="min-w-0"><h2 className="truncate text-sm font-semibold">{detail.workspace.title}</h2><p className="truncate text-xs text-muted-foreground">{detail.workspace.client_name || "Client not set"}</p></div><button type="button" aria-label="Open files" title="Open files" onClick={() => setShowEvidence(!showEvidence)} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">▣</button></header><div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"><div className="mx-auto max-w-3xl space-y-4">{messages.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Start with a scope, a sketch, or a file.</p> : messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${message.role === "user" ? "ml-auto bg-foreground text-background" : "border border-border bg-muted/45"}`}><p className="whitespace-pre-wrap">{message.content}</p></div>)}</div></div><form onSubmit={sendMessage} className="shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6"><div className="mx-auto grid max-w-3xl grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-border bg-muted/25 p-2 focus-within:ring-2 focus-within:ring-ring/30"><AdaFileUpload workspaceId={workspaceId} conceptId={conceptId} onUploaded={load} onUploadStart={() => setShowEvidence(true)} compact /><label className="sr-only" htmlFor="ada-message">Message Ada</label><textarea id="ada-message" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Let’s quote something..." rows={1} className="max-h-40 min-h-9 w-full resize-y bg-transparent px-2 py-1.5 text-sm outline-none" /><button aria-label="Send message" disabled={saving || !conceptId || !draft.trim()} type="submit" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-lg font-medium text-background disabled:opacity-50">↑</button></div></form></section></div>;
}
