"use client";

import { useEffect, useMemo, useState } from "react";

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
};

type Snapshot = {
  quoteJson: { lineItems: ProposalLineItem[] };
  assumptions: string[];
  evidence: unknown[];
};

type Props = {
  proposal: AdaProposalReviewData;
  onAccept: (args: { proposalId: string; expectedRowVersion: number; dispositionIdempotencyKey: string }) => Promise<void>;
  onEditAccept: (args: { proposalId: string; expectedRowVersion: number; dispositionIdempotencyKey: string; quoteJson: Snapshot["quoteJson"]; assumptions: string[]; evidence: unknown[] }) => Promise<void>;
  onReject: (args: { proposalId: string; expectedRowVersion: number; dispositionIdempotencyKey: string; reason: string }) => Promise<void>;
};

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
const snapshotFrom = (proposal: AdaProposalReviewData): Snapshot => ({
  quoteJson: { lineItems: proposal.proposedRevision.lineItems.map((line) => ({ ...line })) },
  assumptions: [...proposal.proposedAssumptions],
  evidence: [...proposal.proposedEvidence],
});

export function AdaProposalReview({ proposal, onAccept, onEditAccept, onReject }: Props) {
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [snapshot, setSnapshot] = useState<Snapshot>(() => snapshotFrom(proposal));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const editable = proposal.status === "pending";
  useEffect(() => { setSnapshot(snapshotFrom(proposal)); setMode("view"); setReason(""); }, [proposal.id, proposal.expectedRowVersion]);

  const totals = useMemo(() => snapshot.quoteJson.lineItems.reduce((result, line) => ({ cost: result.cost + Number(line.internalCost || 0), sell: result.sell + Number(line.clientPrice || 0) }), { cost: 0, sell: 0 }), [snapshot]);
  const margin = totals.sell ? ((totals.sell - totals.cost) / totals.sell) * 100 : 0;
  const groups = snapshot.quoteJson.lineItems.reduce<Record<string, ProposalLineItem[]>>((result, line) => { (result[line.buildItem || "General"] ??= []).push(line); return result; }, {});
  const key = () => `${proposal.id}:${Date.now()}`;
  const run = async (action: () => Promise<void>) => { setBusy(true); try { await action(); } finally { setBusy(false); } };
  const updateLine = (index: number, field: "internalCost" | "clientPrice", value: string) => setSnapshot((current) => ({ ...current, quoteJson: { lineItems: current.quoteJson.lineItems.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: Number(value) } : line) } }));

  return <section aria-label="Proposal review" className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border bg-muted/20 p-4 sm:p-5">
      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">{proposal.status}</span><span className="text-xs text-muted-foreground">Proposal review</span></div><h2 className="mt-2 text-lg font-semibold">Ada recommends a quote update</h2><p className="mt-1 text-sm text-muted-foreground">Prepared by {proposal.createdByEmail} · {new Date(proposal.createdAt).toLocaleDateString()}</p></div>
      {editable ? <div className="flex w-full flex-wrap gap-2 sm:w-auto"><button type="button" disabled={busy} onClick={() => void run(() => onAccept({ proposalId: proposal.id, expectedRowVersion: proposal.expectedRowVersion, dispositionIdempotencyKey: key() }))} className="min-h-10 flex-1 rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 sm:flex-none">{busy ? "Saving…" : "Accept proposal"}</button><button type="button" disabled={busy} onClick={() => setMode(mode === "edit" ? "view" : "edit")} className="min-h-10 flex-1 rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50 sm:flex-none">Edit &amp; accept</button><button type="button" disabled={busy} onClick={() => setMode(mode === "reject" ? "view" : "reject")} className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">Reject proposal</button></div> : null}
    </header>
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-y-auto md:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 p-4 sm:p-5">
        <div className="grid grid-cols-3 gap-2 sm:max-w-md"><Metric label="Internal cost" value={money(totals.cost)} /><Metric label="Sell price" value={money(totals.sell)} /><Metric label="Margin" value={`${margin.toFixed(1)}%`} /></div>
        <div className="mt-6 space-y-6">{Object.entries(groups).map(([group, lines]) => <section key={group}><h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</h3><div className="mt-2 overflow-x-auto rounded-xl border border-border"><div className="min-w-[38rem] divide-y divide-border">{lines.map((line) => { const index = snapshot.quoteJson.lineItems.indexOf(line); return <article key={`${line.itemName}-${index}`} className="grid grid-cols-[minmax(13rem,1fr)_6.5rem_6.5rem] items-center gap-3 p-3 sm:grid-cols-[minmax(16rem,1fr)_7rem_7rem]"><div className="min-w-0"><p className="truncate text-sm font-medium">{line.itemName}</p><p className="mt-1 text-xs text-muted-foreground">{line.lineType} · {line.confidence ?? "medium"} confidence{line.pricingBasis ? ` · ${line.pricingBasis.replaceAll("_", " ")}` : ""}</p>{line.assumption ? <p className="mt-1 text-xs text-muted-foreground">Assumption · {line.assumption}</p> : null}</div>{mode === "edit" ? <input required aria-label={`Cost for ${line.itemName}`} type="number" min="0" value={line.internalCost} onChange={(event) => updateLine(index, "internalCost", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" /> : <p className="text-right text-sm text-muted-foreground">{money(line.internalCost)}</p>}{mode === "edit" ? <input required aria-label={`Sell price for ${line.itemName}`} type="number" min="0" value={line.clientPrice} onChange={(event) => updateLine(index, "clientPrice", event.target.value)} className="h-10 w-full rounded-lg border border-border bg-background px-2 text-right text-sm" /> : <p className="text-right text-sm font-semibold">{money(line.clientPrice)}</p>}</article>; })}</div></div></section>)}</div>
        {mode === "edit" ? <button type="button" disabled={busy || snapshot.quoteJson.lineItems.length === 0} onClick={() => void run(() => onEditAccept({ proposalId: proposal.id, expectedRowVersion: proposal.expectedRowVersion, dispositionIdempotencyKey: key(), ...snapshot }))} className="mt-5 min-h-10 w-full rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50">{busy ? "Saving edited proposal…" : "Save edits & accept"}</button> : null}
      </div>
      <aside className="border-t border-border bg-muted/10 p-4 sm:p-5 md:border-l md:border-t-0"><ReviewList title="Assumptions" items={snapshot.assumptions} empty="No assumptions recorded." /><div className="mt-6"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence</p><p className="mt-2 text-sm">{snapshot.evidence.length} grounded reference{snapshot.evidence.length === 1 ? "" : "s"}</p></div>{mode === "reject" ? <div className="mt-6"><label className="text-sm font-medium" htmlFor="proposal-rejection-reason">Why reject this proposal?</label><textarea required id="proposal-rejection-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={4} className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-2 text-sm" /><button type="button" disabled={busy || !reason.trim()} onClick={() => void run(() => onReject({ proposalId: proposal.id, expectedRowVersion: proposal.expectedRowVersion, dispositionIdempotencyKey: key(), reason: reason.trim() }))} className="mt-2 min-h-10 w-full rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">Confirm rejection</button></div> : null}{proposal.reason ? <div className="mt-6 rounded-lg border border-border p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Disposition note</p><p className="mt-1 text-sm">{proposal.reason}</p></div> : null}</aside>
    </div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-base font-semibold">{value}</p></div>; }
function ReviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) { return <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>{items.length ? <ul className="mt-2 list-disc space-y-2 pl-4 text-sm">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">{empty}</p>}</div>; }
