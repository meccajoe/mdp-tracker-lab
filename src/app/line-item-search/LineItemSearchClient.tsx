"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {adaFetch} from "@/lib/ada-client";
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
  hubspot_deal_id: string | null;
  projects: { hubspot_deal_id: string | null } | null;
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
  const headers = ["Source", "Quote Job / Invoice Number", "Date", "SKU", "Description", "Project", "Unit Price", "Qty", "Line Total", "Vendor"];
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

// ─── Filter icon ─────────────────────────────────────────────────────────────

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      className={`w-4 h-4 ${active ? "text-primary" : "text-muted-foreground"}`}
      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 9h10M11 14h2M13 19h-2" />
    </svg>
  );
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
  const [source, setSource] = useState("hubspot");
  const [filters, setFilters] = useState<Filters>({ q: "", jobNumber: "", year: "", projectName: "" });
  const [pendingQ, setPendingQ] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("source_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const requestId = useRef(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // Close filter panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((f) => ({ ...f, q: pendingQ }));
      setOffset(0);
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [pendingQ]);

  const fetchItems = useCallback(async () => {
    const activeRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("source", source);
      if (filters.q) params.set("q", filters.q);
      if (filters.jobNumber) params.set("job_number", filters.jobNumber);
      if (filters.year) params.set("year", filters.year);
      if (filters.projectName) params.set("project_name", filters.projectName);
      params.set("sort", sortCol);
      params.set("order", sortDir);
      params.set("limit", String(LIMIT));
      params.set("offset", String(offset));

      const res = await adaFetch(`/api/line-items/search?${params.toString()}`);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const data = await res.json() as { items: LineItem[]; total: number };
      if (activeRequest !== requestId.current) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (e) {
      if (activeRequest === requestId.current) setError(String(e));
    } finally {
      if (activeRequest === requestId.current) setLoading(false);
    }
  }, [filters, sortCol, sortDir, offset, source]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function toggleSort(col: SortCol) {
    if (sortCol === col) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortCol(col); setSortDir("desc"); }
    setOffset(0);
  }

  function SortArrow({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>;
  }

  const sidebarFilters = { jobNumber: filters.jobNumber, year: filters.year, projectName: filters.projectName };
  const activeFilterCount = Object.values(sidebarFilters).filter(Boolean).length;

  const activeFilterChips: Array<{ label: string; key: keyof Filters }> = [
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

  const hasFilters = filters.q || filters.jobNumber || filters.year || filters.projectName;

  return (
    <PageShell className="pm-readable-financials">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Search Items</h1>
          <p className="text-xs text-muted-foreground">Find previous items and see what was quoted.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(buildCsvRows(items), `line-items-${new Date().toISOString().slice(0, 10)}.csv`)}
          disabled={items.length === 0}
          className="text-xs h-8"
        >
          Export this page
        </Button>
      </div>

      {/* ── Search bar row ── */}
      <div className="pm-worklist-toolbar rounded-lg p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={source} onValueChange={(value) => { setSource(value ?? "hubspot"); setOffset(0); setExpandedId(null); }}>
            <SelectTrigger aria-label="Item source" className="w-full sm:w-48"><SelectValue>{source === "hubspot" ? "HubSpot quotes" : source === "qbo" ? "QBO invoice history" : "Both sources"}</SelectValue></SelectTrigger>
            <SelectContent><SelectItem value="hubspot">HubSpot quotes</SelectItem><SelectItem value="qbo">QBO invoice history</SelectItem><SelectItem value="all">Both sources</SelectItem></SelectContent>
          </Select>
          <Input
            aria-label="Search items"
            placeholder="Search SKU, description, project..."
            value={pendingQ}
            onChange={(e) => setPendingQ(e.target.value)}
            className="h-9 text-sm w-full sm:min-w-64 sm:flex-1"
          />

          {/* Filter button */}
          <div className="relative" ref={filterPanelRef}>
            <Button
              variant={activeFilterCount > 0 ? "default" : "outline"}
              size="sm"
              className="h-9 px-3 gap-1.5 flex-shrink-0"
              onClick={() => setFilterOpen((o) => !o)}
            >
              <FilterIcon active={activeFilterCount > 0} />
              <span className="text-xs">Filters</span>
              {activeFilterCount > 0 && (
                <span className="ml-0.5 text-xs font-semibold">{activeFilterCount}</span>
              )}
            </Button>

            {/* Dropdown panel */}
            {filterOpen && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-[min(16rem,calc(100vw-2rem))] space-y-4 rounded-lg border border-border bg-background p-4 shadow-lg">
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
                    onValueChange={(v) => { setFilters((f) => ({ ...f, year: v === "all" ? "" : (v || "") })); setOffset(0); }}
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
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => { clearAll(); setFilterOpen(false); }} className="w-full text-xs h-7 text-muted-foreground">
                    Clear filters
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {source !== "hubspot" && <p className="mt-3 text-sm text-muted-foreground">{source === "all" ? "Quotes and invoices may represent the same work. " : "Historical billed items. "}Invoice amounts may be deposits, installments or additions; they may not represent the full agreed price.</p>}
        {/* Active filter chips */}
        {activeFilterChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {activeFilterChips.map((f) => (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-accent text-accent-foreground border border-border"
              >
                {f.label}
                <button
                  onClick={() => clearFilter(f.key)}
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                >×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <div className="pm-workspace-section min-w-0">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-3">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">
            {loading
              ? "Loading..."
              : total > 0
              ? `${total.toLocaleString()} result${total === 1 ? "" : "s"}${total > LIMIT ? ` — showing ${offset + 1}–${Math.min(offset + LIMIT, total)}` : ""}`
              : hasFilters ? "No results match your filters" : "No line items found"}
          </span>
          {total > LIMIT && (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
                ← Prev
              </Button>
              <span className="text-xs text-muted-foreground px-2">
                {Math.floor(offset / LIMIT) + 1} / {Math.ceil(total / LIMIT)}
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={offset + LIMIT >= total || loading} onClick={() => setOffset(offset + LIMIT)}>
                Next →
              </Button>
            </div>
          )}
        </div>

        <div data-layout="responsive-list" className="divide-y lg:hidden">
          {loading ? <p className="py-8 text-sm text-muted-foreground">Loading items…</p> : items.map(item => <article key={item.id} className="space-y-3 py-4">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><span className="text-xs font-medium text-muted-foreground">{item.source === "hubspot" ? "HubSpot" : "QBO"}</span>{item.sku ?? "—"}</span><span className="whitespace-nowrap">{fmtDate(item.source_date)}</span></div>
            <button type="button" className="block text-left text-sm font-medium break-words" aria-expanded={expandedId === item.id} onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}>{item.description ?? "Unnamed item"}</button>
            <p className="text-sm text-muted-foreground break-words">{item.project_name ?? "—"}</p>
            <dl className="grid grid-cols-3 gap-3 text-sm tabular-nums"><div><dt className="text-xs text-muted-foreground">Quantity</dt><dd>{item.quantity ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Unit price</dt><dd>{fmt(item.unit_cost)}</dd></div><div><dt className="text-xs text-muted-foreground">Line total</dt><dd className="font-medium">{fmt(item.line_total)}</dd></div></dl>
            {expandedId === item.id && <div className="space-y-2 text-sm"><p className="break-words">{item.source === "hubspot" ? "Quote reference" : "Invoice number"}: {item.source_ref ?? "—"}</p><p className="text-xs text-muted-foreground">Imported {new Date(item.synced_at).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}. {item.source === "hubspot" ? "Date is the deal close date; prices are quoted selling prices." : "Date is the invoice date; prices may reflect partial billing. — means not supplied or mixed prices."}</p><a className="text-primary underline" target="_blank" rel="noopener noreferrer" href={item.source === "qbo" ? `https://app.qbo.intuit.com/app/invoice?txnId=${item.source_id}` : item.hubspot_deal_id ? `https://app.hubspot.com/contacts/23392178/deal/${item.hubspot_deal_id}` : `https://app.hubspot.com/quotes/23392178/${item.source_id}`}>Open {item.source === "hubspot" ? "HubSpot" : "QBO"} →</a></div>}
          </article>)}
          {!loading && !items.length && <p className="py-8 text-sm text-muted-foreground">No items match your search.</p>}
        </div>
        <div data-layout="responsive-table" className="hidden min-w-0 overflow-x-auto lg:block">
          <Table data-layout="fluid-table">
            <colgroup>{[7,8,26,21,11,5,11,11].map((width,index)=><col key={index} style={{width: `${width}%`}} />)}</colgroup>
            <TableHeader>
              <TableRow>
                <TableHead aria-sort={sortCol === "source" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=" w-20"><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("source")}> Source <SortArrow col="source" /></button></TableHead>
                <TableHead aria-sort={sortCol === "sku" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=" w-24"><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("sku")}> SKU <SortArrow col="sku" /></button></TableHead>
                <TableHead aria-sort={sortCol === "description" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=""><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("description")}> Description <SortArrow col="description" /></button></TableHead>
                <TableHead aria-sort={sortCol === "project_name" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=""><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("project_name")}> Project <SortArrow col="project_name" /></button></TableHead>
                <TableHead aria-sort={sortCol === "source_date" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=" w-28"><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("source_date")}> Date <SortArrow col="source_date" /></button></TableHead>
                <TableHead className="text-right w-12 select-none">Qty</TableHead>
                <TableHead aria-sort={sortCol === "unit_cost" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=" text-right w-28"><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("unit_cost")}> Unit price <SortArrow col="unit_cost" /></button></TableHead>
                <TableHead aria-sort={sortCol === "line_total" ? (sortDir === "asc" ? "ascending" : "descending") : "none"} className=" text-right w-28"><button type="button" className="inline-flex items-center font-medium whitespace-nowrap" onClick={() => toggleSort("line_total")}> Line total <SortArrow col="line_total" /></button></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
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
                    <span className="text-xs font-medium text-muted-foreground">{item.source === "hubspot" ? "HubSpot" : "QBO"}</span>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums text-muted-foreground break-words">{item.sku ?? "—"}</TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <button type="button" aria-expanded={expandedId === item.id} onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === item.id ? null : item.id); }} className="block w-full text-left text-sm font-medium whitespace-normal break-words" title={item.description ?? undefined} style={expandedId === item.id ? undefined : { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.description ?? "Unnamed item"}</button>
                    {expandedId === item.id && (
                      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-xs border-t border-border pt-3 sm:grid-cols-2">
                        <div className="sm:col-span-2 min-w-0">
                          <span className="text-muted-foreground">{item.source === "qbo" ? "Invoice number: " : "Job #/Deal Name: "}</span>
                          <span className="font-medium whitespace-normal break-words">{item.source_ref ?? "—"}</span>
                        </div>
                        <p className="sm:col-span-2 text-muted-foreground">Imported {new Date(item.synced_at).toLocaleDateString("en-US", { timeZone: "America/Chicago" })}. {item.source === "hubspot" ? "Date shown is the deal close date. Prices are quoted selling prices." : "Date shown is the invoice date. Unit price may reflect partial billing; — means not supplied or mixed prices."}</p>
                        {item.vendor && (
                          <div className="min-w-0 sm:col-span-2">
                            <span className="text-muted-foreground">Vendor: </span>
                            <span className="font-medium whitespace-normal break-words">{item.vendor}</span>
                          </div>
                        )}
                        <div className="col-span-1 flex gap-3 mt-1 sm:col-span-2">
                          {item.source === "hubspot" && (
                            <a
                              href={
                                item.hubspot_deal_id
                                  ? `https://app.hubspot.com/contacts/23392178/deal/${item.hubspot_deal_id}`
                                  : `https://app.hubspot.com/quotes/23392178/${item.source_id}`
                              }
                              target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                              View in HubSpot →
                            </a>
                          )}
                          {item.source === "qbo" && (
                            <a href={`https://app.qbo.intuit.com/app/invoice?txnId=${item.source_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
                              View in QBO →
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-normal break-words" title={item.project_name ?? undefined}>{item.project_name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(item.source_date)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{item.quantity ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums whitespace-nowrap">{fmt(item.unit_cost)}</TableCell>
                  <TableCell className="text-right text-sm font-medium tabular-nums whitespace-nowrap">{fmt(item.line_total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {total > LIMIT && (
          <div className="flex justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Previous</Button>
            <span className="text-xs text-muted-foreground self-center">Page {Math.floor(offset / LIMIT) + 1} of {Math.ceil(total / LIMIT)}</span>
            <Button variant="outline" size="sm" disabled={offset + LIMIT >= total || loading} onClick={() => setOffset(offset + LIMIT)}>Next →</Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
