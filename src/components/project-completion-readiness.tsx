"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPLETION_READINESS_ITEMS, type CompletionReadinessChecklist, type CompletionReadinessKey, type CompletionReadinessValue } from "@/lib/project-completion-readiness";

type Review = { checklist: CompletionReadinessChecklist; exception_notes: Partial<Record<CompletionReadinessKey, string>>; reviewed_by?: string | null; updated_at?: string | null };
type Readiness = { ready: boolean; pending: CompletionReadinessKey[]; exceptions: CompletionReadinessKey[] };

export function ProjectCompletionReadiness({ projectId }: { projectId: string }) {
  const [review, setReview] = useState<Review>({ checklist: {}, exception_notes: {} });
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void (async () => { const response = await fetch(`/api/projects/${projectId}/completion-readiness`, { cache: "no-store" }); const result = await response.json(); if (response.ok) { setReview(result.review); setReadiness(result.readiness); } else setMessage(result.error ?? "Could not load completion review."); })(); }, [projectId]);

  function setValue(key: CompletionReadinessKey, value: CompletionReadinessValue) { setReview((current) => ({ ...current, checklist: { ...current.checklist, [key]: value } })); }
  function setNote(key: CompletionReadinessKey, value: string) { setReview((current) => ({ ...current, exception_notes: { ...current.exception_notes, [key]: value } })); }
  async function save() { setSaving(true); setMessage(""); try { const response = await fetch(`/api/projects/${projectId}/completion-readiness`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ checklist: review.checklist, exception_notes: review.exception_notes }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save completion review."); setReview(result.review); setReadiness(result.readiness); setMessage(result.readiness.ready ? "Completion review is ready." : `${result.readiness.pending.length} review items remain.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save completion review."); } finally { setSaving(false); } }

  return <Card><CardHeader className="pb-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">Completion Readiness</CardTitle><p className="mt-1 text-sm text-muted-foreground">Confirm every closeout check or record an explicit exception before completion.</p></div><span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${readiness?.ready ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-amber-300 bg-amber-50 text-amber-800"}`}>{readiness?.ready ? "Ready to complete" : `${readiness?.pending.length ?? COMPLETION_READINESS_ITEMS.length} pending`}</span></div></CardHeader><CardContent className="space-y-3"><div className="divide-y rounded border">{COMPLETION_READINESS_ITEMS.map((item) => { const value = review.checklist[item.key] ?? "pending"; return <div key={item.key} className="grid gap-2 px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_170px] md:items-center"><div><p className="text-sm font-medium">{item.label}</p>{item.key === "production_issues" && <p className="text-xs text-muted-foreground">Use Confirmed to attest: No reportable issues, or confirm that all issues are logged.</p>}{value === "exception" && <input className="mt-2 w-full rounded border bg-background px-2 py-1.5 text-sm" placeholder="Exception reason required for review" value={review.exception_notes[item.key] ?? ""} onChange={(event) => setNote(item.key, event.target.value)} />}</div><select className="h-9 rounded border bg-background px-2 text-sm" value={value} onChange={(event) => setValue(item.key, event.target.value as CompletionReadinessValue)}><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="exception">Exception</option><option value="not_applicable">Not applicable</option></select></div>; })}</div><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{review.updated_at ? `Last reviewed ${new Date(review.updated_at).toLocaleString()} by ${review.reviewed_by ?? "unknown"}` : "Not reviewed yet."}</p><Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save review"}</Button></div>{message && <p className="text-sm text-muted-foreground">{message}</p>}</CardContent></Card>;
}
