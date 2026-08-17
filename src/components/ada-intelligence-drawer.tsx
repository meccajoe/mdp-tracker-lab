"use client";

import { useState } from "react";

type Evidence = { resource: string; sourceId: string; title: string; rationale: string; freshness?: string | null; confidence: string };

export function AdaIntelligenceDrawer({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [limitations, setLimitations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  async function search() {
    if (!query.trim()) return;
    setLoading(true);
    const response = await fetch(`/api/ada/workspaces/${workspaceId}/intelligence?query=${encodeURIComponent(query)}`);
    const result = await response.json().catch(() => ({}));
    setEvidence(result.evidence ?? []); setLimitations(result.limitations ?? []); setLoading(false);
  }
  return <aside aria-label="Tracker intelligence" className="flex h-full min-w-[22rem] flex-1 flex-col border-l border-border bg-background"><header className="flex h-14 items-center justify-between border-b border-border px-4"><div><p className="text-sm font-semibold">Intelligence</p><p className="text-xs text-muted-foreground">Cited Tracker evidence</p></div><button type="button" aria-label="Close intelligence" onClick={onClose} className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent">×</button></header><div className="border-b border-border p-3"><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Search materials or past work" className="h-9 min-w-0 flex-1 rounded-md border border-border px-2 text-sm" /><button type="button" onClick={() => void search()} className="rounded-md bg-foreground px-3 text-xs font-medium text-background">{loading ? "…" : "Search"}</button></div></div><div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">{limitations.map((limitation) => <p key={limitation} className="rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs">{limitation}</p>)}{evidence.map((item) => <article key={`${item.resource}-${item.sourceId}`} className="border-b border-border pb-3"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><span className="text-[10px] uppercase text-muted-foreground">{item.confidence}</span></div><p className="mt-1 text-xs text-muted-foreground">{item.rationale}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.resource}{item.freshness ? ` · ${item.freshness}` : ""}</p></article>)}{!loading && !evidence.length && !limitations.length ? <p className="pt-8 text-center text-sm text-muted-foreground">Search Tracker data to ground Ada’s recommendation.</p> : null}</div></aside>;
}
