"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  source: "hubspot" | "qbo";
  source_id: string;
  source_ref: string | null;
  source_date: string | null;
  project_id: string | null;
  project_name: string | null;
  sku: string | null;
  description: string | null;
  unit_cost: number | null;
  quantity: number | null;
  line_total: number | null;
  vendor: string | null;
  synced_at: string;
}

type SortCol = "source_date" | "sku" | "description" | "project_name" | "unit_cost" | "line_total" | "source";
type SortDir = "asc" | "desc";

interface Filters {
  q: string;
  jobNumber: string;
  year: string;
  projectName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(val: number | null) {
  if (val === null || val === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${m}/${day}/${y}`;
}

function buildCsvRows(items: LineItem[]): string {
  const headers = ["Source", "Job #", "Date", "SKU", "Description", "Project", "Unit Cost", "Qty", "Line Total", "Vendor"];
  const rows = items.map((item) => [
    item.source,
    item.source_ref ?? "",
    item.source_date ?? "",
    item.sku ?? "",
    `"${(item.description ?? "").replace(/"/g, '""')}"`,
    `"${(item.project_name ?? "").replace(/"/g, '""')}"`,
    item.unit_cost ?? "",
    item.quantity ?? "",
    item.line_total ?? "",
    item.vendor ?? "",
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <TableRow>
      <TableCell><div className="h-4 w-14 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-16 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-48 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-36 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-20 rounded bg-muted animate-pulse" /></TableCell>
      <TableCell><div className="h-4 w-10 rounded bg-muted animate-pulse ml-auto" /></TableCell>
      <TableCell><div className="h-4 w-20 rounded bg-muted animate-pulse ml-auto" /></TableCell>
      <TableCell><div className="h-4 w-20 rounded bg-muted animate-pulse ml-auto" /></TableCell>
    </TableRow>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => String(CURRENT_YEAR - i));
const LIMIT = 100;

