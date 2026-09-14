"use client";

import { useEffect, useMemo, useState } from "react";

import { adaFetch } from "@/lib/ada-client";

type ReviewTab = "lines" | "items" | "labor" | "history" | "exceptions" | "approval";
type Row = Record<string, any>;
type ReviewPayload = {
  workspace: Row;
  currentRevision: Row | null;
  revisions: Row[];
  commercialLines: Row[];
  revisionWorkPackages: Row[];
  workPackages: Row[];
  lineMappings: Row[];
  laborAllocations: Row[];
  workTypes: Row[];
  events: Row[];
  exceptions: Row[];
};

const tabs: Array<{ id: ReviewTab; label: string }> = [
  { id: "lines", label: "Commercial lines" },
  { id: "items", label: "Build Items" },
  { id: "labor", label: "Labor allocation" },
  { id: "history", label: "Revision history" },
  { id: "exceptions", label: "Exceptions" },
  { id: "approval", label: "Approval state" },
];

const money = (value: unknown) => value == null || value === "" ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
const number = (value: unknown) => value == null || value === "" ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value));
const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const date = (value: unknown) => value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value))) : "—";

function Status({ value }: { value: unknown }) {
  const text = label(value);
  const warning = /needs review|needs input|exception|mismatch|blocked|unallocated/i.test(text);
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${warning ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200" : "border-border bg-muted/40 text-foreground"}`}>{text}</span>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border-t border-dashed px-4 py-10 text-center text-sm text-muted-foreground">{children}</div>;
}

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto border-t border-border"><table className="min-w-[820px] w-full text-left text-sm">{children}</table></div>;
}

