"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface PreviewSummary {
  totalRows: number;
  bySheet: Record<string, number>;
  byStatus: Record<string, number>;
  byReason?: Record<string, number>;
  committedAt?: string;
  importedCount?: number;
  dedupedCount?: number;
  createdMaterialCount?: number;
  matchedMaterialCount?: number;
  skippedCount?: number;
}

interface ImportBatchHistory {
  id: string;
  source_name: string;
  source_url?: string | null;
  uploaded_by?: string | null;
  status: string;
  summary: PreviewSummary | null;
  created_at: string;
}

interface ImportBatchHistoryResponse {
  batches: ImportBatchHistory[];
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  error?: string;
}

interface ImportBatchRowsResponse {
  batch: ImportBatchHistory;
  rows: PreviewRow[];
  rowLimit: number;
  rowOffset: number;
  rowTotal: number;
  rowsHasMore: boolean;
  error?: string;
}

interface PreviewCandidateMatch {
  material_id: string | null;
  label: string | null;
  matched_by: string;
  confidence: number;
  candidates?: Array<{
    material_id: string;
    label: string;
    matched_by: string;
    confidence: number;
    alias_text?: string | null;
  }>;
}

interface PreviewCandidate {
  category: string | null;
  materialName: string | null;
  vendorName: string | null;
  dimensions: string | null;
  thicknessText: string | null;
  unit: string | null;
  price: number | null;
  link?: string | null;
  packQuantity?: number | null;
  notes: string | null;
  dedupe_key?: string | null;
  match: PreviewCandidateMatch;
}

interface PreviewRow {
  id: string;
  sheet_name: string;
  source_row_number: number;
  normalized_candidate: PreviewCandidate;
  status: string;
  error_text: string | null;
}

