"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { canManageProjectActions } from "@/lib/admin-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProjectSummary, WipReportSnapshot, WipReportSnapshotRow } from "@/lib/types";
import {
  EMPTY_WIP_FILTERS,
  WipFilters,
  WipReportRow,
  buildLiveWipRow,
  buildSnapshotRows,
  buildWipCsv,
  buildWipWorkbook,
  coerceSnapshotRow,
  formatCurrency,
  formatDate,
  matchesWipFilters,
} from "@/lib/wip-report";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 transition-colors";
const selectClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 transition-colors";

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function WipReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "snapshot">("live");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [snapshots, setSnapshots] = useState<WipReportSnapshot[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<WipReportSnapshotRow[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [filters, setFilters] = useState<WipFilters>(EMPTY_WIP_FILTERS);
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [snapshotStatus, setSnapshotStatus] = useState<"draft" | "final">("draft");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [loadingSnapshotRows, setLoadingSnapshotRows] = useState(false);

  const liveRows = useMemo(() => projects.map(buildLiveWipRow), [projects]);
  const currentSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [snapshots, selectedSnapshotId],
  );
  const activeRows = useMemo<WipReportRow[]>(() => {
    if (mode === "snapshot") {
      return snapshotRows.map(coerceSnapshotRow);
    }
    return liveRows;
  }, [liveRows, mode, snapshotRows]);

  const filteredRows = useMemo(() => activeRows.filter((row) => matchesWipFilters(row, filters)), [activeRows, filters]);

  const optionSourceRows = mode === "snapshot" ? activeRows : liveRows;
  const pmOptions = useMemo(() => uniqueValues(optionSourceRows.map((row) => row.pm_initials)), [optionSourceRows]);
  const customerOptions = useMemo(() => uniqueValues(optionSourceRows.map((row) => row.customer)), [optionSourceRows]);
  const classOptions = useMemo(() => uniqueValues(optionSourceRows.map((row) => row.wip_class)), [optionSourceRows]);

  const loadSnapshots = useCallback(async () => {
    const { data, error } = await supabase
      .from("wip_report_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false })
      .order("generated_at", { ascending: false });

    if (error) {
      throw error;
    }

    const nextSnapshots = (data ?? []) as WipReportSnapshot[];
    setSnapshots(nextSnapshots);
    return nextSnapshots;
  }, []);

  const loadSnapshotRows = useCallback(async (snapshotId: string) => {
    if (!snapshotId) {
      setSnapshotRows([]);
      return;
    }

    setLoadingSnapshotRows(true);
    const { data, error } = await supabase
      .from("wip_report_snapshot_rows")
      .select("*")
      .eq("snapshot_id", snapshotId)
      .order("customer")
      .order("project_name");

    setLoadingSnapshotRows(false);

    if (error) {
      throw error;
    }

    setSnapshotRows((data ?? []) as WipReportSnapshotRow[]);
  }, []);

  const checkAdminAndLoad = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user?.email) {
      router.push("/");
      return;
    }

    setCurrentUserEmail(session.user.email.toLowerCase());

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", session.user.email.toLowerCase())
      .single();

    if (!canManageProjectActions(roleRow?.role)) {
      router.push("/");
      return;
    }

    setAuthorized(true);

    const [projectResponse, snapshotResponse] = await Promise.all([
      supabase.from("project_summary").select("*").order("client").order("name"),
      loadSnapshots(),
    ]);

    if (projectResponse.error) {
      throw projectResponse.error;
    }

    setProjects((projectResponse.data ?? []) as ProjectSummary[]);

    if (snapshotResponse.length > 0) {
      setSelectedSnapshotId(snapshotResponse[0].id);
    }
  }, [loadSnapshots, router]);

  useEffect(() => {
    async function init() {
      try {
        setLoading(true);
        await checkAdminAndLoad();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to load WIP report");
      } finally {
        setLoading(false);
      }
    }

    init();
  }, [checkAdminAndLoad]);

  useEffect(() => {
    if (mode !== "snapshot") return;

    loadSnapshotRows(selectedSnapshotId).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load snapshot rows");
    });
  }, [loadSnapshotRows, mode, selectedSnapshotId]);

  function updateFilter<K extends keyof WipFilters>(key: K, value: WipFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function handleCreateSnapshot() {
    if (!snapshotDate) {
      toast.error("Snapshot date is required.");
      return;
    }

    if (filteredRows.length === 0) {
      toast.error("No rows in the current view to snapshot.");
      return;
    }

    try {
      setCreatingSnapshot(true);

      const { data: snapshotData, error: snapshotError } = await supabase
        .from("wip_report_snapshots")
        .insert({
          snapshot_date: snapshotDate,
          generated_by: currentUserEmail,
          status: snapshotStatus,
          notes: snapshotNotes.trim() || null,
          filters_json: filters,
        })
        .select("*")
        .single();

      if (snapshotError || !snapshotData) {
        throw snapshotError ?? new Error("Failed to create snapshot header.");
      }

      const snapshotRowPayload = buildSnapshotRows(filteredRows).map((row) => ({
        snapshot_id: snapshotData.id,
        ...row,
      }));

      const { error: rowError } = await supabase
        .from("wip_report_snapshot_rows")
        .insert(snapshotRowPayload);

      if (rowError) {
        throw rowError;
      }

      const nextSnapshots = await loadSnapshots();
      const createdSnapshot = nextSnapshots.find((snapshot) => snapshot.id === snapshotData.id);
      setSelectedSnapshotId(snapshotData.id);
      setMode("snapshot");
      setSnapshotNotes("");
      if (createdSnapshot) {
        await loadSnapshotRows(createdSnapshot.id);
      }

      toast.success("Snapshot created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create snapshot.");
    } finally {
      setCreatingSnapshot(false);
    }
  }

  function handleExportCsv() {
    if (filteredRows.length === 0) {
      toast.error("No rows to export.");
      return;
    }

    const suffix = mode === "snapshot" && currentSnapshot
      ? `snapshot-${currentSnapshot.snapshot_date}-${currentSnapshot.status}`
      : `live-${new Date().toISOString().slice(0, 10)}`;

    downloadCsv(buildWipCsv(filteredRows), `mdp-wip-report-${suffix}.csv`);
  }

  function handleExportExcel() {
    if (filteredRows.length === 0) {
      toast.error("No rows to export.");
      return;
    }

    const workbook = buildWipWorkbook(filteredRows);
    const suffix = mode === "snapshot" && currentSnapshot
      ? `snapshot-${currentSnapshot.snapshot_date}-${currentSnapshot.status}`
      : `live-${new Date().toISOString().slice(0, 10)}`;

    XLSX.writeFile(workbook, `mdp-wip-report-${suffix}.xlsx`);
  }

  if (loading || !authorized) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <p className="text-muted-foreground">Loading WIP report...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">WIP Report</h1>
          <p className="text-sm text-muted-foreground">
            Admin-only reporting for live WIP review, manual month-end snapshots, and accounting exports.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "live" ? "default" : "outline"} onClick={() => setMode("live")}>
            Live Report
          </Button>
          <Button variant={mode === "snapshot" ? "default" : "outline"} onClick={() => setMode("snapshot")}>
            Snapshots
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>Export CSV</Button>
          <Button variant="outline" onClick={handleExportExcel}>Export Excel</Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <select className={selectClass} value={filters.status} onChange={(e) => updateFilter("status", e.target.value)}>
                <option value="All">All</option>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="On Hold">On Hold</option>
                <option value="Pending">Pending</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>PM</Label>
              <select className={selectClass} value={filters.pm} onChange={(e) => updateFilter("pm", e.target.value)}>
                <option value="All">All</option>
                {pmOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <select className={selectClass} value={filters.customer} onChange={(e) => updateFilter("customer", e.target.value)}>
                <option value="All">All</option>
                {customerOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <select className={selectClass} value={filters.wipClass} onChange={(e) => updateFilter("wipClass", e.target.value)}>
                <option value="All">All</option>
                {classOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Contract Date From</Label>
              <Input type="date" value={filters.contractDateFrom} onChange={(e) => updateFilter("contractDateFrom", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contract Date To</Label>
              <Input type="date" value={filters.contractDateTo} onChange={(e) => updateFilter("contractDateTo", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Completion Date From</Label>
              <Input type="date" value={filters.completionDateFrom} onChange={(e) => updateFilter("completionDateFrom", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Completion Date To</Label>
              <Input type="date" value={filters.completionDateTo} onChange={(e) => updateFilter("completionDateTo", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Sales Tax Included</Label>
              <select className={selectClass} value={filters.salesTax} onChange={(e) => updateFilter("salesTax", e.target.value as WipFilters["salesTax"])}>
                <option value="any">Any</option>
                <option value="has_value">Has value</option>
                <option value="missing">Missing</option>
              </select>
            </div>
            <div className="space-y-2 md:col-span-2 xl:col-span-3">
              <Label>Search</Label>
              <Input
                value={filters.search}
                onChange={(e) => updateFilter("search", e.target.value)}
                placeholder="Customer, project #, project name, or nickname"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {mode === "live" && (
        <Card>
          <CardHeader>
            <CardTitle>Create Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="snapshotDate">As of Date</Label>
                <Input id="snapshotDate" type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="snapshotStatus">Status</Label>
                <select id="snapshotStatus" className={selectClass} value={snapshotStatus} onChange={(e) => setSnapshotStatus(e.target.value as "draft" | "final")}>
                  <option value="draft">Draft</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Rows in Current View</Label>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                  {filteredRows.length}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="snapshotNotes">Notes</Label>
              <Textarea id="snapshotNotes" value={snapshotNotes} onChange={(e) => setSnapshotNotes(e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end">
              <Button onClick={handleCreateSnapshot} disabled={creatingSnapshot}>
                {creatingSnapshot ? "Creating..." : "Create Snapshot"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "snapshot" && (
        <Card>
          <CardHeader>
            <CardTitle>Saved Snapshots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {snapshots.map((snapshot) => {
                  const active = snapshot.id === selectedSnapshotId;
                  return (
                    <button
                      key={snapshot.id}
                      onClick={() => setSelectedSnapshotId(snapshot.id)}
                      className={`rounded-lg border p-4 text-left transition-colors ${active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{formatDate(snapshot.snapshot_date)}</span>
                        <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide">{snapshot.status}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Generated {new Date(snapshot.generated_at).toLocaleString()}
                      </p>
                      {snapshot.notes && (
                        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{snapshot.notes}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
            {loadingSnapshotRows && <p className="text-sm text-muted-foreground">Loading snapshot rows...</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {mode === "snapshot" && currentSnapshot
              ? `Snapshot View — ${formatDate(currentSnapshot.snapshot_date)} (${currentSnapshot.status})`
              : "Live WIP View"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>{filteredRows.length} row(s)</span>
            {mode === "snapshot" && currentSnapshot?.notes && <span>Notes: {currentSnapshot.notes}</span>}
          </div>

          {mode === "snapshot" && !selectedSnapshotId ? (
            <p className="text-sm text-muted-foreground">Select a snapshot to view frozen rows.</p>
          ) : filteredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No WIP rows match the current filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Project #</th>
                    <th className="px-3 py-2 font-medium">Project Name</th>
                    <th className="px-3 py-2 font-medium">Class</th>
                    <th className="px-3 py-2 font-medium">Job Nickname</th>
                    <th className="px-3 py-2 font-medium">Contract Date</th>
                    <th className="px-3 py-2 font-medium text-right">Contract Amount</th>
                    <th className="px-3 py-2 font-medium text-right">Estimated Cost</th>
                    <th className="px-3 py-2 font-medium">Sales Tax Included</th>
                    <th className="px-3 py-2 font-medium">Completion Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">PM</th>
                    <th className="px-3 py-2 font-medium">Estimate Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={`${mode}-${selectedSnapshotId || "live"}-${row.project_id ?? row.project_number ?? row.project_name}`} className="border-t border-border">
                      <td className="px-3 py-2">{row.customer}</td>
                      <td className="px-3 py-2">{row.project_number ?? "—"}</td>
                      <td className="px-3 py-2">{row.project_name}</td>
                      <td className="px-3 py-2">{row.wip_class ?? "—"}</td>
                      <td className="px-3 py-2">{row.job_nickname ?? "—"}</td>
                      <td className="px-3 py-2">{formatDate(row.contract_date)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.contract_amount)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.estimated_cost)}</td>
                      <td className="px-3 py-2">{row.sales_tax_included || "—"}</td>
                      <td className="px-3 py-2">{formatDate(row.completion_date)}</td>
                      <td className="px-3 py-2">{row.project_status ?? "—"}</td>
                      <td className="px-3 py-2">{row.pm_initials ?? "—"}</td>
                      <td className="px-3 py-2">{row.estimated_cost_source === "manual_override" ? "Manual Override" : "Derived"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}
