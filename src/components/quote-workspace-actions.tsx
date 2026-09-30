"use client";

import { Archive, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QuoteWorkspaceActions } from "@/lib/quote-permissions";

export function QuoteActions({ archived, actions, busy, onRename, onLifecycle }: {
  archived: boolean;
  actions?: QuoteWorkspaceActions;
  busy: boolean;
  onRename: () => void;
  onLifecycle: () => void;
}) {
  // Missing permission data fails closed, including older cached list responses.
  const lifecycleAllowed = archived ? actions?.restore : actions?.archive;
  return (
    <>
      {!archived && actions?.rename ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onRename}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Rename
        </Button>
      ) : null}
      {lifecycleAllowed ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onLifecycle}>
          {archived ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
          {busy ? "Working…" : archived ? "Restore" : "Archive"}
        </Button>
      ) : null}
    </>
  );
}
