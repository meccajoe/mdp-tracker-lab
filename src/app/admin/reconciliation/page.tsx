"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/constants";
import { formatDateTimeCentral } from "@/lib/date-utils";
import type { FinancialReconciliationPayload, FinancialReconciliationQueueRow } from "@/lib/financial-reconciliation-server";
import { supabase } from "@/lib/supabase";

type QueueFilter = "all" | "needs_action" | "waiting_for_fresh_qbo" | "ready";
type CaseEvent = Record<string, unknown> & { payload?: { comment?: unknown } };
type CaseDetail = { reconciliationCase: Record<string, unknown>; events: CaseEvent[] };
type CaseDraft = { status: string; ownerEmail: string; comment: string; resolutionCode: string; resolutionNotes: string };

const CATEGORY_LABELS: Record<string, string> = {
  stale_qbo_data: "Stale QBO data", missing_qbo_actuals: "Missing QBO actuals", missing_tracker_contract: "Missing Tracker contract",
  missing_labor_rate: "Missing labor-rate coverage", revenue_variance: "Revenue variance", cost_variance: "Cost variance", within_tolerance: "Within tolerance",
};
const STATUS_LABELS: Record<string, string> = {
  new: "New", assigned: "Assigned", investigating: "Investigating", waiting_on_pm: "Waiting on PM", waiting_on_accounting: "Waiting on accounting",
  resolved: "Resolved", needs_action: "Needs action", waiting_for_fresh_qbo: "Waiting for fresh QBO data", ready: "Ready",
};