function Head({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap bg-muted/35 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</th>;
}

function Cell({ children, right = false, className = "" }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return <td className={`border-t border-border px-3 py-3 align-top ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}

export function QuoteReviewWorkspace({ workspaceId }: { workspaceId: string }) {
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>("lines");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    adaFetch(`/api/quote-workspaces/${workspaceId}/review`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || "Quote review could not load.");
        if (active) setPayload(body);
      })
      .catch((reason) => active && setError(reason instanceof Error ? reason.message : "Quote review could not load."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [workspaceId]);

  const packageByRevisionId = useMemo(() => new Map((payload?.revisionWorkPackages ?? []).map((row) => [row.id, row])), [payload]);
  const stablePackageById = useMemo(() => new Map((payload?.workPackages ?? []).map((row) => [row.id, row])), [payload]);
  const workTypeById = useMemo(() => new Map((payload?.workTypes ?? []).map((row) => [row.id, row])), [payload]);
  const mappingsByLine = useMemo(() => {
    const result = new Map<string, Row[]>();
    for (const row of payload?.lineMappings ?? []) result.set(row.commercial_line_id, [...(result.get(row.commercial_line_id) ?? []), row]);
    return result;
  }, [payload]);

  if (loading) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading normalized quote review…</div>;
  if (error) return <div role="alert" className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>;
  if (!payload) return null;

  const { workspace, currentRevision } = payload;
  return (
    <section data-slot="quote-review-workspace" className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">Operational quote review</h2>
              <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">Read-only review</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Current normalized revision · no approval, publication, or release actions are enabled.</p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <div><span className="text-muted-foreground">Workspace</span><p className="font-medium">{workspace.workspace_number || "—"}</p></div>
            <div><span className="text-muted-foreground">Revision</span><p className="font-medium">{currentRevision ? `R${currentRevision.revision_number}` : "None"}</p></div>
            <div><span className="text-muted-foreground">Lifecycle</span><p className="font-medium capitalize">{label(workspace.lifecycle_status)}</p></div>
          </div>
        </div>
        <nav aria-label="Quote review sections" className="mt-3 flex gap-4 overflow-x-auto border-b border-border">
          {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`shrink-0 border-b-2 px-0.5 pb-2 text-sm font-medium ${activeTab === tab.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{tab.label}{tab.id === "exceptions" && payload.exceptions.length ? ` (${payload.exceptions.length})` : ""}</button>)}
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!currentRevision ? <Empty>No current normalized revision is selected. Generate or accept a revision before operational review.</Empty> : null}

        {currentRevision && activeTab === "lines" && (payload.commercialLines.length ? <TableShell><thead><tr><Head>Line</Head><Head>Qty</Head><Head>Sell</Head><Head>Hours allowed</Head><Head>Labor budget</Head><Head>Materials / other</Head><Head>Formula</Head><Head>Build Item mapping</Head></tr></thead><tbody>{payload.commercialLines.map((line) => {
          const mappings = mappingsByLine.get(line.id) ?? [];
          return <tr key={line.id}><Cell><p className="font-medium">{line.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{line.sku || "No SKU"} · {label(line.line_type)}</p></Cell><Cell>{number(line.quantity)} {line.unit || ""}</Cell><Cell right>{money(line.final_sell_price)}</Cell><Cell right><span className="font-medium">{number(line.quoted_hours)} hrs</span></Cell><Cell right>{money(line.labor_budget)}</Cell><Cell right>{money(line.materials_other_budget)}</Cell><Cell><Status value={line.formula_status} /></Cell><Cell><Status value={line.production_mapping_status} />{mappings.length ? <p className="mt-1 text-xs text-muted-foreground">{mappings.length} mapped item{mappings.length === 1 ? "" : "s"}</p> : null}</Cell></tr>;
        })}</tbody></TableShell> : <Empty>No normalized commercial lines exist for this revision.</Empty>)}

        {currentRevision && activeTab === "items" && (payload.revisionWorkPackages.length ? <TableShell><thead><tr><Head>Build Item</Head><Head>Classification</Head><Head>Qty</Head><Head>Hours allowed</Head><Head>Labor budget</Head><Head>Materials / other</Head><Head>Status</Head></tr></thead><tbody>{payload.revisionWorkPackages.map((item) => {
          const stable = stablePackageById.get(item.work_package_id);
          return <tr key={item.id}><Cell><p className="font-medium">Item {String(stable?.item_number ?? "—").padStart(2, "0")} · {item.display_name}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.production_notes || item.description || "No production notes"}</p></Cell><Cell className="capitalize">{label(stable?.classification || item.line_type)}</Cell><Cell>{number(item.quantity)} {item.unit || ""}</Cell><Cell right><span className="font-medium">{number(item.total_quoted_hours)} hrs</span></Cell><Cell right>{money(item.labor_budget)}</Cell><Cell right>{money(item.materials_other_budget)}</Cell><Cell><Status value={stable?.status || "draft"} /></Cell></tr>;
        })}</tbody></TableShell> : <Empty>No normalized Build Items exist for this revision.</Empty>)}

        {currentRevision && activeTab === "labor" && (payload.laborAllocations.length ? <TableShell><thead><tr><Head>Build Item</Head><Head>Type of Work</Head><Head>Hours allowed</Head><Head>Labor value</Head><Head>Origin</Head><Head>Status</Head><Head>Notes</Head></tr></thead><tbody>{payload.laborAllocations.map((allocation) => {
          const item = packageByRevisionId.get(allocation.revision_work_package_id);
          const workType = workTypeById.get(allocation.work_type_id);
          return <tr key={allocation.id}><Cell>{item?.display_name || "Unknown Build Item"}</Cell><Cell>{workType?.display_name || "Unallocated"}</Cell><Cell right><span className="font-medium">{number(allocation.quoted_hours)} hrs</span></Cell><Cell right>{money(allocation.quoted_labor_value)}</Cell><Cell className="capitalize">{label(allocation.allocation_origin)}</Cell><Cell><Status value={allocation.allocation_status} /></Cell><Cell>{allocation.notes || "—"}</Cell></tr>;
        })}</tbody></TableShell> : <Empty>No Item × Type-of-Work labor allocations exist for this revision.</Empty>)}

        {activeTab === "history" && <div className="divide-y divide-border">{payload.revisions.map((revision) => <div key={revision.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[7rem_10rem_1fr_12rem]"><p className="font-medium">Revision {revision.revision_number}</p><Status value={revision.normalization_status} /><p className="text-muted-foreground capitalize">{label(revision.revision_kind)} · {label(revision.created_from)}</p><p className="text-muted-foreground sm:text-right">{date(revision.created_at)}</p></div>)}{payload.events.map((event) => <div key={event.event_id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[12rem_1fr_12rem]"><p className="font-medium capitalize">{label(event.event_type)}</p><p className="text-muted-foreground">{event.reason || `${label(event.prior_state)} → ${label(event.resulting_state)}`} · {event.actor_email}</p><p className="text-muted-foreground sm:text-right">{date(event.occurred_at)}</p></div>)}{!payload.revisions.length && !payload.events.length ? <Empty>No revision or workflow history exists.</Empty> : null}</div>}

        {activeTab === "exceptions" && (payload.exceptions.length ? <div className="divide-y divide-border">{payload.exceptions.map((exception) => <div key={exception.id} className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[8rem_10rem_1fr]"><Status value={exception.severity} /><p className="capitalize text-muted-foreground">{label(exception.area)}</p><p>{exception.message}</p></div>)}</div> : <Empty>No persisted normalization, formula, mapping, or labor-allocation exceptions are open.</Empty>)}

        {activeTab === "approval" && <div className="grid gap-0 divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">{[
          ["Current revision", workspace.current_revision_id],
          ["Commercial approval", workspace.commercial_approved_revision_id],
          ["HubSpot publication", workspace.hubspot_published_revision_id],
          ["Customer acceptance", workspace.customer_accepted_revision_id],
          ["Operational release", workspace.operationally_released_revision_id],
          ["Tracker project", workspace.tracker_project_id],
        ].map(([name, id]) => <div key={name} className="flex min-h-20 items-center justify-between gap-4 px-4 py-3"><div><p className="text-sm font-medium">{name}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{id || "Not recorded"}</p></div><Status value={id ? "recorded" : "not recorded"} /></div>)}</div>}
      </div>
    </section>
  );
}
