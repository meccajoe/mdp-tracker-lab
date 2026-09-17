"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/constants";
import { formatDateTimeCentral } from "@/lib/date-utils";
import { buildReconciliationGuidance } from "@/lib/financial-reconciliation-guidance";
import type { FinancialReconciliationPayload, FinancialReconciliationQueueRow } from "@/lib/financial-reconciliation-server";
import { supabase } from "@/lib/supabase";

type QueueFilter = "all" | "needs_action" | "waiting_for_fresh_qbo" | "ready";
type CaseEvent = Record<string, unknown> & { payload?: { comment?: unknown } };
type CaseDetail = { reconciliationCase: Record<string, unknown>; events: CaseEvent[] };
type CaseDraft = { status: string; ownerEmail: string; comment: string; resolutionCode: string; resolutionNotes: string };

const CATEGORY_LABELS: Record<string, string> = {
  stale_qbo_data: "QBO data needs updating", missing_qbo_actuals: "QBO totals unavailable", missing_tracker_contract: "Contract value missing",
  missing_labor_rate: "Labor cost incomplete", revenue_variance: "Revenue needs review", cost_variance: "Cost needs review", within_tolerance: "No review needed",
};
const STATUS_LABELS: Record<string, string> = {
  new: "New", assigned: "Assigned", investigating: "Investigating", waiting_on_pm: "Waiting on PM", waiting_on_accounting: "Waiting on accounting",
  resolved: "Resolved", needs_action: "Needs review", waiting_for_fresh_qbo: "Needs updated data", ready: "No action needed",
};