export default function LineItemSearchClient() {
  const [filters, setFilters] = useState<Filters>({ q: "", jobNumber: "", year: "", projectName: "" });
  const [pendingQ, setPendingQ] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); // start true so skeleton shows on mount
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("source_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce the search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, q: pendingQ }));
      setOffset(0);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [pendingQ]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.q) params.set("q", filters.q);
      if (filters.jobNumber) params.set("job_number", filters.jobNumber);
      if (filters.year) params.set("year", filters.year);
      if (filters.projectName) params.set("project_name", filters.projectName);
      params.set("sort", sortCol);
      params.set("order", sortDir);
      params.set("limit", String(LIMIT));
      params.set("offset", String(offset));

      const res = await fetch(`/api/line-items/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json() as { items: LineItem[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filters, sortCol, sortDir, offset]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => d === "desc" ? "asc" : "desc");
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
    setOffset(0);
  }

  function SortArrow({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  const activeFilters: Array<{ label: string; key: keyof Filters }> = [
    ...(filters.jobNumber ? [{ label: `Job: ${filters.jobNumber}`, key: "jobNumber" as const }] : []),
    ...(filters.year ? [{ label: `Year: ${filters.year}`, key: "year" as const }] : []),
    ...(filters.projectName ? [{ label: `Project: ${filters.projectName}`, key: "projectName" as const }] : []),
  ];

  function clearFilter(key: keyof Filters) {
    setFilters((f) => ({ ...f, [key]: "" }));
    setOffset(0);
  }

  function clearAll() {
    setPendingQ("");
    setFilters({ q: "", jobNumber: "", year: "", projectName: "" });
    setOffset(0);
  }

  function handleExport() {
    const csv = buildCsvRows(items);
    downloadCsv(csv, `line-items-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const hasFilters = filters.q || filters.jobNumber || filters.year || filters.projectName;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-background flex flex-col p-4 gap-4 overflow-y-auto">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Filters</h2>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Job Number</label>
              <Input
                placeholder="e.g. 26118"
                value={filters.jobNumber}
                onChange={(e) => { setFilters((f) => ({ ...f, jobNumber: e.target.value })); setOffset(0); }}
                className="h-8 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Year</label>
              <Select
                value={filters.year || "all"}
                onValueChange={(v) => { setFilters((f) => ({ ...f, year: v === "all" ? "" : v })); setOffset(0); }}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All years" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All years</SelectItem>
                  {YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={y}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Project Name</label>
              <Input
                placeholder="Search project..."
                value={filters.projectName}
                onChange={(e) => { setFilters((f) => ({ ...f, projectName: e.target.value })); setOffset(0); }}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7 text-muted-foreground">
            Clear All
          </Button>
        )}
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-border px-6 py-4 flex items-center gap-4 bg-background">
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-foreground leading-none mb-0.5">Line Item Search</h1>
            <p className="text-xs text-muted-foreground">Search across all HubSpot quotes and QBO invoices</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={items.length === 0}
            className="text-xs h-8"
          >
            Export CSV
          </Button>
        </div>

        {/* Search bar */}
        <div className="px-6 py-3 border-b border-border bg-background">
          <Input
            placeholder="Search SKU, description, project..."
            value={pendingQ}
            onChange={(e) => setPendingQ(e.target.value)}
            className="max-w-2xl h-9 text-sm"
            autoFocus
          />
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activeFilters.map((f) => (
                <span
                  key={f.key}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground border border-border"
                >
                  {f.label}
                  <button
                    onClick={() => clearFilter(f.key)}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${f.label} filter`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-auto px-6 py-3">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-3">
              {error}
            </div>
          )}

          {/* Count + pagination top */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              {loading
                ? "Loading..."
                : total > 0
                ? `${total.toLocaleString()} result${total === 1 ? "" : "s"}${total > LIMIT ? ` — showing ${offset + 1}–${Math.min(offset + LIMIT, total)}` : ""}`
                : hasFilters
                ? "No results match your filters"
                : "No line items found"}
            </span>
            {total > LIMIT && (
              <div className="flex gap-1">
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                  ← Prev
                </Button>
                <span className="text-xs text-muted-foreground self-center px-2">
                  {Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}
                </span>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset + LIMIT >= total || loading} onClick={() => setOffset(offset + LIMIT)}>
                  Next →
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer select-none w-20" onClick={() => toggleSort("source")}>
                    Source <SortArrow col="source" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none w-24" onClick={() => toggleSort("sku")}>
                    SKU <SortArrow col="sku" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("description")}>
                    Description <SortArrow col="description" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("project_name")}>
                    Project <SortArrow col="project_name" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none w-28" onClick={() => toggleSort("source_date")}>
                    Date <SortArrow col="source_date" />
                  </TableHead>
                  <TableHead className="text-right w-12 select-none">
                    Qty
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right w-28" onClick={() => toggleSort("unit_cost")}>
                    Unit <SortArrow col="unit_cost" />
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right w-28" onClick={() => toggleSort("line_total")}>
                    Total <SortArrow col="line_total" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
                )}
                {!loading && items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-16 text-muted-foreground text-sm">
                      {hasFilters ? "No items match your search." : "No line items synced yet."}
                    </TableCell>
                  </TableRow>
                )}
                {!loading && items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={`cursor-pointer hover:bg-accent/50 transition-colors ${expandedId === item.id ? "bg-accent/30" : ""}`}
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  >
                    <TableCell>
                      <Badge
                        variant={item.source === "hubspot" ? "default" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {item.source === "hubspot" ? "HubSpot" : "QBO"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.sku ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <div className="text-sm">{item.description ?? "—"}</div>
                      {expandedId === item.id && (
                        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-t border-border pt-3">
                          <div>
                            <span className="text-muted-foreground">Job #: </span>
                            <span className="font-medium">{item.source_ref ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Source ID: </span>
                            <span className="font-mono text-muted-foreground">{item.source_id}</span>
                          </div>
                          {item.vendor && (
                            <div>
                              <span className="text-muted-foreground">Vendor: </span>
                              <span className="font-medium">{item.vendor}</span>
                            </div>
                          )}
                          <div className="col-span-2 flex gap-3 mt-1">
                            {item.source === "hubspot" && (
                              <a
                                href={`https://app.hubspot.com/quotes/23392178/${item.source_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary underline underline-offset-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View in HubSpot →
                              </a>
                            )}
                            {item.source === "qbo" && (
                              <a
                                href={`https://app.qbo.intuit.com/app/invoice?txnId=${item.source_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary underline underline-offset-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                View in QBO →
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {item.project_name ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDate(item.source_date)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {item.quantity ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {fmt(item.unit_cost)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums">
                      {fmt(item.line_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Bottom pagination */}
          {total > LIMIT && (
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                ← Previous
              </Button>
              <span className="text-xs text-muted-foreground self-center">
                Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}
              </span>
              <Button variant="outline" size="sm" disabled={offset + LIMIT >= total || loading} onClick={() => setOffset(offset + LIMIT)}>
                Next →
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
