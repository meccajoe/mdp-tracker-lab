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

type Labor = { qbo_entry_id: string; project_id: string; employee_name: string; date: string; reg_hours: number; ot_hours: number; hourly_rate: number; service_item: string | null };
type Project = { id: string; name: string; job_number: string | null; status: string };
type Mapping = { service_item: string; labor_bucket: string; source_gl_account_id: string; target_gl_account_id: string; notes: string };
type JulyPreview = { rows: Array<{ projectId: string; projectName: string; serviceItem: string; targetGlAccountId: string; workerClassification: string; hours: number; wageCost: number }>; totals: { wageCost: number; employeeWages: number; contractorWages: number } };
const iso = (d: Date) => d.toISOString().slice(0, 10);
const bucketOptions = ["Production Labor", "I&D Labor", "Contractor Labor"];

export default function LaborReconciliationPage() {
  const router = useRouter();
  const today = new Date();
  const [start, setStart] = useState(iso(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [end, setEnd] = useState(iso(today));
  const [labor, setLabor] = useState<Labor[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [julyPreview, setJulyPreview] = useState<JulyPreview | null>(null);
  const [draft, setDraft] = useState({ serviceItem: "", laborBucket: "Production Labor", sourceGlAccountId: "", targetGlAccountId: "", notes: "" });

  async function load() {
    setLoading(true);
    const response = await fetch(`/api/admin/labor-reconciliation?start=${start}&end=${end}`);
    const result = await response.json();
    if (!response.ok) { toast.error(result.error ?? "Could not load labor reconciliation."); setLoading(false); return; }
    setLabor(result.labor); setProjects(result.projects); setMappings(result.mappings); setLoading(false);
  }

  async function loadJulyPreview() { const response = await fetch("/api/admin/labor-reconciliation/july-preview"); const result = await response.json(); if (!response.ok) { toast.error(result.error ?? "Could not load July allocation preview."); return; } setJulyPreview(result); }

  useEffect(() => { (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) { router.replace("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
    if (data?.role !== "admin") { router.replace("/"); return; }
    void load(); void loadJulyPreview();
  })(); }, []);

  const total = useMemo(() => labor.reduce((sum, entry) => sum + (entry.reg_hours + entry.ot_hours) * entry.hourly_rate, 0), [labor]);
  const serviceItems = useMemo(() => [...new Set(labor.map((entry) => entry.service_item).filter((value): value is string => Boolean(value)))].sort(), [labor]);
  const mappingByItem = useMemo(() => new Map(mappings.map((mapping) => [mapping.service_item, mapping])), [mappings]);

  async function saveMapping() {
    const response = await fetch("/api/admin/labor-reconciliation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
    const result = await response.json();
    if (!response.ok) { toast.error(result.error ?? "Could not save mapping."); return; }
    toast.success(`${result.mapping.service_item} mapping saved. No QBO entry was posted.`);
    await load();
  }

  return <PageShell>
    <div><h1 className="text-2xl font-bold">Labor Reconciliation</h1><p className="mt-1 text-sm text-muted-foreground">Review QBO Time labor by period and configure the accounting map before generating a review-only Journal Entry preview. QBO posting is disabled.</p></div>
    <Card><CardContent className="flex flex-wrap gap-3 pt-6"><Input type="date" value={start} onChange={(event) => setStart(event.target.value)} className="w-40" /><Input type="date" value={end} onChange={(event) => setEnd(event.target.value)} className="w-40" /><Button onClick={load} disabled={loading}>{loading ? "Loading…" : "Apply period"}</Button></CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2"><Card><CardHeader><CardTitle className="text-sm">Labor logs</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{labor.length}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Wage cost</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{formatCurrency(total)}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>July 2026 allocation preview</CardTitle><p className="text-sm text-muted-foreground">Review-only wage allocation by project, Service Item, GL, and worker class. No QBO JE is created.</p></CardHeader><CardContent>{julyPreview && <><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Employee wages</p><p className="text-xl font-semibold">{formatCurrency(julyPreview.totals.employeeWages)}</p></div><div><p className="text-xs text-muted-foreground">Contractor wages</p><p className="text-xl font-semibold">{formatCurrency(julyPreview.totals.contractorWages)}</p></div><div><p className="text-xs text-muted-foreground">Total wages</p><p className="text-xl font-semibold">{formatCurrency(julyPreview.totals.wageCost)}</p></div></div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th>Project</th><th>Service Item</th><th>GL</th><th>Class</th><th className="text-right">Hours</th><th className="text-right">Wages</th></tr></thead><tbody>{julyPreview.rows.map((row) => <tr key={`${row.projectId}-${row.serviceItem}-${row.workerClassification}`} className="border-b"><td className="py-2">{row.projectName}</td><td>{row.serviceItem}</td><td>{row.targetGlAccountId}</td><td>{row.workerClassification}</td><td className="text-right">{row.hours.toFixed(2)}</td><td className="text-right">{formatCurrency(row.wageCost)}</td></tr>)}</tbody></table></div></>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Allocation mapping</CardTitle><p className="text-sm text-muted-foreground">Map each Service Item to a labor bucket and the source/target GL account IDs Venturity approves.</p></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 md:grid-cols-5"><Select value={draft.serviceItem} onValueChange={(serviceItem) => setDraft((current) => ({ ...current, serviceItem: serviceItem ?? "" }))}><SelectTrigger><SelectValue placeholder="Service Item" /></SelectTrigger><SelectContent>{serviceItems.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select><Select value={draft.laborBucket} onValueChange={(laborBucket) => setDraft((current) => ({ ...current, laborBucket: laborBucket ?? "Production Labor" }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{bucketOptions.map((bucket) => <SelectItem key={bucket} value={bucket}>{bucket}</SelectItem>)}</SelectContent></Select><Input value={draft.sourceGlAccountId} onChange={(event) => setDraft((current) => ({ ...current, sourceGlAccountId: event.target.value }))} placeholder="Source GL ID" /><Input value={draft.targetGlAccountId} onChange={(event) => setDraft((current) => ({ ...current, targetGlAccountId: event.target.value }))} placeholder="Target GL ID" /><Button onClick={saveMapping}>Save mapping</Button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="pb-2">Service Item</th><th>Labor bucket</th><th>Source GL ID</th><th>Target GL ID</th><th>Status</th></tr></thead><tbody>{serviceItems.map((item) => { const mapping = mappingByItem.get(item); return <tr key={item} className="border-b"><td className="py-2 font-medium">{item}</td><td>{mapping?.labor_bucket ?? "—"}</td><td>{mapping?.source_gl_account_id ?? "—"}</td><td>{mapping?.target_gl_account_id ?? "—"}</td><td>{mapping ? "Mapped" : "Needs Venturity mapping"}</td></tr>; })}</tbody></table></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Labor logs</CardTitle><p className="text-sm text-muted-foreground">Every row retains the Service Item from QBO Time.</p></CardHeader><CardContent className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Date</th><th>Employee</th><th>Source project</th><th>Service Item</th><th className="text-right">Hours</th><th className="p-3 text-right">Cost</th></tr></thead><tbody>{labor.map((entry) => { const project = projects.find((candidate) => candidate.id === entry.project_id); const cost = (entry.reg_hours + entry.ot_hours) * entry.hourly_rate; return <tr key={entry.qbo_entry_id} className="border-b"><td className="p-3">{entry.date}</td><td>{entry.employee_name}</td><td>{project ? `${project.job_number ?? project.id} · ${project.name}` : entry.project_id}</td><td>{entry.service_item ?? "Unclassified"}</td><td className="text-right">{(entry.reg_hours + entry.ot_hours).toFixed(1)}</td><td className="p-3 text-right">{formatCurrency(cost)}</td></tr>; })}</tbody></table></CardContent></Card>
  </PageShell>;
}