function todayCentral(): string { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function signedCurrency(value: number | null): string { return value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${formatCurrency(value)}`; }
function freshnessLabel(row: FinancialReconciliationQueueRow): string { return row.freshness.status === "never_synced" ? "Never synced" : row.freshness.status === "stale" ? "Out of date" : "Current"; }
function rowStatus(row: FinancialReconciliationQueueRow): string { return row.caseState?.status ?? row.queueStatus; }
function effectiveCategory(row: FinancialReconciliationQueueRow): string { return row.caseState?.category ?? row.category; }
function statusBadgeClass(status: string): string {
  if (["needs_action", "new", "investigating"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  if (["waiting_for_fresh_qbo", "waiting_on_pm", "waiting_on_accounting"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (["ready", "resolved"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-border bg-muted text-foreground";
}
function severityLabel(row: FinancialReconciliationQueueRow): string { return row.severity === "critical" ? "High impact" : row.severity === "high" ? "Important" : "Review"; }

export default function ReconciliationPage() {
  const router = useRouter();
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<FinancialReconciliationPayload | null>(null);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [saving, setSaving] = useState(false); const [authorized, setAuthorized] = useState(false);
  const [asOfDate, setAsOfDate] = useState(todayCentral()); const [search, setSearch] = useState(""); const [queueFilter, setQueueFilter] = useState<QueueFilter>("needs_action");
  const [projectStatus, setProjectStatus] = useState("Active"); const [category, setCategory] = useState("all"); const [owner, setOwner] = useState("all"); const [freshness, setFreshness] = useState("all"); const [materialOnly, setMaterialOnly] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null); const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [draft, setDraft] = useState<CaseDraft>({ status: "new", ownerEmail: "", comment: "", resolutionCode: "", resolutionNotes: "" });

  const authenticatedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authentication required");
    return fetch(url, { ...init, credentials: "include", cache: "no-store", headers: { ...init.headers, Authorization: "Bearer " + session.access_token } });
  }, []);

  const loadQueue = useCallback(async (date: string) => {
    const requestId = ++requestIdRef.current; setLoading(true);
    try {
      const response = await authenticatedFetch(`/api/admin/reconciliation?asOfDate=${encodeURIComponent(date)}`); const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not load Accounting Review."); if (requestId !== requestIdRef.current) return; setPayload(result as FinancialReconciliationPayload);
    } finally { if (requestId === requestIdRef.current) setLoading(false); }
  }, [authenticatedFetch]);

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession(); if (!session?.user?.email) { router.replace("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email.toLowerCase()).maybeSingle(); if (data?.role !== "admin") { router.replace("/"); return; } setAuthorized(true);
  })().catch(() => router.replace("/login")); }, [router]);
  useEffect(() => { if (authorized) loadQueue(asOfDate).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load Accounting Review.")); }, [asOfDate, authorized, loadQueue]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (payload?.rows ?? []).filter((row) => {
      const status = rowStatus(row); if (queueFilter !== "all" && status !== queueFilter && row.queueStatus !== queueFilter) return false;
      if (projectStatus !== "all" && row.project.status !== projectStatus) return false; if (category !== "all" && effectiveCategory(row) !== category) return false;
      if (owner !== "all" && (row.caseState?.ownerEmail ?? row.projectOwnerEmail ?? "unassigned") !== owner) return false;
      if (freshness !== "all" && row.freshness.status !== freshness) return false;
      if (materialOnly && !row.revenueVariance.material && !row.costVariance.material) return false;
      const haystack = [row.project.id, row.project.jobNumber, row.project.name, row.project.client, row.project.owner].filter(Boolean).join(" ").toLowerCase(); return !needle || haystack.includes(needle);
    });
  }, [category, freshness, materialOnly, owner, payload, projectStatus, queueFilter, search]);
  const expandedRow = useMemo(() => payload?.rows.find((row) => row.project.id === expandedProjectId) ?? null, [expandedProjectId, payload]);

  useEffect(() => {
    if (!expandedRow) { setCaseDetail(null); return; }
    setDraft({ status: expandedRow.caseState?.status ?? "new", ownerEmail: expandedRow.caseState?.ownerEmail ?? "", comment: "", resolutionCode: expandedRow.caseState?.resolutionCode ?? "", resolutionNotes: expandedRow.caseState?.resolutionNotes ?? "" });
    if (!expandedRow.caseState?.id) { setCaseDetail(null); return; }
    authenticatedFetch(`/api/admin/reconciliation/cases/${expandedRow.caseState.id}`).then(async (response) => { const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? "Could not load review history."); setCaseDetail(result as CaseDetail); }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load review history."));
  }, [authenticatedFetch, expandedRow]);

  async function refreshQboAndReview() {
    setRefreshing(true); const requestId = ++requestIdRef.current;
    try {
      const qboResponse = await authenticatedFetch(`/api/reports/wip/live?asOfDate=${encodeURIComponent(asOfDate)}&forceRefresh=1`); const qboResult = await qboResponse.json().catch(() => ({})); if (!qboResponse.ok) throw new Error(qboResult.error ?? "Could not refresh QBO actuals.");
      const scanResponse = await authenticatedFetch("/api/admin/reconciliation/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asOfDate }) }); const scanResult = await scanResponse.json().catch(() => ({})); if (!scanResponse.ok) throw new Error(scanResult.error ?? "Could not refresh the review queue.");
      if (requestId !== requestIdRef.current) return; setPayload(scanResult as FinancialReconciliationPayload); toast.success(`Review refreshed for ${scanResult.scan?.scanned ?? 0} projects.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not refresh Accounting Review."); } finally { if (requestId === requestIdRef.current) setRefreshing(false); }
  }
  async function saveCase() {
    if (!expandedRow?.caseState) return; setSaving(true);
    try {
      const response = await authenticatedFetch(`/api/admin/reconciliation/cases/${expandedRow.caseState.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowVersion: expandedRow.caseState.rowVersion, status: draft.status, ownerEmail: draft.ownerEmail, comment: draft.comment, resolutionCode: draft.status === "resolved" ? draft.resolutionCode : undefined, resolutionNotes: draft.status === "resolved" ? draft.resolutionNotes : undefined }) });
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? "Could not save the review item."); await loadQueue(asOfDate); toast.success("Review item saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the review item."); } finally { setSaving(false); }
  }
  function toggleExpanded(row: FinancialReconciliationQueueRow) { setExpandedProjectId((current) => current === row.project.id ? null : row.project.id); }
  function resetFilters() { setSearch(""); setQueueFilter("needs_action"); setProjectStatus("Active"); setCategory("all"); setOwner("all"); setFreshness("all"); setMaterialOnly(false); }
  if (!authorized) return null;

  return <PageShell>
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-bold">Accounting Review</h1><p className="mt-1 text-base font-medium text-foreground">Projects that need a financial check</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Start with the explanation and recommended next step. Open a project only when you need the numbers behind the review.</p></div><div className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-xs text-muted-foreground"><span>Review through</span><Input type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} className="w-40" /></label><Button onClick={refreshQboAndReview} disabled={refreshing || loading}>{refreshing ? "Refreshing from QBO…" : "Refresh QBO & review"}</Button></div></header>

    <section className="grid gap-0 overflow-hidden rounded-md border bg-muted/20 md:grid-cols-3"><SourceLesson step="1 · Accounting record" title="QBO is the accounting record">It holds the billed revenue and accounting costs used for financial reporting.</SourceLesson><SourceLesson step="2 · Project evidence" title="Tracker explains the project activity behind it">It shows contract value, imported expenses, hours, and verified direct wages.</SourceLesson><SourceLesson step="3 · Review the reason" title="These numbers are expected to differ sometimes">The row explains what the gap likely means and the first check to make. A difference alone is not an accounting error.</SourceLesson></section>

    <div className="flex flex-wrap items-center gap-2 border-y py-3"><QueueTab active={queueFilter === "needs_action"} onClick={() => setQueueFilter("needs_action")} label="Needs review" count={payload?.counts.needsAction ?? 0} /><QueueTab active={queueFilter === "waiting_for_fresh_qbo"} onClick={() => setQueueFilter("waiting_for_fresh_qbo")} label="Needs updated data" count={payload?.counts.waitingForFreshQbo ?? 0} /><QueueTab active={queueFilter === "ready"} onClick={() => setQueueFilter("ready")} label="No action needed" count={payload?.counts.ready ?? 0} /><QueueTab active={queueFilter === "all"} onClick={() => setQueueFilter("all")} label="All projects" count={payload?.counts.total ?? 0} /><span className="ml-auto text-xs text-muted-foreground">QBO updated: {payload?.sourceFreshness.latestQboSyncAt ? formatDateTimeCentral(payload.sourceFreshness.latestQboSyncAt) : "not available"}</span></div>

    <section className="space-y-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-end"><label className="min-w-0 flex-1 space-y-1 text-xs text-muted-foreground"><span>Search</span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search project, job number, client, or PM" /></label><FilterSelect label="Project status" value={projectStatus} onChange={setProjectStatus} options={[["Active", "Active"], ["Completed", "Completed"], ["On Hold", "On Hold"], ["all", "All"]]} /><FilterSelect label="Assigned to" value={owner} onChange={setOwner} options={[["all", "Everyone"], ["unassigned", "Unassigned"], ...(payload?.ownerOptions.map((option) => [option.email, option.name] as [string, string]) ?? [])]} /></div><details className="text-sm"><summary className="cursor-pointer font-medium text-muted-foreground">More filters</summary><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"><FilterSelect label="Reason" value={category} onChange={setCategory} options={[["all", "All reasons"], ...Object.entries(CATEGORY_LABELS)]} /><FilterSelect label="Freshness filter" value={freshness} onChange={setFreshness} options={[["all", "All data"], ["fresh", "Current"], ["stale", "Out of date"], ["never_synced", "Never synced"]]} /><label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" checked={materialOnly} onChange={(event) => setMaterialOnly(event.target.checked)} /> Only material variances</label><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button></div></details></section>

    <Card className="w-full min-w-0 max-w-full overflow-hidden"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">Project review list</h2><p className="text-xs text-muted-foreground">Showing {filteredRows.length} projects</p></div><p className="hidden text-xs text-muted-foreground sm:block">Open a row for the explanation, source numbers, and review workflow.</p></div>{loading ? <p className="py-16 text-center text-sm text-muted-foreground">Loading Accounting Review…</p> : filteredRows.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">No projects match these filters.</p> : <ReviewTable rows={filteredRows} expandedProjectId={expandedProjectId} toggleExpanded={toggleExpanded} payload={payload} draft={draft} setDraft={setDraft} caseDetail={caseDetail} saving={saving} saveCase={saveCase} closeExpanded={() => setExpandedProjectId(null)} />}</Card>
  </PageShell>;
}

function SourceLesson({ step, title, children }: { step: string; title: string; children: React.ReactNode }) { return <div className="border-b p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{step}</p><p className="mt-1 text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{children}</p></div>; }
function QueueTab({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) { return <button type="button" onClick={onClick} className={`rounded-md border px-3 py-2 text-sm transition-colors ${active ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-muted"}`}><span className="font-medium">{label}</span><span className={`ml-2 ${active ? "text-background/70" : "text-muted-foreground"}`}>{count}</span></button>; }
function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <label className="min-w-[160px] space-y-1 text-xs text-muted-foreground"><span>{label}</span><select className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>; }
function ownerName(row: FinancialReconciliationQueueRow, payload: FinancialReconciliationPayload | null): string { const email = row.caseState?.ownerEmail ?? row.projectOwnerEmail; if (!email) return "Unassigned"; return payload?.ownerOptions.find((option) => option.email === email)?.name ?? email; }

function ReviewTable({ rows, expandedProjectId, toggleExpanded, payload, draft, setDraft, caseDetail, saving, saveCase, closeExpanded }: { rows: FinancialReconciliationQueueRow[]; expandedProjectId: string | null; toggleExpanded: (row: FinancialReconciliationQueueRow) => void; payload: FinancialReconciliationPayload | null; draft: CaseDraft; setDraft: (draft: CaseDraft) => void; caseDetail: CaseDetail | null; saving: boolean; saveCase: () => void; closeExpanded: () => void }) {
  return <><div data-slot="reconciliation-mobile-list" className="divide-y lg:hidden">{rows.map((row) => { const guidance = buildReconciliationGuidance(row); const isExpanded = expandedProjectId === row.project.id; return <div key={row.project.id} className="p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{row.project.name}</p><p className="text-xs text-muted-foreground">#{row.project.jobNumber ?? row.project.id} · {row.project.client}</p></div><Badge variant="outline" className={statusBadgeClass(rowStatus(row))}>{STATUS_LABELS[rowStatus(row)] ?? rowStatus(row)}</Badge></div><p className="mt-3 text-sm font-semibold">{guidance.headline}</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{guidance.explanation}</p><div className="mt-3 rounded-md bg-muted/50 p-3 text-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended next step</p><p className="mt-1">{guidance.recommendedAction}</p></div><div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span>PM: {row.project.owner ?? "Unassigned"}</span><span>Assigned: {ownerName(row, payload)}</span></div><Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => toggleExpanded(row)}>{isExpanded ? "Hide review" : "Review project"}</Button>{isExpanded && <div className="mt-4 border-t pt-4"><button type="button" className="mb-3 text-sm font-medium underline underline-offset-2" onClick={closeExpanded}>← Back to queue</button><ExpandedReview row={row} payload={payload} draft={draft} setDraft={setDraft} caseDetail={caseDetail} saving={saving} saveCase={saveCase} /></div>}</div>; })}</div><div data-slot="reconciliation-desktop-table" className="hidden lg:block overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-[230px]">Project</TableHead><TableHead className="w-[130px]">PM</TableHead><TableHead className="w-[145px]">Review status</TableHead><TableHead className="min-w-[230px]">What needs attention</TableHead><TableHead className="min-w-[300px]">What it likely means</TableHead><TableHead className="w-[150px]">Assigned to</TableHead><TableHead className="w-[125px]"></TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => { const guidance = buildReconciliationGuidance(row); const isExpanded = expandedProjectId === row.project.id; return <Fragment key={row.project.id}><TableRow className={isExpanded ? "bg-muted/40" : "hover:bg-muted/30"}><TableCell><Link href={`/projects/${row.project.id}`} className="font-medium hover:underline">{row.project.name}</Link><p className="mt-0.5 text-xs text-muted-foreground">#{row.project.jobNumber ?? row.project.id} · {row.project.client}</p></TableCell><TableCell>{row.project.owner ?? "Unassigned"}</TableCell><TableCell><Badge variant="outline" className={statusBadgeClass(rowStatus(row))}>{STATUS_LABELS[rowStatus(row)] ?? rowStatus(row)}</Badge><p className="mt-1 text-xs text-muted-foreground">{severityLabel(row)}</p></TableCell><TableCell><p className="font-medium">{guidance.headline}</p><p className="mt-1 text-xs text-muted-foreground">{CATEGORY_LABELS[effectiveCategory(row)]}</p></TableCell><TableCell><p className="text-sm leading-5 text-muted-foreground">{guidance.explanation}</p></TableCell><TableCell>{ownerName(row, payload)}</TableCell><TableCell className="text-right"><Button type="button" variant={isExpanded ? "secondary" : "outline"} size="sm" onClick={() => toggleExpanded(row)}>{isExpanded ? "Hide review" : "Review project"}</Button></TableCell></TableRow>{isExpanded && <TableRow className="bg-muted/20 hover:bg-muted/20"><TableCell colSpan={7} className="p-0"><div className="border-t p-5"><ExpandedReview row={row} payload={payload} draft={draft} setDraft={setDraft} caseDetail={caseDetail} saving={saving} saveCase={saveCase} /></div></TableCell></TableRow>}</Fragment>; })}</TableBody></Table></div></>;
}

function ExpandedReview({ row, payload, draft, setDraft, caseDetail, saving, saveCase }: { row: FinancialReconciliationQueueRow; payload: FinancialReconciliationPayload | null; draft: CaseDraft; setDraft: (draft: CaseDraft) => void; caseDetail: CaseDetail | null; saving: boolean; saveCase: () => void }) {
  const guidance = buildReconciliationGuidance(row);
  return <div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reviewing</p><h3 className="mt-1 text-lg font-semibold">{row.project.name}</h3><p className="text-sm text-muted-foreground">#{row.project.jobNumber ?? row.project.id} · {row.project.client} · PM: {row.project.owner ?? "Unassigned"}</p></div><Link href={`/projects/${row.project.id}`} className="text-sm font-medium underline underline-offset-2">Open full project</Link></div><div className="grid gap-6 xl:grid-cols-[1.2fr_1fr_0.9fr]"><section className="space-y-4"><div><h4 className="text-sm font-semibold">Plain-English explanation</h4><p className="mt-2 text-sm leading-6">{guidance.explanation}</p></div><div><h4 className="text-sm font-semibold">Common reasons this happens</h4>{guidance.likelyCauses.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Update the source data before interpreting the difference.</p> : <ul className="mt-2 space-y-2 text-sm text-muted-foreground">{guidance.likelyCauses.map((cause) => <li key={cause} className="flex gap-2"><span aria-hidden="true">•</span><span>{cause}</span></li>)}</ul>}</div><div className="rounded-md border-l-4 border-l-[#990100] bg-background p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommended next step</p><p className="mt-1 text-sm font-medium leading-6">{guidance.recommendedAction}</p></div></section><NumbersBehindReview row={row} /><section><Workflow row={row} payload={payload} draft={draft} setDraft={setDraft} saving={saving} saveCase={saveCase} />{caseDetail && <div className="mt-5 border-t pt-4"><h4 className="text-sm font-semibold">Review history</h4><div className="mt-2 space-y-2">{caseDetail.events.length === 0 ? <p className="text-sm text-muted-foreground">No history yet.</p> : caseDetail.events.map((event, index) => { const comment = event.payload?.comment; return <div key={String(event.id ?? index)} className="rounded-md bg-muted/50 p-3 text-xs"><div className="font-medium">{String(event.event_type ?? "Update")}</div><div className="mt-1 text-muted-foreground">{String(event.created_at ?? "")}</div>{typeof comment === "string" && comment && <p className="mt-2 text-sm text-foreground">{comment}</p>}</div>; })}</div></div>}</section></div></div>;
}

function NumbersBehindReview({ row }: { row: FinancialReconciliationQueueRow }) { return <section><h4 className="text-sm font-semibold">Numbers behind this review</h4><p className="mt-1 text-xs leading-5 text-muted-foreground">These sources answer different questions. QBO is authoritative for accounting actuals; Tracker provides operational evidence.</p><div className="mt-3 divide-y rounded-md border"><EvidenceBlock title="QBO accounting" subtitle="Financial record: billed revenue and all costs posted to the job" rows={[["Billed revenue", row.qbo.totalBilledToDate], ["Accounting cost", row.qbo.totalCostToDate], ["Accounting profit", row.qbo.netIncome]]} /><EvidenceBlock title="Tracker project evidence" subtitle="Operational record: contract, imported expenses, and verified direct wages" rows={[["Contract value", row.tracker.contractAmount], ["Imported expenses", row.tracker.expenses], ["Verified direct wages", row.tracker.verifiedDirectWages], ["Operational cost shown", row.tracker.operationalCost]]} /></div><dl className="mt-3 grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3 text-sm"><Metric label="Revenue variance" value={signedCurrency(row.revenueVariance.amount)} /><Metric label="Cost variance" value={signedCurrency(row.costVariance.amount)} danger={row.costVariance.material} /><Metric label="Missing-rate hours" value={row.laborCoverage.missingRateHours.toFixed(2)} danger={row.laborCoverage.missingRateHours > 0} /><Metric label="Freshness" value={freshnessLabel(row)} danger={row.freshness.status !== "fresh"} /></dl><p className="mt-2 text-xs text-muted-foreground">Difference convention: QBO minus Tracker. Freshness is reviewed before variance.</p><p className="mt-1 text-xs text-muted-foreground">{row.qbo.syncedAt ? `Last QBO sync ${formatDateTimeCentral(row.qbo.syncedAt)}` : "QBO has never been synced for this review date."}</p></section>; }
function EvidenceBlock({ title, subtitle, rows }: { title: string; subtitle: string; rows: Array<[string, number | null]> }) { return <div className="p-3"><h5 className="text-sm font-semibold">{title}</h5><p className="mt-0.5 text-xs leading-4 text-muted-foreground">{subtitle}</p><dl className="mt-3 space-y-1.5 text-sm">{rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value == null ? "Unavailable" : formatCurrency(value)}</dd></div>)}</dl></div>; }
function Metric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) { return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={danger ? "font-medium text-red-800" : "font-medium"}>{value}</dd></div>; }
function Workflow({ row, payload, draft, setDraft, saving, saveCase }: { row: FinancialReconciliationQueueRow; payload: FinancialReconciliationPayload | null; draft: CaseDraft; setDraft: (draft: CaseDraft) => void; saving: boolean; saveCase: () => void }) {
  return <div><h4 className="text-sm font-semibold">Review workflow</h4>{!row.caseState ? <div className="mt-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">Refresh QBO &amp; review to open a durable review item that can be assigned and tracked.</div> : <div className="mt-3 space-y-3"><FilterSelect label="Review status" value={draft.status} onChange={(status) => setDraft({ ...draft, status })} options={["new", "assigned", "investigating", "waiting_on_pm", "waiting_on_accounting", "resolved"].map((value) => [value, STATUS_LABELS[value]])} /><FilterSelect label="Owner" value={draft.ownerEmail} onChange={(ownerEmail) => setDraft({ ...draft, ownerEmail })} options={[["", "Unassigned"], ...(payload?.ownerOptions.map((option) => [option.email, option.name] as [string, string]) ?? [])]} /><label className="block space-y-1 text-xs text-muted-foreground"><span>Review note</span><Textarea value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} placeholder="What was checked, what was found, or what is needed next?" /></label>{draft.status === "resolved" && <><FilterSelect label="Resolution type" value={draft.resolutionCode} onChange={(resolutionCode) => setDraft({ ...draft, resolutionCode })} options={[["", "Select resolution"], ["expected_difference", "Expected difference"], ["corrected_in_qbo", "Corrected in QBO"], ["corrected_in_tracker", "Corrected in Tracker"], ["mapping_fixed", "Mapping fixed"], ["timing_difference", "Timing/cutoff difference"], ["other", "Other"]]} /><label className="block space-y-1 text-xs text-muted-foreground"><span>Resolution notes</span><Textarea value={draft.resolutionNotes} onChange={(event) => setDraft({ ...draft, resolutionNotes: event.target.value })} /></label></>}<Button onClick={saveCase} disabled={saving}>{saving ? "Saving…" : "Save review"}</Button></div>}</div>;
}
