"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/constants";
import { PageShell } from "@/components/ui/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Project = { id: string; name: string; job_number: string | null };
type Labor = { qbo_entry_id: string; project_id: string; employee_name: string; date: string; reg_hours: number; ot_hours: number; hourly_rate: number; service_item: string | null };
type PreviewRow = { projectId: string; projectName: string; serviceItem: string; targetGlAccountId: string; targetGlAccountDisplay: string; workerClassification: string; hours: number; wageCost: number };
type TieOut = { summary: { sourceRows: number; includedRows: number; exceptionRows: number; sourceHours: number; includedHours: number; exceptionHours: number; sourceWageCost: number; includedWageCost: number; exceptionWageCost: number; balancedPopulation: boolean; balancedWageCost: boolean }; exceptions: Array<{ id: string; reason: string }> };
type Preview = { period: { startDate: string; endDate: string; label: string; fileKey: string }; rows: PreviewRow[]; totals: { wageCost: number; employeeWages: number; contractorWages: number }; journalEntry: { debitTotal: number; creditTotal: number; lines: Array<{ accountId: string; accountDisplay: string; projectId: string | null; projectName: string | null; memo: string; debit: number; credit: number }> }; tieOut: TieOut };

const iso = (date: Date) => date.toISOString().slice(0, 10);
const tableClass = "w-full min-w-[760px] text-sm [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_td]:px-3 [&_td]:py-2";

