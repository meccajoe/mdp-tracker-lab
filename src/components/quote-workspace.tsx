"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { AdaWorkspaceDetail } from "@/components/ada-workspace-detail";
import { QuoteReviewWorkspace } from "@/components/quote-review-workspace";
import { adaFetch } from "@/lib/ada-client";

type WorkspaceOption = { id: string; title: string; status: string };

export function QuoteWorkspace({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [view, setView] = useState<"workspace" | "review">("workspace");

  useEffect(() => {
    let active = true;
    void Promise.all([
      adaFetch("/api/quote-workspaces"),
      adaFetch("/api/quote-workspaces?status=archived"),
    ]).then(async (responses) => {
      const payloads = await Promise.all(responses.map((response) => response.json().catch(() => ({}))));
      if (!active) return;
      const unique = new Map<string, WorkspaceOption>();
      for (const payload of payloads) {
        for (const workspace of payload.workspaces ?? []) unique.set(workspace.id, workspace);
      }
      setWorkspaces([...unique.values()]);
    }).catch(() => {
      if (active) setWorkspaces([]);
    });
    return () => { active = false; };
  }, [workspaceId]);

  return (
    <div data-slot="quote-workspace" className="flex h-[calc(100dvh-6.5rem)] min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background xl:h-[calc(100dvh-3rem)]">
      <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-1 sm:px-4">
        <Link href="/quotes" className="inline-flex min-h-9 items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to quotes
        </Link>
        <div className="flex items-center rounded-md border border-border p-0.5" aria-label="Quote workspace mode">
          <button type="button" onClick={() => setView("workspace")} className={`rounded px-2.5 py-1 text-xs font-medium ${view === "workspace" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>Workspace</button>
          <button type="button" onClick={() => setView("review")} className={`rounded px-2.5 py-1 text-xs font-medium ${view === "review" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>Review</button>
        </div>
        <select
          aria-label="Switch quote workspace"
          value={workspaceId}
          onChange={(event) => router.push(`/quotes/${event.target.value}`)}
          className="h-8 min-w-0 max-w-[38%] rounded-md border border-border bg-background px-2 text-sm font-medium outline-none focus:ring-2 focus:ring-ring/40 sm:max-w-xs"
        >
          {!workspaces.some((workspace) => workspace.id === workspaceId) ? <option value={workspaceId}>Current quote</option> : null}
          {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.title}{workspace.status === "archived" ? " — Archived" : ""}</option>)}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        {view === "workspace" ? <AdaWorkspaceDetail workspaceId={workspaceId} /> : <QuoteReviewWorkspace workspaceId={workspaceId} />}
      </div>
    </div>
  );
}