function buildSummary(rows: PreviewRow[]): PreviewSummary {
  const bySheet: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byReason: Record<string, number> = {};

  for (const row of rows) {
    bySheet[row.sheet_name] = (bySheet[row.sheet_name] ?? 0) + 1;
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;

    if (row.error_text) {
      for (const reason of row.error_text.split(",").map((value) => value.trim()).filter(Boolean)) {
        byReason[reason] = (byReason[reason] ?? 0) + 1;
      }
    }
  }

  return {
    totalRows: rows.length,
    bySheet,
    byStatus,
    byReason,
  };
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function MaterialsImportClient() {
  const [filePath, setFilePath] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [historyBatches, setHistoryBatches] = useState<ImportBatchHistory[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [rowHasMore, setRowHasMore] = useState(false);
  const [rowOffset, setRowOffset] = useState(0);
  const [rowTotal, setRowTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  const unresolvedReviewCount = summary?.byStatus?.needs_review ?? 0;

  const visibleRows = useMemo(() => {
    return rows.filter((row) => statusFilter === "all" ? true : row.status === statusFilter);
  }, [rows, statusFilter]);

  async function loadBatchHistory(options?: { append?: boolean; offset?: number }) {
    setLoadingHistory(true);
    try {
      const nextOffset = options?.offset ?? 0;
      const params = new URLSearchParams({
        offset: String(nextOffset),
        limit: "10",
      });
      const response = await fetch(`/api/materials/import/batches?${params.toString()}`);
      const payload = await response.json() as ImportBatchHistoryResponse;
      if (!response.ok) throw new Error(payload.error ?? `Failed to load import history: ${response.status}`);
      setHistoryBatches((current) => options?.append ? [...current, ...(payload.batches ?? [])] : (payload.batches ?? []));
      setHistoryHasMore(payload.hasMore ?? false);
      setHistoryOffset((payload.offset ?? nextOffset) + (payload.batches?.length ?? 0));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadBatchHistory();
  }, []);

  async function loadMoreBatchHistory() {
    await loadBatchHistory({ append: true, offset: historyOffset });
  }

  async function loadBatch(batchHistoryId: string, options?: { append?: boolean; offset?: number }) {
    try {
      const nextOffset = options?.offset ?? 0;
      const params = new URLSearchParams({
        offset: String(nextOffset),
        limit: "250",
      });
      const response = await fetch(`/api/materials/import/batches/${batchHistoryId}?${params.toString()}`);
      const payload = await response.json() as ImportBatchRowsResponse;
      if (!response.ok) throw new Error(payload.error ?? `Failed to load batch: ${response.status}`);
      setBatchId(payload.batch.id);
      setSummary(payload.batch.summary ?? buildSummary(payload.rows ?? []));
      setRows((current) => options?.append ? [...current, ...(payload.rows ?? [])] : (payload.rows ?? []));
      setRowHasMore(payload.rowsHasMore ?? false);
      setRowOffset((payload.rowOffset ?? nextOffset) + (payload.rows?.length ?? 0));
      setRowTotal(payload.rowTotal ?? (payload.rows?.length ?? 0));
      setStatusFilter("all");
      toast.success("Import batch loaded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadMoreRows() {
    if (!batchId) return;
    await loadBatch(batchId, { append: true, offset: rowOffset });
  }

  async function handlePreview() {
    if (!filePath.trim()) {
      toast.error("Workbook Path is required.");
      return;
    }

    setLoadingPreview(true);
    try {
      const response = await fetch("/api/materials/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Preview failed: ${response.status}`);
      setBatchId(payload.batchId);
      setSummary(payload.summary);
      setRows(payload.rows ?? []);
      setRowHasMore(payload.rowsHasMore ?? false);
      setRowOffset((payload.rowOffset ?? 0) + (payload.rows?.length ?? 0));
      setRowTotal(payload.rowTotal ?? (payload.rows?.length ?? 0));
      setStatusFilter("all");
      await loadBatchHistory();
      toast.success("Preview Import ready");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleCommit() {
    if (!batchId) {
      toast.error("Run Preview Import first.");
      return;
    }

    if (unresolvedReviewCount > 0) {
      toast.error("Resolve or skip all needs review rows before commit.");
      return;
    }

    setLoadingCommit(true);
    try {
      const response = await fetch("/api/materials/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Commit failed: ${response.status}`);
      toast.success(`Commit Import complete (${payload.importedCount} rows, ${payload.dedupedCount ?? 0} deduped)`);
      setSummary(payload.summary ?? summary);
      await loadBatchHistory();
      await loadBatch(batchId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingCommit(false);
    }
  }

  function updateRowCandidate(rowId: string, key: keyof PreviewCandidate, value: string) {
    setRows((current) => current.map((row) => {
      if (row.id !== rowId) return row;
      return {
        ...row,
        normalized_candidate: {
          ...row.normalized_candidate,
          [key]: key === "price"
            ? (value.trim() ? Number(value) : null)
            : key === "packQuantity"
              ? (value.trim() ? Number(value) : null)
              : value || null,
        },
      };
    }));
  }

  async function saveRowReview(row: PreviewRow, action: "save_review" | "approve" | "skip") {
    setSavingRowId(row.id);
    try {
      const response = await fetch(`/api/materials/import/rows/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          normalized_candidate: row.normalized_candidate,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Review update failed: ${response.status}`);

      setRows((current) => {
        const nextRows = current.map((currentRow) => currentRow.id === row.id ? payload.row : currentRow);
        setSummary(buildSummary(nextRows));
        return nextRows;
      });

      await loadBatchHistory();
      toast.success(action === "skip" ? "Row skipped" : action === "approve" ? "Row approved" : "Row review saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingRowId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Workbook</h1>
        <p className="text-sm text-muted-foreground">Preview spreadsheet normalization, resolve review rows, then commit clean rows into the live materials catalog.</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Workbook Path</label>
          <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/absolute/path/to/materials.xlsx" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handlePreview} disabled={loadingPreview}>{loadingPreview ? "Running Preview…" : "Preview Import"}</Button>
          <Button variant="outline" onClick={handleCommit} disabled={loadingCommit || !batchId || unresolvedReviewCount > 0}>
            {loadingCommit ? "Committing…" : "Commit Import"}
          </Button>
          {unresolvedReviewCount > 0 && (
            <Badge variant="outline">{unresolvedReviewCount} needs review</Badge>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Import Batch History</h2>
            <p className="text-sm text-muted-foreground">Reload prior preview runs, review what happened, and reopen a batch before cutover.</p>
          </div>
          <Button variant="outline" onClick={() => loadBatchHistory()} disabled={loadingHistory}>
            {loadingHistory ? "Refreshing…" : "Refresh History"}
          </Button>
        </div>
        {historyBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">No import batches recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {historyBatches.map((batch) => (
              <div key={batch.id} className="flex flex-col gap-3 rounded-md border border-border p-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{batch.source_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatTimestamp(batch.created_at)} • {batch.uploaded_by ?? "unknown uploader"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Status: {batch.status}</span>
                    <span>Total: {batch.summary?.totalRows ?? 0}</span>
                    <span>Needs review: {batch.summary?.byStatus?.needs_review ?? 0}</span>
                    <span>Imported: {batch.summary?.importedCount ?? batch.summary?.byStatus?.imported ?? 0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={batch.status === "committed" ? "secondary" : "outline"}>{batch.status}</Badge>
                  <Button variant="outline" onClick={() => loadBatch(batch.id)}>
                    {batch.id === batchId ? "Reload Batch" : "Open Batch"}
                  </Button>
                </div>
              </div>
            ))}
            {historyHasMore && (
              <div className="pt-2">
                <Button variant="outline" onClick={loadMoreBatchHistory} disabled={loadingHistory}>
                  {loadingHistory ? "Loading…" : "Show More History"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div>
            <h2 className="font-medium">Summary</h2>
            <p className="text-sm text-muted-foreground">Batch ID: {batchId}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">Commit Counters</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                <div className="flex justify-between gap-3"><span>Imported</span><span>{summary.importedCount ?? 0}</span></div>
                <div className="flex justify-between gap-3"><span>Deduped</span><span>{summary.dedupedCount ?? 0}</span></div>
                <div className="flex justify-between gap-3"><span>Created materials</span><span>{summary.createdMaterialCount ?? 0}</span></div>
                <div className="flex justify-between gap-3"><span>Matched materials</span><span>{summary.matchedMaterialCount ?? 0}</span></div>
                <div className="flex justify-between gap-3"><span>Skipped</span><span>{summary.skippedCount ?? 0}</span></div>
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">By Sheet</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                {Object.entries(summary.bySheet).map(([sheet, count]) => (
                  <div key={sheet} className="flex justify-between gap-3"><span>{sheet}</span><span>{count}</span></div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">By Status</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                {Object.entries(summary.byStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between gap-3"><span>{status}</span><span>{count}</span></div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Review Reasons</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                {Object.entries(summary.byReason ?? {}).length === 0 ? (
                  <div>No review blockers.</div>
                ) : Object.entries(summary.byReason ?? {}).map(([reason, count]) => (
                  <div key={reason} className="flex justify-between gap-3"><span>{reason}</span><span>{count}</span></div>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 p-3">
            <h3 className="mb-2 text-sm font-medium">Cutover Readiness</h3>
            <div className="space-y-1 text-sm text-muted-foreground">
              <div className="flex items-center justify-between gap-3"><span>Preview batch loaded</span><span>{batchId ? "Ready" : "Missing"}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Unresolved review rows</span><span>{unresolvedReviewCount === 0 ? "Clear" : unresolvedReviewCount}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Rows ready to import</span><span>{summary.byStatus?.parsed ?? 0}</span></div>
              <div className="flex items-center justify-between gap-3"><span>Commit status</span><span>{summary.committedAt ? `Committed ${formatTimestamp(summary.committedAt)}` : "Preview only"}</span></div>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-medium">Review Queue</h2>
              <p className="text-sm text-muted-foreground">Resolve ambiguous or incomplete rows before commit. Parsed rows can still be edited here.</p>
              <p className="text-xs text-muted-foreground">Showing {visibleRows.length} filtered rows from {rows.length} loaded / {rowTotal} total.</p>
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value ?? "all")}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Rows</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="parsed">Parsed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
                <SelectItem value="imported">Imported</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {visibleRows.map((row) => (
              <div key={row.id} className="rounded-md border border-border p-4 space-y-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="font-medium">{row.sheet_name} #{row.source_row_number}</div>
                    <div className="text-xs text-muted-foreground">Dedupe key: {row.normalized_candidate.dedupe_key ?? "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === "needs_review" ? "outline" : "default"}>{row.status}</Badge>
                    {row.normalized_candidate.match.label && (
                      <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left">
                        {row.normalized_candidate.match.matched_by}: {row.normalized_candidate.match.label} ({row.normalized_candidate.match.confidence})
                      </Badge>
                    )}
                  </div>
                </div>

                {row.error_text && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {row.error_text}
                  </div>
                )}

                {row.normalized_candidate.match.candidates?.length ? (
                  <div className="text-xs text-muted-foreground">
                    Possible matches: {row.normalized_candidate.match.candidates.map((candidate) => `${candidate.label} (${candidate.confidence})`).join(" • ")}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Material Name</label>
                    <Input value={row.normalized_candidate.materialName ?? ""} onChange={(e) => updateRowCandidate(row.id, "materialName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Category</label>
                    <Input value={row.normalized_candidate.category ?? ""} onChange={(e) => updateRowCandidate(row.id, "category", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Vendor</label>
                    <Input value={row.normalized_candidate.vendorName ?? ""} onChange={(e) => updateRowCandidate(row.id, "vendorName", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Dimensions</label>
                    <Input value={row.normalized_candidate.dimensions ?? ""} onChange={(e) => updateRowCandidate(row.id, "dimensions", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Thickness</label>
                    <Input value={row.normalized_candidate.thicknessText ?? ""} onChange={(e) => updateRowCandidate(row.id, "thicknessText", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Unit</label>
                    <Input value={row.normalized_candidate.unit ?? ""} onChange={(e) => updateRowCandidate(row.id, "unit", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Price</label>
                    <Input type="number" step="0.01" value={row.normalized_candidate.price ?? ""} onChange={(e) => updateRowCandidate(row.id, "price", e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Pack Quantity</label>
                    <Input type="number" step="0.01" value={row.normalized_candidate.packQuantity ?? ""} onChange={(e) => updateRowCandidate(row.id, "packQuantity", e.target.value)} />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <Textarea value={row.normalized_candidate.notes ?? ""} onChange={(e) => updateRowCandidate(row.id, "notes", e.target.value)} className="min-h-20" />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => saveRowReview(row, "save_review")} disabled={savingRowId === row.id}>Save Review</Button>
                  <Button onClick={() => saveRowReview(row, "approve")} disabled={savingRowId === row.id}>Approve Row</Button>
                  <Button variant="ghost" onClick={() => saveRowReview(row, "skip")} disabled={savingRowId === row.id}>Skip Row</Button>
                </div>
              </div>
            ))}
          </div>

          {rowHasMore && (
            <div className="pt-2">
              <Button variant="outline" onClick={loadMoreRows} disabled={loadingHistory}>
                {loadingHistory ? "Loading…" : "Show More Rows"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
