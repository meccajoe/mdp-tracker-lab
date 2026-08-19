"use client";

import { useEffect, useState } from "react";

import { AdaFileUpload } from "@/components/ada-file-upload";

type AdaAsset = {
  id: string;
  concept_id: string | null;
  original_name: string;
  mime_type: string;
  byte_size: number;
  analysis_status: "uploading" | "uploaded" | "analyzing" | "ready" | "failed";
  analysis_json?: { questions?: string[] } | null;
  created_at: string;
};

export function AdaEvidenceViewer({ workspaceId, conceptId, assets, initialAssetId, initialPage, onAskInChat, onChanged, onClose }: { workspaceId: string; conceptId: string; assets: AdaAsset[]; initialAssetId?: string | null; initialPage?: number | null; onAskInChat: (question: string) => void; onChanged: () => Promise<void>; onClose: () => void }) {
  const [selectedId, setSelectedId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleAssets = assets.filter((asset) => asset.concept_id === conceptId || asset.concept_id === null);
  const selected = visibleAssets.find((asset) => asset.id === selectedId) ?? visibleAssets[0] ?? null;

  useEffect(() => { if (initialAssetId && visibleAssets.some((asset) => asset.id === initialAssetId)) setSelectedId(initialAssetId); }, [initialAssetId, visibleAssets]);
  useEffect(() => { if (initialPage && initialPage > 0) setPage(initialPage); }, [initialPage]);

  useEffect(() => {
    if (!selected) {
      setPreviewUrl(null);
      return;
    }
    setSelectedId(selected.id);
    setPreviewUrl(null);
    fetch(`/api/ada/workspaces/${workspaceId}/assets/${selected.id}/url`).then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not load secure file preview.");
      return result.signedUrl as string;
    }).then(setPreviewUrl).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load file preview."));
  }, [selected?.id, workspaceId]);

  async function analyzeAsset() {
    if (!selected) return;
    setAnalyzingId(selected.id);
    setError(null);
    try {
      const response = await fetch(`/api/ada/workspaces/${workspaceId}/assets/${selected.id}/analyze`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Ada could not analyze this file.");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ada could not analyze this file.");
    } finally {
      setAnalyzingId(null);
    }
  }

  async function deleteAsset() {
    if (!selected || !window.confirm(`Delete ${selected.original_name}? This removes the uploaded file and its analysis.`)) return;
    setDeletingId(selected.id);
    setError(null);
    try {
      const response = await fetch(`/api/ada/workspaces/${workspaceId}/assets/${selected.id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error ?? "Could not delete this file.");
      setSelectedId("");
      await onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete this file.");
    } finally {
      setDeletingId(null);
    }
  }

  return <aside aria-label="Evidence viewer" className="flex h-full min-w-[22rem] flex-1 flex-col border-l border-border bg-background">
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4"><div className="min-w-0"><p className="truncate text-sm font-semibold">Files</p><p className="text-xs text-muted-foreground">{visibleAssets.length ? `${visibleAssets.length} attached` : "No files yet"}</p></div><div className="flex items-center gap-1"><AdaFileUpload workspaceId={workspaceId} conceptId={conceptId} onUploaded={onChanged} compact /><button type="button" aria-label="Close files" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">×</button></div></header>
    {error ? <p role="alert" className="m-3 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{error}</p> : null}
    <div className="flex min-h-0 flex-1 flex-col">{visibleAssets.length ? <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-2">{visibleAssets.map((asset) => <button key={asset.id} type="button" onClick={() => setSelectedId(asset.id)} className={`max-w-44 shrink-0 rounded-md px-2 py-1.5 text-left text-xs ${asset.id === selected?.id ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent"}`}><span className="block truncate">{asset.original_name}</span></button>)}</div> : null}
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/15 p-4">{!selected ? <div className="max-w-xs text-center"><p className="text-sm font-medium">Add a drawing, PDF, or image</p><p className="mt-1 text-sm text-muted-foreground">Attach it from the chat composer. It will stay available here while you work.</p></div> : null}{selected && !previewUrl ? <p className="text-sm text-muted-foreground">Loading secure preview…</p> : null}{selected?.mime_type === "application/pdf" && previewUrl ? <iframe title={`PDF preview: ${selected.original_name}, page ${page}`} src={`${previewUrl}#page=${page}`} className="h-full min-h-[28rem] w-full bg-white" /> : null}{selected && selected.mime_type.startsWith("image/") && previewUrl ? <img src={previewUrl} alt={selected.original_name} className="h-full max-h-full w-full object-contain" /> : null}</div>{selected?.analysis_json?.questions?.length ? <section aria-label="Needs input" className="border-t border-border p-4"><p className="text-sm font-semibold">Needs input</p><p className="mt-1 text-xs text-muted-foreground">Ada needs these answers before she can rely on this evidence.</p>{selected.analysis_json.questions.map((question) => <div key={question} className="mt-2 flex items-start justify-between gap-2 text-sm"><span>{question}</span><button type="button" onClick={() => onAskInChat(question)} className="shrink-0 rounded border border-border px-2 py-1 text-xs">Ask in chat</button></div>)}</section> : null}
    </div>
    {selected ? <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3"><div className="flex items-center gap-1"><button type="button" aria-label="Previous PDF page" disabled={selected.mime_type !== "application/pdf" || page <= 1} onClick={() => setPage(page - 1)} className="h-7 rounded border px-2 text-xs disabled:opacity-40">←</button><p className="min-w-0 truncate text-xs text-muted-foreground">{selected.mime_type === "application/pdf" ? `Page ${page}` : selected.analysis_status === "uploaded" ? "Ready to analyze" : selected.analysis_status}</p><button type="button" aria-label="Next PDF page" disabled={selected.mime_type !== "application/pdf"} onClick={() => setPage(page + 1)} className="h-7 rounded border px-2 text-xs disabled:opacity-40">→</button></div><div className="flex items-center gap-2"><button type="button" aria-label="Delete file" disabled={deletingId === selected.id} onClick={() => void deleteAsset()} className="h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50">{deletingId === selected.id ? "Deleting…" : "Delete"}</button><button disabled={selected.analysis_status === "analyzing" || analyzingId === selected.id || selected.analysis_status === "uploading"} type="button" onClick={() => void analyzeAsset()} className="h-8 rounded-md border border-border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-50">{analyzingId === selected.id || selected.analysis_status === "analyzing" ? "Analyzing…" : "Analyze"}</button></div></footer> : null}
  </aside>;
}
