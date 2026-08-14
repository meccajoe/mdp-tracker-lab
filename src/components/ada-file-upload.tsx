"use client";

import { ChangeEvent, useRef, useState } from "react";

import { supabase } from "@/lib/supabase";

const ASSET_BUCKET = "ada-quote-assets";

type AdaFileUploadProps = {
  workspaceId: string;
  conceptId: string;
  onUploaded: () => Promise<void>;
  onUploadStart?: () => void;
  compact?: boolean;
};

export function AdaFileUpload({ workspaceId, conceptId, onUploaded, onUploadStart, compact = false }: AdaFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function uploadAsset(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    setError(null);
    onUploadStart?.();
    try {
      const createResponse = await fetch(`/api/ada/workspaces/${workspaceId}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId, originalName: file.name, mimeType: file.type, byteSize: file.size }),
      });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(created.error ?? "Could not prepare secure upload.");

      const { error: uploadError } = await supabase.storage.from(ASSET_BUCKET).uploadToSignedUrl(created.signedUpload.path, created.signedUpload.token, file, { contentType: file.type });
      if (uploadError) throw uploadError;

      const completeResponse = await fetch(`/api/ada/workspaces/${workspaceId}/assets/${created.asset.id}/complete`, { method: "POST" });
      const completed = await completeResponse.json().catch(() => ({}));
      if (!completeResponse.ok) throw new Error(completed.error ?? "Could not complete file upload.");
      await onUploaded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload file.");
    } finally {
      setUploading(false);
    }
  }

  return <div className="relative"><input ref={inputRef} disabled={uploading} onChange={uploadAsset} accept="application/pdf,image/jpeg,image/png,image/webp" type="file" className="sr-only" />
    <button type="button" aria-label="Attach file" disabled={uploading} onClick={() => inputRef.current?.click()} className={compact ? "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50" : "inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-50"}>{compact ? <span aria-hidden="true" className="text-xl leading-none">+</span> : uploading ? "Uploading…" : "Attach file"}</button>
    {error ? <p role="alert" className="absolute bottom-full left-0 mb-2 w-64 rounded-md border border-destructive/30 bg-background p-2 text-xs text-destructive shadow-lg">{error}</p> : null}
  </div>;
}
