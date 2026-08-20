"use client";

import { useState } from "react";

type Line = { itemName: string; buildItem?: string; lineType: string; internalCost: number; clientPrice: number; confidence?: "high" | "medium" | "low"; evidenceRefs?: string[]; pricingBasis?: "user_input" | "tracker_evidence" | "expert_estimate" | "blended"; assumption?: string };
type QuoteRevision = { id: string; revision_number: number; internal_cost: number; sell_price: number; margin_pct: number; assumptions_json: string[]; evidence_json?: unknown[]; quote_json: { lineItems?: Line[] } };

type Props = {
  workspaceId: string;
  revision: QuoteRevision | null;
  previousRevision?: QuoteRevision | null;
  workingSheet: { url: string; syncStatus: string } | null;
  onClose: () => void;
  onSaveRevision: (quoteJson: { lineItems: Line[] }, assumptions: string[]) => Promise<void>;
  onNaturalLanguageRevision: (instruction: string) => Promise<void>;
  onCreateWorkingSheet: () => Promise<void>;
  onOpenWorkingSheet: () => void;
  onOpenEvidenceRef: (reference: string) => void;
  onAcceptRevision: () => Promise<void>;
  onPreviewHandoff: () => Promise<{ proposedActions: string[]; previewOnly: boolean } | null>;
};