export default function LaborReconciliationPage() {
  const router = useRouter();
  const today = new Date();
  const [start, setStart] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [end, setEnd] = useState(iso(today));
  const [projectId, setProjectId] = useState("all");
  const [projects, setProjects] = useState<Project[]>([]);
  const [labor, setLabor] = useState<Labor[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);

  async function authenticatedFetch(url: string, init: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authentication required");
    return fetch(url, { ...init, credentials: "include", headers: { ...init.headers, Authorization: "Bearer " + session.access_token } });
  }

  async function load() {
    setLoading(true);
    const reviewParams = new URLSearchParams({ start, end });
    if (projectId !== "all") reviewParams.set("projectId", projectId);
    const [logs, review] = await Promise.all([
      authenticatedFetch(`/api/admin/labor-reconciliation?${reviewParams.toString()}`),
      authenticatedFetch(`/api/admin/labor-reconciliation/july-preview?${reviewParams.toString()}`),
    ]);
    const logsResult = await logs.json();
    const reviewResult = await review.json();
    if (!logs.ok || !review.ok) { toast.error(logsResult.error ?? reviewResult.error ?? "Could not load labor review."); setLoading(false); return; }
    setLabor(logsResult.labor); setProjects(logsResult.projects); setPreview(reviewResult); setLoading(false);
  }

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) { router.replace("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
    if (data?.role !== "admin") { router.replace("/"); return; }
    void load();
  })(); }, []);

  const total = useMemo(() => labor.reduce((sum, row) => sum + (row.reg_hours + row.ot_hours) * row.hourly_rate, 0), [labor]);
  function exportJe() {
    if (!preview) return;
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = ["Account ID,GL Account,Project ID,Project,Memo,Debit,Credit", ...preview.journalEntry.lines.map((line) => [line.accountId, line.accountDisplay, line.projectId, line.projectName, line.memo, line.debit.toFixed(2), line.credit.toFixed(2)].map(escape).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = `${preview.period.fileKey}-wage-allocation-je-review.csv`; link.click(); URL.revokeObjectURL(url);
  }
  async function exportReviewPackage() {
    const reviewParams = new URLSearchParams({ start, end });
    if (projectId !== "all") reviewParams.set("projectId", projectId);
    const response = await authenticatedFetch(`/api/admin/labor-reconciliation/july-review-package?${reviewParams.toString()}`);
    if (!response.ok) { toast.error("Could not export labor review package."); return; }
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a"); link.href = url; link.download = `${preview?.period.fileKey ?? "labor-review"}-labor-review-package.xlsx`; link.click(); URL.revokeObjectURL(url);
  }
  async function saveReviewDraft() {
    const response = await authenticatedFetch("/api/admin/labor-reconciliation/july-preview/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ start, end, projectId: projectId === "all" ? null : projectId }) });
    const result = await response.json();
    if (!response.ok) { toast.error(result.error ?? "Could not save review draft."); return; }
    toast.success(`Review-only draft ${result.draft.id} saved.`);
  }

  return <PageShell>
    <div><h1 className="text-2xl font-bold">Labor Reconciliation</h1><p className="mt-1 text-sm text-muted-foreground">Review-only QBO Time wage allocation. No QBO posting occurs here.</p></div>
    <Card><CardContent className="flex flex-wrap gap-3 pt-6"><Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-40" /><Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-40" /><Select value={projectId} onValueChange={(value) => setProjectId(value ?? "all")}><SelectTrigger className="w-72"><SelectValue placeholder="Selected project" /></SelectTrigger><SelectContent><SelectItem value="all">Selected project: All projects</SelectItem>{projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.job_number ?? project.id} · {project.name}</SelectItem>)}</SelectContent></Select><Button onClick={load} disabled={loading}>{loading ? "Loading…" : "Apply filters"}</Button></CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Labor logs</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{labor.length}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Wage cost</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCurrency(total)}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>{preview?.period.label ?? "Selected period"} allocation preview</CardTitle><p className="text-sm text-muted-foreground">Project, QBO Service Item, GL, and worker class. Review only.</p></CardHeader><CardContent>{preview && <><div className="grid gap-3 sm:grid-cols-3"><div>Employee wages <b>{formatCurrency(preview.totals.employeeWages)}</b></div><div>Contractor wages <b>{formatCurrency(preview.totals.contractorWages)}</b></div><div>Total wages <b>{formatCurrency(preview.totals.wageCost)}</b></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm"><span>Balanced JE: {formatCurrency(preview.journalEntry.debitTotal)} debits / {formatCurrency(preview.journalEntry.creditTotal)} credits</span><Button size="sm" variant="outline" onClick={saveReviewDraft}>Save review-only draft</Button><Button size="sm" variant="outline" onClick={exportReviewPackage}>Export review package</Button><Button size="sm" onClick={exportJe}>Export JE review CSV</Button></div><div className="mt-4 overflow-x-auto"><table className={tableClass}><thead><tr><th>Project</th><th>Service Item</th><th>GL Account</th><th>Class</th><th>Hours</th><th>Wages</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={`${row.projectId}-${row.serviceItem}-${row.workerClassification}`} className="border-b"><td>{row.projectName}</td><td>{row.serviceItem}</td><td>{row.targetGlAccountDisplay}</td><td>{row.workerClassification}</td><td>{row.hours.toFixed(2)}</td><td>{formatCurrency(row.wageCost)}</td></tr>)}</tbody></table></div></>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Tie-out controls</CardTitle><p className="text-sm text-muted-foreground">Every canonical source row in the selected period is included or has an explicit exception reason.</p></CardHeader><CardContent>{preview && <div className="grid gap-3 sm:grid-cols-3"><div>Source rows <b>{preview.tieOut.summary.sourceRows}</b></div><div>Included rows <b>{preview.tieOut.summary.includedRows}</b></div><div>Exception rows <b>{preview.tieOut.summary.exceptionRows}</b></div><div>Source wages <b>{formatCurrency(preview.tieOut.summary.sourceWageCost)}</b></div><div>Included wages <b>{formatCurrency(preview.tieOut.summary.includedWageCost)}</b></div><div>Exception wages <b>{formatCurrency(preview.tieOut.summary.exceptionWageCost)}</b></div></div>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Labor logs</CardTitle></CardHeader><CardContent className="p-0 overflow-x-auto"><table className={tableClass}><thead><tr><th>Date</th><th>Employee</th><th>Project</th><th>Service Item</th><th>Hours</th><th>Cost</th></tr></thead><tbody>{labor.map((row) => { const project = projects.find((candidate) => candidate.id === row.project_id); return <tr key={row.qbo_entry_id} className="border-b"><td>{row.date}</td><td>{row.employee_name}</td><td>{project?.name ?? row.project_id}</td><td>{row.service_item ?? "Unclassified"}</td><td>{(row.reg_hours + row.ot_hours).toFixed(2)}</td><td>{formatCurrency((row.reg_hours + row.ot_hours) * row.hourly_rate)}</td></tr>; })}</tbody></table></CardContent></Card>
  </PageShell>;
}
