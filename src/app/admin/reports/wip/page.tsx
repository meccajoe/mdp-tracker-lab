"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { canManageProjectActions } from "@/lib/admin-access";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WipProjectDialog } from "@/components/wip-project-dialog";
import { WipEstimatedCostDialog } from "@/components/wip-estimated-cost-dialog";
import { WipReportSnapshot, WipReportSnapshotRow } from "@/lib/types";
import {
  EMPTY_WIP_FILTERS,
  WipFilters,
  WipReportRow,
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

type LiveCacheMode = "historical" | "today" | "live_qbo";
type LiveRefreshKind = "auto" | "force";
type WipSortColumn = "customer" | "projectNumber" | "project";
type WipSortDirection = "asc" | "desc";

function formatLiveSyncedAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleString();
}

export default function WipReportPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [mode, setMode] = useState<"live" | "snapshot">("live");
  const [liveRows, setLiveRows] = useState<WipReportRow[]>([]);
  const [liveAsOfDate, setLiveAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [loadingLiveRows, setLoadingLiveRows] = useState(false);
  const [liveCacheMode, setLiveCacheMode] = useState<LiveCacheMode | null>(null);
  const [liveSyncedAt, setLiveSyncedAt] = useState<string | null>(null);
  const [liveCacheTtlMinutes, setLiveCacheTtlMinutes] = useState(5);
  const [liveRefreshKind, setLiveRefreshKind] = useState<LiveRefreshKind>("auto");
  const [snapshots, setSnapshots] = useState<WipReportSnapshot[]>([]);
  const [snapshotRows, setSnapshotRows] = useState<WipReportSnapshotRow[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [filters, setFilters] = useState<WipFilters>(EMPTY_WIP_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [sortColumn, setSortColumn] = useState<WipSortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<WipSortDirection>("asc");
  const [snapshotDate, setSnapshotDate] = useState(new Date().toISOString().slice(0, 10));
  const [snapshotStatus, setSnapshotStatus] = useState<"draft" | "final">("draft");
  const [snapshotNotes, setSnapshotNotes] = useState("");
  const [createSnapshotOpen, setCreateSnapshotOpen] = useState(false);
  const [editingSnapshot, setEditingSnapshot] = useState(false);
  const [savingSnapshotChanges, setSavingSnapshotChanges] = useState(false);
  const [deletingSnapshot, setDeletingSnapshot] = useState(false);
  const [creatingSnapshot, setCreatingSnapshot] = useState(false);
  const [loadingSnapshotRows, setLoadingSnapshotRows] = useState(false);
  const liveRequestIdRef = useRef(0);

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
  const displayedRows = useMemo(() => {
    if (!sortColumn) {
      return filteredRows;
    }

    const sortedRows = [...filteredRows];
    sortedRows.sort((left, right) => {
      const comparison = compareWipRows(left, right, sortColumn);
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sortedRows;
  }, [filteredRows, sortColumn, sortDirection]);

  const optionSourceRows = mode === "snapshot" ? activeRows : liveRows;
  const pmOptions = useMemo(() => uniqueValues(optionSourceRows.map((row) => row.pm_initials)), [optionSourceRows]);
  const customerOptions = useMemo(() => uniqueValues(optionSourceRows.map((row) => row.customer)), [optionSourceRows]);
  const classOptions = useMemo(() => uniqueValues(optionSourceRows.map((row) => row.wip_class)), [optionSourceRows]);
  const liveSourceLabel = useMemo(() => {
    if (loadingLiveRows && liveRefreshKind === "force") return "Refreshing from QBO...";
    if (liveCacheMode === "historical") return "Historical cache";
    if (liveCacheMode === "today") return `Today cache (${liveCacheTtlMinutes} min TTL)`;
    if (liveCacheMode === "live_qbo") return "Live QBO refresh";
    return "QBO ProjectProfitabilitySummary";
  }, [liveCacheMode, liveCacheTtlMinutes, liveRefreshKind, loadingLiveRows]);
  const liveRefreshDetail = useMemo(() => {
    if (loadingLiveRows && liveRefreshKind === "force") {
      return "Pulling fresh QBO totals now. Cached rows will update when the refresh finishes.";
    }
    const syncedLabel = formatLiveSyncedAt(liveSyncedAt);
    if (liveCacheMode === "historical") {
      return syncedLabel ? `Cached metrics synced ${syncedLabel}` : "Historical cache served from Supabase";
    }
    if (liveCacheMode === "today") {
      return syncedLabel ? `Today cache synced ${syncedLabel}` : `Using cached today metrics for up to ${liveCacheTtlMinutes} minutes`;
    }
    if (liveCacheMode === "live_qbo") {
      return syncedLabel ? `Fresh QBO sync completed ${syncedLabel}` : "Fetched directly from QBO";
    }
    return null;
  }, [liveCacheMode, liveCacheTtlMinutes, liveRefreshKind, liveSyncedAt, loadingLiveRows]);
  const liveRefreshStatusLabel = useMemo(() => {
    if (loadingLiveRows) {
      return liveRefreshKind === "force" ? "Refreshing from QBO..." : "Refreshing...";
    }

    return `${liveRows.length} row(s) loaded`;
  }, [liveRefreshKind, liveRows.length, loadingLiveRows]);

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

  const loadLiveRows = useCallback(async (asOfDate: string, options?: { forceRefresh?: boolean }) => {
    const requestId = liveRequestIdRef.current + 1;
    liveRequestIdRef.current = requestId;
    setLiveRefreshKind(options?.forceRefresh ? "force" : "auto");
    setLoadingLiveRows(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("Authentication required");
      }

      const params = new URLSearchParams({ asOfDate });
      if (options?.forceRefresh) {
        params.set("forceRefresh", "1");
      }

      const response = await fetch(`/api/reports/wip/live?${params.toString()}`, {
        credentials: "include",
        cache: "no-store",
        headers: {
          Authorization: "Bearer " + session.access_token,
        },
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load live WIP report.");
      }

      if (requestId !== liveRequestIdRef.current) {
        return;
      }

      setLiveRows((payload.rows ?? []) as WipReportRow[]);
      setLiveCacheMode((payload.cacheMode as LiveCacheMode | undefined) ?? null);
      setLiveSyncedAt(typeof payload.syncedAt === "string" ? payload.syncedAt : null);
      setLiveCacheTtlMinutes(typeof payload.liveCacheTtlMinutes === "number" ? payload.liveCacheTtlMinutes : 5);
    } finally {
      if (requestId === liveRequestIdRef.current) {
        setLoadingLiveRows(false);
      }
    }
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

    const snapshotResponse = await loadSnapshots();

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

  useEffect(() => {
    if (!authorized || mode !== "live") return;

    loadLiveRows(liveAsOfDate).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load live WIP report");
    });
  }, [authorized, liveAsOfDate, loadLiveRows, mode]);

  useEffect(() => {
    if (!currentSnapshot) return;
    setSnapshotDate(currentSnapshot.snapshot_date);
    setSnapshotStatus(currentSnapshot.status);
    setSnapshotNotes(currentSnapshot.notes ?? "");
  }, [currentSnapshot]);

  function updateFilter<K extends keyof WipFilters>(key: K, value: WipFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(column: WipSortColumn) {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection("asc");
      return;
    }

    setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }

  async function handleCreateSnapshot() {
    if (!snapshotDate) {
      toast.error("Snapshot date is required.");
      return;
    }

    if (displayedRows.length === 0) {
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

      const snapshotRowPayload = buildSnapshotRows(displayedRows).map((row) => ({
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
      setEditingSnapshot(false);
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

  async function handleSaveSnapshotChanges() {
    if (!currentSnapshot) return;
    if (!snapshotDate) {
      toast.error("Snapshot date is required.");
      return;
    }

    try {
      setSavingSnapshotChanges(true);
      const { error } = await supabase
        .from("wip_report_snapshots")
        .update({
          snapshot_date: snapshotDate,
          status: snapshotStatus,
          notes: snapshotNotes.trim() || null,
        })
        .eq("id", currentSnapshot.id);

      if (error) throw error;

      await loadSnapshots();
      setEditingSnapshot(false);
      toast.success("Snapshot updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update snapshot.");
    } finally {
      setSavingSnapshotChanges(false);
    }
  }

  async function handleDeleteSnapshot() {
    if (!currentSnapshot) return;
    if (!confirm(`Delete snapshot ${formatDate(currentSnapshot.snapshot_date)}? This cannot be undone.`)) {
      return;
    }

    try {
      setDeletingSnapshot(true);
      const { error } = await supabase
        .from("wip_report_snapshots")
        .delete()
        .eq("id", currentSnapshot.id);

      if (error) throw error;

      const nextSnapshots = await loadSnapshots();
      const nextSelectedId = nextSnapshots[0]?.id ?? "";
      setSelectedSnapshotId(nextSelectedId);
      setSnapshotRows([]);
      setEditingSnapshot(false);
      if (nextSelectedId) {
        await loadSnapshotRows(nextSelectedId);
      }
      toast.success("Snapshot deleted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete snapshot.");
    } finally {
      setDeletingSnapshot(false);
    }
  }

  function handleExportCsv() {
    if (displayedRows.length === 0) {
      toast.error("No rows to export.");
      return;
    }

    const suffix = mode === "snapshot" && currentSnapshot
      ? `snapshot-${currentSnapshot.snapshot_date}-${currentSnapshot.status}`
      : `live-${liveAsOfDate}`;

    downloadCsv(buildWipCsv(displayedRows), `mdp-wip-report-${suffix}.csv`);
  }

  function handleExportExcel() {
    if (displayedRows.length === 0) {
      toast.error("No rows to export.");
      return;
    }

    const workbook = buildWipWorkbook(displayedRows);
    const suffix = mode === "snapshot" && currentSnapshot
      ? `snapshot-${currentSnapshot.snapshot_date}-${currentSnapshot.status}`
      : `live-${liveAsOfDate}`;

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
    <div className="container mx-auto py-8 px-4 xl:px-6 max-w-[1800px] space-y-6">
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
          <CardTitle>Filters</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setFiltersOpen((open) => !open)}>
            {filtersOpen ? <ChevronDownIcon className="mr-2 size-4" /> : <ChevronRightIcon className="mr-2 size-4" />}
            {filtersOpen ? "Hide" : "Show"}
          </Button>
        </CardHeader>
        {filtersOpen && (
          <CardContent className="space-y-4">
            {mode === "live" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="liveAsOfDate">As of Date</Label>
                  <Input id="liveAsOfDate" type="date" value={liveAsOfDate} onChange={(e) => setLiveAsOfDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Live Row Source</Label>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    <div>{liveSourceLabel}</div>
                    {liveRefreshDetail && <div className="mt-1 text-xs text-muted-foreground">{liveRefreshDetail}</div>}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Live Refresh Status</Label>
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    {liveRefreshStatusLabel}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Refresh Controls</Label>
                  <Button variant="outline" onClick={() => loadLiveRows(liveAsOfDate, { forceRefresh: true })} disabled={loadingLiveRows}>
                    {loadingLiveRows && liveRefreshKind === "force" ? "Refreshing from QBO..." : "Refresh from QBO"}
                  </Button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  placeholder="Customer, project #, or project name"
                />
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {mode === "live" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-4">
            <CardTitle>Create Snapshot</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setCreateSnapshotOpen((open) => !open)}>
              {createSnapshotOpen ? <ChevronDownIcon className="mr-2 size-4" /> : <ChevronRightIcon className="mr-2 size-4" />}
              {createSnapshotOpen ? "Hide" : "Show"}
            </Button>
          </CardHeader>
          {createSnapshotOpen && (
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
                    {displayedRows.length}
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
          )}
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
                      onClick={() => {
                        setSelectedSnapshotId(snapshot.id);
                        setEditingSnapshot(false);
                      }}
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
            {currentSnapshot && (
              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="font-medium">Edit Snapshot</h3>
                    <p className="text-sm text-muted-foreground">Update snapshot metadata or remove the snapshot entirely.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => setEditingSnapshot((value) => !value)}>
                      {editingSnapshot ? "Cancel Edit" : "Edit Snapshot"}
                    </Button>
                    <Button variant="outline" onClick={handleDeleteSnapshot} disabled={deletingSnapshot}>
                      {deletingSnapshot ? "Deleting..." : "Delete Snapshot"}
                    </Button>
                  </div>
                </div>
                {editingSnapshot ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="editSnapshotDate">As of Date</Label>
                      <Input id="editSnapshotDate" type="date" value={snapshotDate} onChange={(e) => setSnapshotDate(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="editSnapshotStatus">Status</Label>
                      <select id="editSnapshotStatus" className={selectClass} value={snapshotStatus} onChange={(e) => setSnapshotStatus(e.target.value as "draft" | "final")}>
                        <option value="draft">Draft</option>
                        <option value="final">Final</option>
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor="editSnapshotNotes">Notes</Label>
                      <Textarea id="editSnapshotNotes" value={snapshotNotes} onChange={(e) => setSnapshotNotes(e.target.value)} rows={3} />
                    </div>
                    <div className="md:col-span-3 flex justify-end">
                      <Button onClick={handleSaveSnapshotChanges} disabled={savingSnapshotChanges}>
                        {savingSnapshotChanges ? "Saving..." : "Save Snapshot Changes"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">As of Date</span>
                      <p>{formatDate(currentSnapshot.snapshot_date)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <p className="capitalize">{currentSnapshot.status}</p>
                    </div>
                    <div className="md:col-span-3">
                      <span className="text-muted-foreground">Notes</span>
                      <p>{currentSnapshot.notes || "—"}</p>
                    </div>
                  </div>
                )}
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
              : `Live WIP View — ${formatDate(liveAsOfDate)}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <span>{loadingLiveRows && mode === "live" ? "Refreshing live rows..." : `${displayedRows.length} row(s)`}</span>
            {mode === "snapshot" && currentSnapshot?.notes && <span>Notes: {currentSnapshot.notes}</span>}
          </div>

          {mode === "snapshot" && !selectedSnapshotId ? (
            <p className="text-sm text-muted-foreground">Select a snapshot to view frozen rows.</p>
          ) : displayedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No WIP rows match the current filters.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border shadow-xs">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/45 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("customer")}>
                        Customer
                        <SortIndicator active={sortColumn === "customer"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("projectNumber")}>
                        Job #
                        <SortIndicator active={sortColumn === "projectNumber"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium">
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("project")}>
                        Project
                        <SortIndicator active={sortColumn === "project"} direction={sortDirection} />
                      </button>
                    </th>
                    <th className="px-3 py-2 font-medium">Project Status</th>
                    <th className="px-3 py-2 font-medium text-right">Updated Contract Amount</th>
                    <th className="px-3 py-2 font-medium text-right">Updated Est Cost</th>
                    <th className="px-3 py-2 font-medium text-right">Updated Est Gross Profit</th>
                    <th className="px-3 py-2 font-medium text-right">Est GPM%</th>
                    <th className="px-3 py-2 font-medium text-right">Total Billed to Date</th>
                    <th className="px-3 py-2 font-medium text-right">Total Cost to Date</th>
                    <th className="px-3 py-2 font-medium text-right">Cost % Complete</th>
                    <th className="px-3 py-2 font-medium text-right">Revenue Earned</th>
                    <th className="px-3 py-2 font-medium text-right">Job Profit Earned</th>
                    <th className="px-3 py-2 font-medium text-right">Job Profit % Earned</th>
                    <th className="px-3 py-2 font-medium text-right">Billings in Excess of Costs</th>
                    <th className="px-3 py-2 font-medium text-right">Costs in Excess of Billings</th>
                    <th className="px-3 py-2 font-medium text-right">Current Year Total Billings</th>
                    <th className="px-3 py-2 font-medium text-right">Current Year Total Retainage</th>
                    <th className="px-3 py-2 font-medium text-right">Current Year Costs</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => (
                    <tr key={`${mode}-${selectedSnapshotId || "live"}-${row.project_id ?? row.project_number ?? row.project_name}`} className="border-t border-border/70 even:bg-muted/15 hover:bg-muted/35 transition-colors">
                      <td className="px-3 py-2">{row.customer}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{row.project_number ?? "—"}</td>
                      <td className="px-3 py-2 min-w-[260px]">
                        <WipProjectDialog
                          row={row}
                          triggerLabel={row.project_name}
                          triggerClassName="text-left font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={getStatusChipClassName(row.project_status)}>
                          {row.project_status ?? "Unknown"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(row.updated_contract_amount)}</td>
                      <td className="px-3 py-2 text-right">
                        <WipEstimatedCostDialog
                          row={row}
                          triggerLabel={formatCurrency(row.updated_est_cost)}
                          triggerClassName="text-right font-semibold text-rose-700 underline-offset-4 hover:underline dark:text-rose-400"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.updated_est_gross_profit)}</td>
                      <td className="px-3 py-2 text-right">{formatPercent(row.est_gpm_pct)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.total_billed_to_date)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.total_cost_to_date)}</td>
                      <td className="px-3 py-2 text-right">{formatPercent(row.cost_pct_complete)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.revenue_earned)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.job_profit_earned)}</td>
                      <td className="px-3 py-2 text-right">{formatPercent(row.job_profit_pct_earned)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.billings_in_excess_of_costs)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.costs_in_excess_of_billings)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.current_year_total_billings)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.current_year_total_retainage)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(row.current_year_costs)}</td>
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

function SortIndicator({ active, direction }: { active: boolean; direction: WipSortDirection }) {
  if (!active) {
    return <ChevronDownIcon className="size-3 opacity-40" />;
  }

  if (direction === "asc") {
    return <ChevronDownIcon className="size-3" />;
  }

  return <ChevronDownIcon className="size-3 rotate-180" />;
}

function compareWipRows(left: WipReportRow, right: WipReportRow, column: WipSortColumn): number {
  if (column === "customer") {
    return compareNaturalText(left.customer, right.customer);
  }

  if (column === "projectNumber") {
    const projectNumberComparison = compareNaturalText(left.project_number ?? "", right.project_number ?? "");
    if (projectNumberComparison !== 0) {
      return projectNumberComparison;
    }

    return compareNaturalText(left.project_name, right.project_name);
  }

  const projectNameComparison = compareNaturalText(left.project_name, right.project_name);
  if (projectNameComparison !== 0) {
    return projectNameComparison;
  }

  return compareNaturalText(left.project_number ?? "", right.project_number ?? "");
}

function compareNaturalText(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => (value ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function getPmChipClassName(pmInitials: string | null) {
  switch (pmInitials ?? "") {
    case "VW":
      return "border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-300";
    case "GM":
      return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300";
    case "MS":
      return "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300";
    case "AS":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300";
    case "NG":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300";
    case "PM":
      return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-900 dark:bg-fuchsia-950/60 dark:text-fuchsia-300";
    case "KM":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/60 dark:text-sky-300";
    case "KS":
      return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900 dark:bg-orange-950/60 dark:text-orange-300";
    case "CC":
      return "border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/60 dark:text-teal-300";
    case "MM":
      return "border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-900 dark:bg-pink-950/60 dark:text-pink-300";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300";
  }
}

function getStatusChipClassName(status: string | null) {
  switch (status ?? "") {
    case "Active":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300";
    case "Completed":
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300";
    case "On Hold":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300";
    case "Pending":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300";
  }
}