export function AdaQuoteCanvas({ workspaceId, revision, previousRevision, workingSheet, onClose, onSaveRevision, onNaturalLanguageRevision, onCreateWorkingSheet, onOpenWorkingSheet, onOpenEvidenceRef, onAcceptRevision, onPreviewHandoff }: Props) {
  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<Line[]>(revision?.quote_json?.lineItems ?? []);
  const [saving, setSaving] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [creatingSheet, setCreatingSheet] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [handoffPreview, setHandoffPreview] = useState<string[] | null>(null);
  if (!revision) return <aside aria-label="Quote canvas" className="flex h-full min-w-[22rem] flex-1 flex-col border-l border-border bg-background"><header className="flex h-14 items-center justify-between border-b border-border px-4"><p className="text-sm font-semibold">Quote canvas</p><button type="button" onClick={onClose}>×</button></header><div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">Generate an estimate from grounded Ada evidence to start a reviewable quote.</div></aside>;
  const quoteRevision = revision;
  const groupedLines = lines.reduce<Record<string, Line[]>>((groups, line) => { const key = line.buildItem || "General"; (groups[key] ??= []).push(line); return groups; }, {});
  const internalCost = lines.reduce((sum, line) => sum + Number(line.internalCost || 0), 0);
  const sellPrice = lines.reduce((sum, line) => sum + Number(line.clientPrice || 0), 0);
  const margin = sellPrice ? ((sellPrice - internalCost) / sellPrice) * 100 : 0;
  const priceDelta = sellPrice - (previousRevision?.sell_price ?? sellPrice);
  const marginDelta = margin - (previousRevision?.margin_pct ?? margin);
  async function save() { setSaving(true); await onSaveRevision({ lineItems: lines }, quoteRevision.assumptions_json); setSaving(false); setEditing(false); }
  return <aside aria-label="Quote canvas" className="flex h-full min-w-[22rem] flex-1 flex-col border-l border-border bg-background">
    <header className="flex h-14 items-center justify-between border-b border-border px-4"><div><p className="text-sm font-semibold">Quote canvas</p><p className="text-xs text-muted-foreground">Revision {revision.revision_number}</p></div><div className="flex gap-2"><a href={`/api/ada/workspaces/${workspaceId}/revisions/${revision.id}/xlsx`} className="text-xs">Download XLSX</a>{workingSheet ? <button type="button" onClick={onOpenWorkingSheet} className="text-xs">Open sheet</button> : <button disabled={creatingSheet} type="button" onClick={() => { setCreatingSheet(true); void onCreateWorkingSheet().finally(() => setCreatingSheet(false)); }} className="text-xs">{creatingSheet ? "Creating…" : "Create working sheet"}</button>}<button type="button" onClick={() => setEditing(!editing)} className="text-xs">{editing ? "Cancel" : "Edit quote"}</button><button disabled={accepting} type="button" onClick={() => { if (window.confirm(`Accept revision ${revision.revision_number}? This records the accepted quote but does not hand off downstream.`)) { setAccepting(true); void onAcceptRevision().finally(() => setAccepting(false)); } }} className="text-xs">{accepting ? "Accepting…" : "Accept revision"}</button><button type="button" onClick={onClose}>×</button></div></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid grid-cols-3 gap-2 text-xs"><div><p className="text-muted-foreground">Internal cost</p><p className="mt-1 font-semibold">${internalCost.toLocaleString()}</p></div><div><p className="text-muted-foreground">Sell price</p><p className="mt-1 font-semibold">${sellPrice.toLocaleString()}</p></div><div><p className="text-muted-foreground">Margin</p><p className="mt-1 font-semibold">{margin.toFixed(1)}%</p></div></div>
      {workingSheet ? <div className="mt-3 text-xs text-muted-foreground">Working sheet · {workingSheet.syncStatus}</div> : null}
      {previousRevision ? <div className="mt-3 flex gap-3 text-xs text-muted-foreground"><span>Price change {priceDelta >= 0 ? "+" : ""}${priceDelta.toLocaleString()}</span><span>Margin change {marginDelta >= 0 ? "+" : ""}{marginDelta.toFixed(1)} pts</span></div> : null}
      <section className="mt-4 rounded-md border border-border p-3"><div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">Downstream handoff</p><p className="text-xs text-muted-foreground">Preview only. Nothing is created or changed in Tracker or HubSpot.</p></div><button type="button" onClick={() => void onPreviewHandoff().then((preview) => setHandoffPreview(preview?.proposedActions ?? null))} className="rounded border border-border px-2 py-1 text-xs">Preview handoff</button></div>{handoffPreview ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">{handoffPreview.map((action) => <li key={action}>{action}</li>)}</ul> : null}</section>
      <div className="mt-5 space-y-5">{Object.entries(groupedLines).map(([buildItem, group]) => <section key={buildItem}><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Build item · {buildItem}</p><div className="mt-2 space-y-2">{group.map((line, index) => <div key={`${line.itemName}-${index}`} className="border-b border-border pb-2"><p className="text-sm font-medium">{line.itemName}</p>{editing ? <div className="mt-1 grid grid-cols-2 gap-2"><input aria-label={`Cost for ${line.itemName}`} type="number" value={line.internalCost} onChange={(event) => setLines(lines.map((entry) => entry === line ? { ...entry, internalCost: Number(event.target.value) } : entry))} className="h-8 rounded border px-2 text-xs" /><input aria-label={`Sell price for ${line.itemName}`} type="number" value={line.clientPrice} onChange={(event) => setLines(lines.map((entry) => entry === line ? { ...entry, clientPrice: Number(event.target.value) } : entry))} className="h-8 rounded border px-2 text-xs" /></div> : <><p className="text-xs text-muted-foreground">{line.lineType} · Cost ${line.internalCost.toLocaleString()} · Sell ${line.clientPrice.toLocaleString()}</p><p className="mt-1 text-[11px] text-muted-foreground">Confidence · {line.confidence ?? "medium"}{line.pricingBasis ? <> · Pricing basis · {line.pricingBasis.replaceAll("_", " ")}</> : null} · Evidence · {(line.evidenceRefs ?? []).length ? (line.evidenceRefs ?? []).map((reference) => <button key={reference} type="button" onClick={() => onOpenEvidenceRef(reference)} className="mr-1 underline">{reference}</button>) : "not linked"}</p>{line.assumption ? <p className="mt-1 text-[11px] text-muted-foreground">Assumption · {line.assumption}</p> : null}</>}</div>)}</div></section>)}</div>
      {editing ? <button disabled={saving} type="button" onClick={() => void save()} className="mt-4 rounded-md bg-foreground px-3 py-2 text-xs text-background">{saving ? "Saving…" : "Save revision"}</button> : null}
      <section className="mt-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ask Ada to revise</p><div className="mt-2 flex gap-2"><input value={instruction} onChange={(event) => setInstruction(event.target.value)} placeholder="Use SEG fabric instead" className="min-w-0 flex-1 rounded border px-2 py-1.5 text-xs" /><button disabled={!instruction.trim() || saving} type="button" onClick={() => void onNaturalLanguageRevision(instruction)} className="rounded border px-2 text-xs">Revise</button></div></section>
      <section className="mt-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assumptions</p><ul className="mt-2 space-y-1 text-sm">{revision.assumptions_json.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></section>
    </div>
  </aside>;
}
