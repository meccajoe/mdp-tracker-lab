"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Postmortem = { id: string; status: string; generated_at: string; narrative: { executive_summary?: string; outcome?: string; data_gaps?: string[]; recommendations?: Array<{ recommendation: string }> } };
export function ProjectPostmortemCard({ projectId, status }: { projectId: string; status: string }) {
  const [postmortem, setPostmortem] = useState<Postmortem | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState("");
  async function load() { const response = await fetch(`/api/projects/${projectId}/postmortem`); const result = await response.json(); if (response.ok) setPostmortem(result.postmortem); }
  useEffect(() => { if (status === "Completed") void load(); }, [projectId, status]);
  async function generate() { setLoading(true); setError(""); const response = await fetch(`/api/projects/${projectId}/postmortem/generate`, { method: "POST" }); const result = await response.json(); if (!response.ok) setError(result.error ?? "Could not generate post-mortem."); else setPostmortem(result.postmortem); setLoading(false); }
  if (status !== "Completed") return null;
  const narrative = postmortem?.narrative ?? {};
  return <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>Project Post-Mortem</CardTitle><p className="mt-1 text-sm text-muted-foreground">Evidence-grounded closeout review. Drafts never change financial data.</p></div><Button onClick={generate} disabled={loading}>{loading ? "Generating…" : postmortem ? "Regenerate draft" : "Generate draft"}</Button></CardHeader><CardContent className="space-y-3">{error && <p className="text-sm text-red-600">{error}</p>}{!postmortem ? <p className="text-sm text-muted-foreground">No post-mortem draft yet.</p> : <><div className="flex items-center gap-2 text-sm"><span className="font-medium">Outcome:</span><span>{narrative.outcome ?? "Not classified"}</span><span className="text-muted-foreground">· Draft generated {new Date(postmortem.generated_at).toLocaleDateString()}</span></div><p className="whitespace-pre-wrap text-sm">{narrative.executive_summary ?? "No executive summary returned."}</p>{narrative.recommendations?.length ? <div><p className="mb-1 text-sm font-medium">Recommendations</p><ul className="list-disc space-y-1 pl-5 text-sm">{narrative.recommendations.slice(0, 5).map((item, index) => <li key={index}>{item.recommendation}</li>)}</ul></div> : null}{narrative.data_gaps?.length ? <div className="rounded bg-amber-50 p-3 text-sm text-amber-900"><span className="font-medium">Data gaps: </span>{narrative.data_gaps.join(" · ")}</div> : null}</>}</CardContent></Card>;
}