function todayCentral(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function signedCurrency(value: number | null): string { return value == null ? "Unavailable" : `${value > 0 ? "+" : ""}${formatCurrency(value)}`; }
function freshnessLabel(row: FinancialReconciliationQueueRow): string { return row.freshness.status === "never_synced" ? "Never synced" : row.freshness.status === "stale" ? "Stale" : "Fresh"; }
function rowStatus(row: FinancialReconciliationQueueRow): string { return row.caseState?.status ?? row.queueStatus; }
function effectiveCategory(row: FinancialReconciliationQueueRow): string { return row.caseState?.category ?? row.category; }
function statusBadgeClass(status: string): string {
  if (["needs_action", "new", "investigating"].includes(status)) return "border-red-200 bg-red-50 text-red-800";
  if (["waiting_for_fresh_qbo", "waiting_on_pm", "waiting_on_accounting"].includes(status)) return "border-amber-200 bg-amber-50 text-amber-800";
  if (["ready", "resolved"].includes(status)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-border bg-muted text-foreground";
}

export default function ReconciliationPage() {
  const router = useRouter();
  const requestIdRef = useRef(0);
  const [payload, setPayload] = useState<FinancialReconciliationPayload | null>(null);
  const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [saving, setSaving] = useState(false); const [authorized, setAuthorized] = useState(false);
  const [asOfDate, setAsOfDate] = useState(todayCentral()); const [search, setSearch] = useState(""); const [queueFilter, setQueueFilter] = useState<QueueFilter>("needs_action");
  const [projectStatus, setProjectStatus] = useState("Active"); const [category, setCategory] = useState("all"); const [owner, setOwner] = useState("all"); const [freshness, setFreshness] = useState("all"); const [materialOnly, setMaterialOnly] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null); const [mobileDetailOpen, setMobileDetailOpen] = useState(false); const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
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
  const selectedRow = useMemo(() => payload?.rows.find((row) => row.project.id === selectedProjectId) ?? null, [payload, selectedProjectId]);

  useEffect(() => {
    if (!selectedRow) { setCaseDetail(null); return; }
    setDraft({ status: selectedRow.caseState?.status ?? "new", ownerEmail: selectedRow.caseState?.ownerEmail ?? "", comment: "", resolutionCode: selectedRow.caseState?.resolutionCode ?? "", resolutionNotes: selectedRow.caseState?.resolutionNotes ?? "" });
    if (!selectedRow.caseState?.id) { setCaseDetail(null); return; }
    authenticatedFetch(`/api/admin/reconciliation/cases/${selectedRow.caseState.id}`).then(async (response) => { const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? "Could not load review history."); setCaseDetail(result as CaseDetail); }).catch((error) => toast.error(error instanceof Error ? error.message : "Could not load review history."));
  }, [authenticatedFetch, selectedRow]);

  async function refreshQboAndReview() {
    setRefreshing(true); const requestId = ++requestIdRef.current;
    try {
      const qboResponse = await authenticatedFetch(`/api/reports/wip/live?asOfDate=${encodeURIComponent(asOfDate)}&forceRefresh=1`); const qboResult = await qboResponse.json().catch(() => ({})); if (!qboResponse.ok) throw new Error(qboResult.error ?? "Could not refresh QBO actuals.");
      const scanResponse = await authenticatedFetch("/api/admin/reconciliation/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asOfDate }) }); const scanResult = await scanResponse.json().catch(() => ({})); if (!scanResponse.ok) throw new Error(scanResult.error ?? "Could not refresh the review queue.");
      if (requestId !== requestIdRef.current) return; setPayload(scanResult as FinancialReconciliationPayload); toast.success(`Review refreshed for ${scanResult.scan?.scanned ?? 0} projects.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not refresh Accounting Review."); } finally { if (requestId === requestIdRef.current) setRefreshing(false); }
  }
  async function saveCase() {
    if (!selectedRow?.caseState) return; setSaving(true);
    try {
      const response = await authenticatedFetch(`/api/admin/reconciliation/cases/${selectedRow.caseState.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rowVersion: selectedRow.caseState.rowVersion, status: draft.status, ownerEmail: draft.ownerEmail, comment: draft.comment, resolutionCode: draft.status === "resolved" ? draft.resolutionCode : undefined, resolutionNotes: draft.status === "resolved" ? draft.resolutionNotes : undefined }) });
      const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error ?? "Could not save the review item."); await loadQueue(asOfDate); toast.success("Review item saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the review item."); } finally { setSaving(false); }
  }
  function openDetail(row: FinancialReconciliationQueueRow) { setSelectedProjectId(row.project.id); setMobileDetailOpen(true); }
  function resetFilters() { setSearch(""); setQueueFilter("all"); setProjectStatus("Active"); setCategory("all"); setOwner("all"); setFreshness("all"); setMaterialOnly(false); }
  if (!authorized) return null;

  return <PageShell>
    <header className="flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Accounting review</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Accounting Review</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Review differences between QBO accounting actuals and Tracker operational evidence, then assign the next action.</p></div><div className="flex flex-wrap items-end gap-2"><label className="space-y-1 text-xs text-muted-foreground"><span>As of date</span><Input type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} className="w-40" /></label><Button onClick={refreshQboAndReview} disabled={refreshing || loading}>{refreshing ? "Refreshing from QBO…" : "Refresh QBO & review"}</Button></div></header>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border py-3 text-sm"><span><b>{payload?.counts.total ?? 0}</b> projects</span><span className="text-red-800"><b>{payload?.counts.needsAction ?? 0}</b> need action</span><span><b>{payload?.counts.waitingForFreshQbo ?? 0}</b> waiting for QBO</span><span><b>{payload?.counts.missingRate ?? 0}</b> missing rate coverage</span><span className="ml-auto text-xs text-muted-foreground">QBO source: {payload?.sourceFreshness.latestQboSyncAt ? formatDateTimeCentral(payload.sourceFreshness.latestQboSyncAt) : "not yet available"}</span></div>
    <section className="space-y-3 border-b border-border py-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7"><label className="space-y-1 text-xs text-muted-foreground xl:col-span-2"><span>Search</span><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Project, job number, client" /></label><FilterSelect label="Review status" value={queueFilter} onChange={(value) => setQueueFilter(value as QueueFilter)} options={[["needs_action","Needs action"],["waiting_for_fresh_qbo","Waiting for QBO"],["ready","Ready"],["all","All"]]} /><FilterSelect label="Project status" value={projectStatus} onChange={setProjectStatus} options={[["Active","Active"],["Completed","Completed"],["On Hold","On Hold"],["all","All"]]} /><FilterSelect label="Category" value={category} onChange={setCategory} options={[["all","All categories"], ...Object.entries(CATEGORY_LABELS)]} /><FilterSelect label="Owner" value={owner} onChange={setOwner} options={[["all","All owners"],["unassigned","Unassigned"], ...(payload?.ownerOptions.map((option) => [option.email, option.name] as [string,string]) ?? [])]} /><FilterSelect label="Freshness filter" value={freshness} onChange={setFreshness} options={[["all","All freshness"],["fresh","Fresh"],["stale","Stale"],["never_synced","Never synced"]]} /></div><div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={materialOnly} onChange={(event) => setMaterialOnly(event.target.checked)} /> Only material variances</label><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button></div></section>
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.75fr)]">
      <section className={`min-w-0 overflow-hidden border border-border bg-background ${mobileDetailOpen ? "hidden lg:block" : "block"}`}><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="font-semibold">Reconciliation queue</h2><p className="text-xs text-muted-foreground">Showing {filteredRows.length} of {payload?.rows.length ?? 0} projects</p></div><span className="text-xs text-muted-foreground">Freshness is reviewed before variance</span></div>{loading ? <p className="py-16 text-center text-sm text-muted-foreground">Loading Accounting Review…</p> : filteredRows.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">No projects match these filters.</p> : <QueueList rows={filteredRows} selectedProjectId={selectedProjectId} openDetail={openDetail} />}</section>
      <aside className={`min-w-0 border border-border bg-background p-4 sm:p-5 ${mobileDetailOpen ? "block" : "hidden lg:block"}`}>{!selectedRow ? <div className="py-16 text-center text-sm text-muted-foreground">Select a queue item to review its evidence and next action.</div> : <ReviewDetail row={selectedRow} payload={payload} draft={draft} setDraft={setDraft} caseDetail={caseDetail} saving={saving} saveCase={saveCase} back={() => setMobileDetailOpen(false)} />}</aside>
    </div>
  </PageShell>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string,string]> }) {
  return <label className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function QueueList({ rows, selectedProjectId, openDetail }: { rows: FinancialReconciliationQueueRow[]; selectedProjectId: string | null; openDetail: (row: FinancialReconciliationQueueRow) => void }) {
  return <><div data-slot="reconciliation-mobile-list" className="divide-y lg:hidden">{rows.map((row) => <button key={row.project.id} type="button" onClick={() => openDetail(row)} className="block w-full min-w-0 space-y-3 p-4 text-left hover:bg-muted/40"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><div className="break-words font-medium">{row.project.jobNumber ?? row.project.id} · {row.project.name}</div><div className="text-xs text-muted-foreground">{row.project.client} · {row.project.owner ?? "Unassigned"}</div></div><Badge variant="outline" className={statusBadgeClass(rowStatus(row))}>{STATUS_LABELS[rowStatus(row)] ?? rowStatus(row)}</Badge></div><div><p className="text-sm font-medium">{CATEGORY_LABELS[effectiveCategory(row)]}</p><p className="mt-1 text-sm text-muted-foreground">{row.reason}</p></div><div className="grid grid-cols-2 gap-2 text-xs"><div><span className="text-muted-foreground">Cost variance</span><div>{signedCurrency(row.costVariance.amount)}</div></div><div><span className="text-muted-foreground">Freshness</span><div>{freshnessLabel(row)}</div></div></div>{row.laborCoverage.missingRateHours > 0 && <p className="text-xs text-red-800">Missing-rate hours: {row.laborCoverage.missingRateHours.toFixed(2)}</p>}<span className="inline-block text-sm font-medium underline underline-offset-2">Review item</span></button>)}</div><div className="hidden overflow-x-auto lg:block"><Table><TableHeader><TableRow><TableHead>Project</TableHead><TableHead>Owner</TableHead><TableHead>Review status</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Revenue variance</TableHead><TableHead className="text-right">Cost variance</TableHead><TableHead>Freshness</TableHead><TableHead></TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.project.id} className={selectedProjectId === row.project.id ? "bg-muted/60" : ""}><TableCell className="max-w-64"><div className="min-w-0 break-words font-medium">{row.project.jobNumber ?? row.project.id} · {row.project.name}</div><div className="text-xs text-muted-foreground">{row.project.client} · {row.project.status}</div></TableCell><TableCell className="text-sm">{row.caseState?.ownerEmail ?? row.project.owner ?? "Unassigned"}</TableCell><TableCell><Badge variant="outline" className={statusBadgeClass(rowStatus(row))}>{STATUS_LABELS[rowStatus(row)] ?? rowStatus(row)}</Badge></TableCell><TableCell><div className="text-sm">{CATEGORY_LABELS[effectiveCategory(row)]}</div>{row.laborCoverage.missingRateHours > 0 && <div className="text-xs text-red-800">{row.laborCoverage.missingRateHours.toFixed(2)} hrs missing</div>}</TableCell><TableCell className="text-right font-mono text-sm">{signedCurrency(row.revenueVariance.amount)}</TableCell><TableCell className="text-right font-mono text-sm">{signedCurrency(row.costVariance.amount)}</TableCell><TableCell><div className="text-sm">{freshnessLabel(row)}</div><div className="whitespace-nowrap text-xs text-muted-foreground">{row.qbo.syncedAt ? formatDateTimeCentral(row.qbo.syncedAt) : "Never"}</div></TableCell><TableCell><Button size="sm" variant="outline" onClick={() => openDetail(row)}>Review</Button></TableCell></TableRow>)}</TableBody></Table></div></>;
}

