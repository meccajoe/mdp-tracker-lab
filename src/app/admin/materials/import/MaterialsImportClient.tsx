"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PreviewSummary {
  totalRows: number;
  bySheet: Record<string, number>;
  byStatus: Record<string, number>;
}

interface PreviewRow {
  sheet_name: string;
  source_row_number: number;
  normalized_candidate: Record<string, unknown>;
  status: string;
}

export default function MaterialsImportClient() {
  const [filePath, setFilePath] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PreviewSummary | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingCommit, setLoadingCommit] = useState(false);

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

    setLoadingCommit(true);
    try {
      const response = await fetch("/api/materials/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Commit failed: ${response.status}`);
      toast.success(`Commit Import complete (${payload.importedCount} rows)`);
      setSummary(payload.summary ?? summary);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoadingCommit(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Import Workbook</h1>
        <p className="text-sm text-muted-foreground">Preview spreadsheet normalization before committing rows into the live materials catalog.</p>
      </div>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Workbook Path</label>
          <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="/absolute/path/to/materials.xlsx" />
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePreview} disabled={loadingPreview}>{loadingPreview ? "Running Preview…" : "Preview Import"}</Button>
          <Button variant="outline" onClick={handleCommit} disabled={loadingCommit || !batchId}>{loadingCommit ? "Committing…" : "Commit Import"}</Button>
        </div>
      </div>

      {summary && (
        <div className="rounded-lg border border-border p-4 space-y-4">
          <div>
            <h2 className="font-medium">Summary</h2>
            <p className="text-sm text-muted-foreground">Batch ID: {batchId}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium mb-2">By Sheet</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                {Object.entries(summary.bySheet).map(([sheet, count]) => (
                  <div key={sheet} className="flex justify-between gap-3"><span>{sheet}</span><span>{count}</span></div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Rows needing review / status</h3>
              <div className="space-y-1 text-sm text-muted-foreground">
                {Object.entries(summary.byStatus).map(([status, count]) => (
                  <div key={status} className="flex justify-between gap-3"><span>{status}</span><span>{count}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <div>
            <h2 className="font-medium">Preview Rows</h2>
            <p className="text-sm text-muted-foreground">Showing the first {rows.length} normalized rows from the preview batch.</p>
          </div>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={`${row.sheet_name}-${row.source_row_number}-${index}`} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{row.sheet_name} #{row.source_row_number}</span>
                  <span className="text-muted-foreground">{row.status}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground break-all">
                  {JSON.stringify(row.normalized_candidate)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
