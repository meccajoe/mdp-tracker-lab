"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildProposalAcceptanceRequest,
  buildProposalRejectionRequest,
  cloneProposalSnapshot,
  describeProposalEvidence,
  MAX_PROPOSAL_REASON_CODE_POINTS,
  normalizeEditedProposalSnapshot,
  type ProposalSnapshot,
} from "@/lib/ada-proposal-review";

export type ProposalLineItem = {
  itemName: string;
  buildItem?: string;
  lineType: string;
  internalCost: number;
  clientPrice: number;
  confidence?: "high" | "medium" | "low";
  evidenceRefs?: string[];
  pricingBasis?: string;
  assumption?: string;
};

export type AdaProposalReviewData = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  expectedRowVersion: number;
  createdAt: string;
  createdByEmail: string;
  proposedRevision: { lineItems: ProposalLineItem[] };
  proposedAssumptions: string[];
  proposedEvidence: unknown[];
  reason: string | null;
  acceptedRevisionId?: string | null;
  proposalDelta?: AdaProposalDelta | null;
};

export type AdaProposalDelta = {
  added?: unknown[];
  removed?: unknown[];
  changed?: unknown[];
  internalCostDelta?: number;
  sellPriceDelta?: number;
};

type Props = {
  proposal: AdaProposalReviewData;
  proposalDelta?: AdaProposalDelta | null;
  onClose: () => void;
  onAccept: (proposalId: string, request: ReturnType<typeof buildProposalAcceptanceRequest>) => Promise<void>;
  onEditAccept: (proposalId: string, request: ReturnType<typeof buildProposalAcceptanceRequest>) => Promise<void>;
  onReject: (proposalId: string, request: ReturnType<typeof buildProposalRejectionRequest>) => Promise<void>;
  onOpenEvidence?: (assetId: string, pageNumber: number | null) => void;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
export function AdaProposalReview({ proposal, proposalDelta, onClose, onAccept, onEditAccept, onReject, onOpenEvidence }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [snapshot, setSnapshot] = useState<ProposalSnapshot>(() => cloneProposalSnapshot(proposal));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = proposal.status === "pending";
  useEffect(() => { setSnapshot(cloneProposalSnapshot(proposal)); setMode("view"); setReason(""); }, [proposal.id, proposal.expectedRowVersion]);

  const lineItems = snapshot.quoteJson.lineItems as ProposalLineItem[];
  const totals = useMemo(() => lineItems.reduce((result, line) => ({ cost: result.cost + Number(line.internalCost || 0), sell: result.sell + Number(line.clientPrice || 0) }), { cost: 0, sell: 0 }), [lineItems]);
  const margin = totals.sell ? ((totals.sell - totals.cost) / totals.sell) * 100 : 0;
  const rejectionReasonLength = Array.from(reason.trim()).length;
  const editedSnapshotIsValid = useMemo(() => {
    try {
      normalizeEditedProposalSnapshot(snapshot);
      return lineItems.length > 0;
    } catch {
      return false;
    }
  }, [lineItems.length, snapshot]);
  const groups = lineItems.reduce<Record<string, ProposalLineItem[]>>((result, line) => { (result[line.buildItem || "General"] ??= []).push(line); return result; }, {});

  const [dispositionError, setDispositionError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setDispositionError(null);
    try { await action(); }
    catch (error) { setDispositionError(error instanceof Error ? error.message : "Could not update this proposal."); }
    finally { setBusy(false); }
  };
  const updateLine = (index: number, field: "internalCost" | "clientPrice", value: string) => setSnapshot((current) => ({ ...current, quoteJson: { lineItems: current.quoteJson.lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line) } }));

  return <section aria-label="Proposal review" className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
    {dispositionError ? <p role="alert" className="border-b border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{dispositionError}</p> : null}
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-muted/20 p-4 sm:p-5">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">{proposal.status}</span><span className="text-xs text-muted-foreground">Proposal review</span></div><h2 className="mt-2 text-lg font-semibold">Ada recommends a quote update</h2><p className="mt-1 text-sm text-muted-foreground">Prepared by {proposal.createdByEmail} · {new Date(proposal.createdAt).toLocaleDateString()}</p></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><button type="button" aria-label="Close proposal review" title="Close proposal review" onClick={onClose} className="min-h-10 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent">Close</button>{editable ? <><button type="button" disabled={busy} onClick={() => void run(() => onAccept(proposal.id, buildProposalAcceptanceRequest(proposal)))} className="min-h-10 flex-1 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 sm:flex-none">{busy ? "Saving…" : "Accept proposal"}</button><button type="button" disabled={busy} onClick={() => setMode(mode === "edit" ? "view" : "edit")} className="min-h-10 flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50 sm:flex-none">Edit &amp; accept</button><button type="button" disabled={busy} onClick={() => setMode(mode === "reject" ? "view" : "reject")} className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">Reject proposal</button></> : null}</div>
    </header>
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:max-w-md"><Metric label="Internal cost" value={money(totals.cost)} /><Metric label="Sell price" value={money(totals.sell)} /><Metric label="Margin" value={`${margin.toFixed(1)}%`} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md"><Metric label="Added" value={String(proposalDelta?.added?.length ?? 0)} /><Metric label="Removed" value={String(proposalDelta?.removed?.length ?? 0)} /><Metric label="Changed" value={String(proposalDelta?.changed?.length ?? 0)} /></div>
        <p className="mt-3 text-xs text-muted-foreground">Sell change {money(proposalDelta?.sellPriceDelta ?? 0)} · Cost change {money(proposalDelta?.internalCostDelta ?? 0)}</p>
        <ProposalChangeDetails delta={proposalDelta} onOpenEvidence={onOpenEvidence} />
        <div className="mt-6 space-y-6">{Object.entries(groups).map(([group, lines]) => <section key={group}><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3><div className="mt-2 overflow-x-auto rounded-xl border border-border"><div className="min-w-[38rem] divide-y divide-border">{lines.map((line) => { const index = snapshot.quoteJson.lineItems.indexOf(line); return <article key={stableOccurrenceKey(lineItems, index, proposalLineKey)} className="grid grid-cols-[minmax(13rem,1fr)_6.5rem_6.5rem] items-center gap-3 p-3 sm:grid-cols-[minmax(16rem,1fr)_7rem_7rem]"><div className="min-w-0"><p className="truncate text-sm font-medium">{line.itemName}</p><p className="mt-1 text-xs text-muted-foreground">{line.lineType} · {line.confidence ?? "medium"} confidence{line.pricingBasis ? ` · ${line.pricingBasis.replaceAll("_", " ")}` : ""}</p>{line.assumption ? <p className="mt-1 text-xs text-muted-foreground">Assumption · {line.assumption}</p> : null}</div>{mode === "edit" ? <input required aria-label={`Cost for ${line.itemName}`} type="number" min="0" value={line.internalCost} onChange={(event) => updateLine(index, "internalCost", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" /> : <p className="text-right text-sm text-muted-foreground">{money(line.internalCost)}</p>}{mode === "edit" ? <input required aria-label={`Sell price for ${line.itemName}`} type="number" min="0" value={line.clientPrice} onChange={(event) => updateLine(index, "clientPrice", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" /> : <p className="text-right text-sm font-semibold">{money(line.clientPrice)}</p>}</article>; })}</div></div></section>)}</div>
        {mode === "edit" ? <><button type="button" disabled={busy || !editedSnapshotIsValid} onClick={() => void run(() => onEditAccept(proposal.id, buildProposalAcceptanceRequest(proposal, normalizeEditedProposalSnapshot(snapshot))))} className="mt-5 min-h-10 w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">{busy ? "Saving edited proposal…" : "Save edits & accept"}</button>{!editedSnapshotIsValid ? <p className="mt-2 text-xs text-destructive">Every cost and sell price must be a non-negative number.</p> : null}</> : null}
      </div>
      <aside className="border-t border-border bg-muted/10 p-4 sm:p-5 md:border-l md:border-t-0">
        {mode === "edit" ? (
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" htmlFor="proposal-assumptions">Assumptions</label>
            <textarea aria-label="Edit proposal assumptions" id="proposal-assumptions" value={snapshot.assumptions.join("\n")} onChange={(event) => setSnapshot((current) => ({ ...current, assumptions: event.target.value.split("\n").map((item) => item.trim()).filter(Boolean) }))} rows={7} className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm" />
          </div>
        ) : <ReviewList title="Assumptions" items={snapshot.assumptions} empty="No assumptions recorded." />}
        <EvidenceDetails items={snapshot.evidence} onOpenEvidence={onOpenEvidence} />
        <p className="mt-6 text-xs leading-5 text-muted-foreground">Accepting creates a draft canonical revision only. It does not commercially approve, publish, create a project, provision downstream systems, or operationally release anything.</p>
        {mode === "reject" ? (
          <div className="mt-6">
            <label className="text-sm font-medium" htmlFor="proposal-rejection-reason">Why reject this proposal?</label>
            <textarea required id="proposal-rejection-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={4} className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm" />
            <p className="mt-1 text-right text-xs text-muted-foreground">{rejectionReasonLength.toLocaleString()} / {MAX_PROPOSAL_REASON_CODE_POINTS.toLocaleString()}</p>
            <button type="button" disabled={busy || !reason.trim() || rejectionReasonLength > MAX_PROPOSAL_REASON_CODE_POINTS} onClick={() => void run(() => onReject(proposal.id, buildProposalRejectionRequest(proposal, reason)))} className="mt-2 min-h-10 w-full rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50">Confirm rejection</button>
          </div>
        ) : null}
        {!editable ? (
          <div className="mt-6 rounded-xl border border-border bg-background p-3 text-sm">
            <p className="font-semibold">Disposition recorded</p>
            <p className="mt-1 text-muted-foreground">{proposal.status === "accepted" ? "This proposal created a draft revision." : proposal.reason || "This proposal was rejected."}</p>
          </div>
        ) : null}
      </aside>
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>; }
function stableOccurrenceKey<T>(items: T[], index: number, getBase: (item: T) => string) {
  const base = getBase(items[index]);
  const occurrence = items.slice(0, index + 1).filter((item) => getBase(item) === base).length;
  return `${base}::${occurrence}`;
}
function proposalLineKey(line: ProposalLineItem) { return `${line.buildItem ?? "general"}::${line.itemName}::${line.lineType}`.toLowerCase(); }
function ReviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>{items.length ? <ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{items.map((item, index) => <li key={stableOccurrenceKey(items, index, (value) => value)}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{empty}</p>}</div>; }

function LineEvidenceRefs({ refs, onOpenEvidence }: { refs: string[]; onOpenEvidence?: (assetId: string, pageNumber: number | null) => void }) {
  if (!refs.length) return <p className="text-xs text-muted-foreground">No line-level evidence references.</p>;
  return <ul className="mt-1 flex flex-wrap gap-1">{refs.map((ref, index) => {
    const evidence = describeProposalEvidence(ref, index);
    return <li key={stableOccurrenceKey(refs, index, (value) => value)}>{evidence.assetId && onOpenEvidence ? <button type="button" onClick={() => onOpenEvidence(evidence.assetId!, evidence.pageNumber)} className="rounded border border-border px-2 py-1 text-xs underline-offset-4 hover:underline">{evidence.label}{evidence.pageNumber ? ` · page ${evidence.pageNumber}` : ""}</button> : <span className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">{evidence.label}</span>}</li>;
  })}</ul>;
}

function LineSnapshotDetails({ label, line, onOpenEvidence }: { label?: string; line: ProposalLineItem; onOpenEvidence?: (assetId: string, pageNumber: number | null) => void }) {
  return <div className="mt-2 rounded-lg border border-border/70 bg-muted/20 p-2 text-xs">
    {label ? <p className="font-semibold uppercase tracking-wide text-muted-foreground">{label}</p> : null}
    <p className="mt-1 font-medium">{line.itemName}</p>
    <p className="mt-1 text-muted-foreground">{line.buildItem || "General"} · {line.lineType}</p>
    <p className="mt-1 text-muted-foreground">Cost {money(Number(line.internalCost))} · Sell {money(Number(line.clientPrice))}</p>
    <p className="mt-1 text-muted-foreground">Confidence {line.confidence ?? "medium"}{line.pricingBasis ? ` · Pricing ${line.pricingBasis.replaceAll("_", " ")}` : ""}</p>
    {line.assumption ? <p className="mt-1 text-muted-foreground">Assumption · {line.assumption}</p> : null}
    <LineEvidenceRefs refs={line.evidenceRefs ?? []} onOpenEvidence={onOpenEvidence} />
  </div>;
}

function ProposalChangeDetails({ delta, onOpenEvidence }: { delta?: AdaProposalDelta | null; onOpenEvidence?: (assetId: string, pageNumber: number | null) => void }) {
  const groups = [
    { label: "Added lines", entries: delta?.added ?? [], tone: "text-emerald-700" },
    { label: "Removed lines", entries: delta?.removed ?? [], tone: "text-destructive" },
    { label: "Changed lines", entries: delta?.changed ?? [], tone: "text-amber-700" },
  ];
  if (!groups.some((group) => group.entries.length)) return null;
  return <div className="mt-4 grid gap-3 lg:grid-cols-3">{groups.filter((group) => group.entries.length).map((group) => <section key={group.label} className="rounded-xl border border-border p-3"><h3 className={`text-xs font-semibold uppercase tracking-wide ${group.tone}`}>{group.label}</h3><ul className="mt-2 space-y-3 text-sm">{group.entries.map((entry, index) => {
    const change = entry as Record<string, unknown>;
    const line = change.line as ProposalLineItem | undefined;
    const before = change.before as ProposalLineItem | undefined;
    const after = change.after as ProposalLineItem | undefined;
    const item = line ?? after ?? before;
    const label = String(item?.itemName ?? change.itemName ?? change.key ?? `Line ${index + 1}`);
    return <li key={stableOccurrenceKey(group.entries, index, (value) => String((value as Record<string, unknown>).key ?? (value as Record<string, unknown>).itemName ?? "line"))}>
      <p className="font-medium">{label}</p>
      {before && after ? <div className="grid gap-2"><LineSnapshotDetails label="Before" line={before} onOpenEvidence={onOpenEvidence} /><LineSnapshotDetails label="After" line={after} onOpenEvidence={onOpenEvidence} /></div> : line ? <LineSnapshotDetails line={line} onOpenEvidence={onOpenEvidence} /> : null}
    </li>;
  })}</ul></section>)}</div>;
}

function EvidenceDetails({ items, onOpenEvidence }: { items: unknown[]; onOpenEvidence?: (assetId: string, pageNumber: number | null) => void }) {
  return <div className="mt-6"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p>{items.length ? <ul className="mt-2 space-y-2 text-sm">{items.map((item, index) => { const evidence = describeProposalEvidence(item, index); return <li key={stableOccurrenceKey(items, index, (value) => JSON.stringify(value))} className="rounded-lg border border-border bg-background p-2">{evidence.assetId && onOpenEvidence ? <button type="button" onClick={() => onOpenEvidence(evidence.assetId!, evidence.pageNumber)} className="min-h-10 text-left font-medium underline-offset-4 hover:underline">{evidence.label}{evidence.pageNumber ? ` · page ${evidence.pageNumber}` : ""}</button> : <span>{evidence.label}</span>}</li>; })}</ul> : <p className="mt-2 text-sm text-muted-foreground">No evidence recorded.</p>}</div>;
}