function ReviewDetail({ row, payload, draft, setDraft, caseDetail, saving, saveCase, back }: { row: FinancialReconciliationQueueRow; payload: FinancialReconciliationPayload | null; draft: CaseDraft; setDraft: (draft: CaseDraft) => void; caseDetail: CaseDetail | null; saving: boolean; saveCase: () => void; back: () => void }) {
  return <div className="space-y-5"><button type="button" className="text-sm font-medium underline underline-offset-2 lg:hidden" onClick={back}>← Back to queue</button><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words text-lg font-semibold">{row.project.jobNumber ?? row.project.id} · {row.project.name}</h2><p className="text-sm text-muted-foreground">{row.project.client} · {row.project.owner ?? "Unassigned"}</p></div><Link href={`/projects/${row.project.id}`} className="shrink-0 text-sm font-medium underline underline-offset-2">Open project</Link></div><section className="space-y-2 border-t pt-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={statusBadgeClass(rowStatus(row))}>{STATUS_LABELS[rowStatus(row)] ?? rowStatus(row)}</Badge><Badge variant="secondary">{CATEGORY_LABELS[effectiveCategory(row)]}</Badge></div><p className="text-sm font-medium">{row.reason}</p><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next action</p><p className="mt-1 text-sm">{row.nextAction}</p></div></section><section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Freshness</h3><p className="text-sm">QBO actuals: <b>{freshnessLabel(row)}</b></p><p className="text-xs text-muted-foreground">{row.qbo.syncedAt ? `Last QBO sync ${formatDateTimeCentral(row.qbo.syncedAt)}` : "QBO has never been synced for this review date."}</p>{row.freshness.status !== "fresh" && <p className="text-sm text-amber-800">Refresh before deciding whether this variance is real.</p>}</section><section className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><Evidence title="Tracker operational evidence" rows={[["Contract", row.tracker.contractAmount],["Imported expenses",row.tracker.expenses],["Verified direct wages",row.tracker.verifiedDirectWages],["Operational cost",row.tracker.operationalCost]]} /><Evidence title="QBO accounting actuals" rows={[["Income",row.qbo.totalBilledToDate],["Cost",row.qbo.totalCostToDate],["Net income",row.qbo.netIncome]]} /></section><section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Separate comparisons</h3><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Revenue variance</p><p className="font-mono font-medium">{signedCurrency(row.revenueVariance.amount)}</p></div><div><p className="text-xs text-muted-foreground">Cost variance</p><p className="font-mono font-medium">{signedCurrency(row.costVariance.amount)}</p></div></div></section><section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Labor-rate coverage</h3><div className="grid grid-cols-3 gap-2 text-sm"><Metric label="Total hours" value={row.laborCoverage.totalHours.toFixed(2)} /><Metric label="Verified hours" value={row.laborCoverage.verifiedRateHours.toFixed(2)} /><Metric label="Missing-rate hours" value={row.laborCoverage.missingRateHours.toFixed(2)} danger={row.laborCoverage.missingRateHours > 0} /></div>{row.laborCoverage.missingRateHours > 0 && <p className="text-xs text-muted-foreground">Tracker labor cost excludes labor hours that do not have a verified QBO Time pay rate.</p>}</section><Workflow row={row} payload={payload} draft={draft} setDraft={setDraft} saving={saving} saveCase={saveCase} />{caseDetail?.events?.length ? <section className="space-y-2 border-t pt-4"><h3 className="text-sm font-semibold">Review history</h3>{caseDetail.events.slice(0,8).map((event) => <div key={String(event.id)} className="border-l-2 border-border pl-3 text-xs"><p className="font-medium">{String(event.event_type).replaceAll("_", " ")}</p><p className="text-muted-foreground">{event.actor_email ? String(event.actor_email) : "System"} · {event.created_at ? formatDateTimeCentral(String(event.created_at)) : ""}</p>{event.payload?.comment ? <p className="mt-1 text-foreground">{String(event.payload.comment)}</p> : null}</div>)}</section> : null}</div>;
}
function Evidence({ title, rows }: { title: string; rows: Array<[string,number|null]> }) { return <div><h3 className="text-sm font-semibold">{title}</h3><dl className="mt-2 space-y-1 text-sm">{rows.map(([label,value], index) => <div key={label} className={`flex justify-between gap-3 ${index === rows.length - 1 ? "font-medium" : ""}`}><dt>{label}</dt><dd>{value == null ? "Unavailable" : formatCurrency(value)}</dd></div>)}</dl></div>; }
function Metric({ label, value, danger=false }: { label: string; value: string; danger?: boolean }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className={danger ? "text-red-800" : ""}>{value}</p></div>; }
function Workflow({ row, payload, draft, setDraft, saving, saveCase }: { row: FinancialReconciliationQueueRow; payload: FinancialReconciliationPayload | null; draft: CaseDraft; setDraft: (draft: CaseDraft) => void; saving: boolean; saveCase: () => void }) {
  return <section className="space-y-3 border-t pt-4"><h3 className="text-sm font-semibold">Review workflow</h3>{!row.caseState ? <p className="text-sm text-muted-foreground">Refresh QBO & review to open a durable review item.</p> : <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"><FilterSelect label="Review status" value={draft.status} onChange={(status) => setDraft({...draft,status})} options={["new","assigned","investigating","waiting_on_pm","waiting_on_accounting","resolved"].map((value) => [value,STATUS_LABELS[value]])} /><FilterSelect label="Owner" value={draft.ownerEmail} onChange={(ownerEmail) => setDraft({...draft,ownerEmail})} options={[["","Unassigned"], ...(payload?.ownerOptions.map((option) => [option.email,option.name] as [string,string]) ?? [])]} /></div><label className="space-y-1 text-xs text-muted-foreground"><span>Review note</span><Textarea value={draft.comment} onChange={(event) => setDraft({...draft,comment:event.target.value})} placeholder="What was checked or what is needed next?" /></label>{draft.status === "resolved" && <><FilterSelect label="Resolution type" value={draft.resolutionCode} onChange={(resolutionCode) => setDraft({...draft,resolutionCode})} options={[["","Select resolution"],["expected_difference","Expected difference"],["corrected_in_qbo","Corrected in QBO"],["corrected_in_tracker","Corrected in Tracker"],["mapping_fixed","Mapping fixed"],["timing_difference","Timing/cutoff difference"],["other","Other"]]} /><label className="space-y-1 text-xs text-muted-foreground"><span>Resolution notes</span><Textarea value={draft.resolutionNotes} onChange={(event) => setDraft({...draft,resolutionNotes:event.target.value})} /></label></>}<Button onClick={saveCase} disabled={saving}>{saving ? "Saving…" : "Save review"}</Button></>}</section>;
}
