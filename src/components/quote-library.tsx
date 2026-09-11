"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowRight, Pencil, Plus, RotateCcw, Search, X } from "lucide-react";

import { adaFetch } from "@/lib/ada-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageShell } from "@/components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type QuoteStatus = "draft" | "gathering_inputs" | "estimating" | "in_review" | "accepted" | "handed_off" | "archived";
type QuoteWorkspace = {
  id: string;
  title: string;
  client_name: string | null;
  contact_name: string | null;
  tracker_project_id: string | null;
  status: QuoteStatus;
  last_activity_at: string;
  pinned_at: string | null;
};

const FILTERS: Array<{ value: "all" | QuoteStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "gathering_inputs", label: "Needs input" },
  { value: "estimating", label: "Estimating" },
  { value: "in_review", label: "In review" },
  { value: "accepted", label: "Accepted" },
  { value: "handed_off", label: "Handed off" },
  { value: "archived", label: "Archived" },
];

function statusLabel(status: QuoteStatus) {
  return FILTERS.find((filter) => filter.value === status)?.label ?? status;
}

function formatActivity(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function QuoteLibrary() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<QuoteWorkspace[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | QuoteStatus>("all");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<QuoteWorkspace | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (query.trim()) params.set("search", query.trim());
    if (status !== "all") params.set("status", status);
    const response = await adaFetch(`/api/quote-workspaces?${params.toString()}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setWorkspaces([]);
      setError(result.error ?? "Quotes could not load.");
    } else {
      setWorkspaces(result.workspaces ?? []);
    }
    setLoading(false);
  }, [query, status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;

    setCreating(true);
    setError(null);
    const response = await adaFetch("/api/quote-workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        clientName: String(form.get("clientName") ?? "").trim() || null,
        contactName: String(form.get("contactName") ?? "").trim() || null,
      }),
    });
    const result = await response.json().catch(() => ({}));
    setCreating(false);
    if (!response.ok || !result.workspace?.id) {
      setError(result.error ?? "Quote could not be created.");
      return;
    }
    setCreateOpen(false);
    router.push(`/quotes/${result.workspace.id}`);
  }

  async function renameQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingWorkspace) return;
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    if (!title) return;

    setRenaming(true);
    setError(null);
    const response = await adaFetch(`/api/quote-workspaces/${editingWorkspace.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, renameOnly: true }),
    });
    const result = await response.json().catch(() => ({}));
    setRenaming(false);
    if (!response.ok) {
      setError(result.error ?? "Quote could not be renamed.");
      return;
    }
    setEditingWorkspace(null);
    await load();
  }

  async function changeLifecycle(workspace: QuoteWorkspace) {
    const restoring = workspace.status === "archived";
    if (!restoring && !window.confirm(`Archive “${workspace.title}”? Its governed history will remain available.`)) return;

    setMutatingId(workspace.id);
    setError(null);
    const response = await adaFetch(
      restoring ? `/api/quote-workspaces/${workspace.id}/restore` : `/api/quote-workspaces/${workspace.id}`,
      { method: restoring ? "POST" : "DELETE" },
    );
    const result = await response.json().catch(() => ({}));
    setMutatingId(null);
    if (!response.ok) {
      setError(result.error ?? `Quote could not be ${restoring ? "restored" : "archived"}.`);
      return;
    }
    await load();
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Estimating</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Quotes</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Create and resume quote workspaces before a Tracker project exists.</p>
        </div>
        <Button size="lg" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          New quote
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative block w-full max-w-md">
          <span className="sr-only">Search quotes</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search quotes" className="pl-9" />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as "all" | QuoteStatus)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40">
            {FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
          </select>
        </label>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div data-slot="quote-library-mobile" className="divide-y md:hidden">
          {loading ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">Loading quotes…</p> : workspaces.length === 0 ? <EmptyQuotes onCreate={() => setCreateOpen(true)} /> : workspaces.map((workspace) => (
            <div key={workspace.id} className="p-4 transition-colors hover:bg-accent/40">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/quotes/${workspace.id}`} className="block truncate text-sm font-semibold hover:underline">{workspace.title}</Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{workspace.client_name || "Client not set"}</p>
                </div>
                <Badge variant="outline">{statusLabel(workspace.status)}</Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{workspace.tracker_project_id ? `Project ${workspace.tracker_project_id}` : "No project required"}</span>
                <Link href={`/quotes/${workspace.id}`} className="inline-flex items-center gap-1 hover:text-foreground">{formatActivity(workspace.last_activity_at)} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
              </div>
              <div data-slot="quote-library-mobile-actions" className="mt-3 flex justify-end gap-2 border-t border-border/60 pt-3">
                <QuoteActions workspace={workspace} busy={mutatingId === workspace.id} onRename={setEditingWorkspace} onLifecycle={changeLifecycle} />
              </div>
            </div>
          ))}
        </div>

        <div data-slot="quote-library-table" className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[30%] pl-4">Quote</TableHead>
                <TableHead className="w-[18%]">Client</TableHead>
                <TableHead className="w-[13%]">Status</TableHead>
                <TableHead className="w-[15%]">Project</TableHead>
                <TableHead className="w-[10%] text-right">Updated</TableHead>
                <TableHead className="w-[14%] pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground">Loading quotes…</TableCell></TableRow>
              ) : workspaces.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyQuotes onCreate={() => setCreateOpen(true)} /></TableCell></TableRow>
              ) : workspaces.map((workspace) => (
                <TableRow key={workspace.id}>
                  <TableCell className="pl-4">
                    <Link href={`/quotes/${workspace.id}`} className="font-semibold hover:underline">{workspace.title}</Link>
                    {workspace.contact_name ? <p className="mt-0.5 truncate text-xs text-muted-foreground">Contact: {workspace.contact_name}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{workspace.client_name || "—"}</TableCell>
                  <TableCell><Badge variant="outline">{statusLabel(workspace.status)}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{workspace.tracker_project_id ? `Project ${workspace.tracker_project_id}` : "No project required"}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    <Link href={`/quotes/${workspace.id}`} className="inline-flex items-center gap-1 hover:text-foreground">{formatActivity(workspace.last_activity_at)} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                  </TableCell>
                  <TableCell data-slot="quote-library-table-actions" className="pr-4 text-right">
                    <div className="inline-flex gap-1">
                      <QuoteActions workspace={workspace} busy={mutatingId === workspace.id} onRename={setEditingWorkspace} onLifecycle={changeLifecycle} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {createOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Create quote">
          <button type="button" aria-label="Close create quote" onClick={() => setCreateOpen(false)} className="absolute inset-0" />
          <form onSubmit={createQuote} className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">New quote</h2>
                <p className="mt-1 text-sm text-muted-foreground">No project required. Link operational records later through governed handoff.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setCreateOpen(false)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-5 block text-sm font-medium">Quote name<Input name="title" required autoFocus className="mt-1.5" /></label>
            <label className="mt-4 block text-sm font-medium">Client <span className="font-normal text-muted-foreground">(optional)</span><Input name="clientName" className="mt-1.5" /></label>
            <label className="mt-4 block text-sm font-medium">Contact <span className="font-normal text-muted-foreground">(optional)</span><Input name="contactName" className="mt-1.5" /></label>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? "Creating…" : "Create quote"}</Button>
            </div>
          </form>
        </div>
      ) : null}

      {editingWorkspace ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4" role="dialog" aria-modal="true" aria-label="Rename quote">
          <button type="button" aria-label="Close rename quote" onClick={() => setEditingWorkspace(null)} className="absolute inset-0" />
          <form onSubmit={renameQuote} className="relative z-10 w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Rename quote</h2>
                <p className="mt-1 text-sm text-muted-foreground">Change the workspace label without altering revisions or evidence.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setEditingWorkspace(null)} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
            <label className="mt-5 block text-sm font-medium">Quote name<Input name="title" required autoFocus defaultValue={editingWorkspace.title} className="mt-1.5" /></label>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditingWorkspace(null)}>Cancel</Button>
              <Button type="submit" disabled={renaming}>{renaming ? "Saving…" : "Save name"}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </PageShell>
  );
}

function EmptyQuotes({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-semibold">No quotes found</p>
      <p className="mt-1 text-sm text-muted-foreground">Start a quote now; connect it to a project only when the work is ready.</p>
      <Button variant="outline" className="mt-4" onClick={onCreate}>New quote</Button>
    </div>
  );
}

function QuoteActions({ workspace, busy, onRename, onLifecycle }: {
  workspace: QuoteWorkspace;
  busy: boolean;
  onRename: (workspace: QuoteWorkspace) => void;
  onLifecycle: (workspace: QuoteWorkspace) => void;
}) {
  const archived = workspace.status === "archived";
  return (
    <>
      {!archived ? (
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => onRename(workspace)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Rename
        </Button>
      ) : null}
      <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void onLifecycle(workspace)}>
        {archived ? <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
        {busy ? "Working…" : archived ? "Restore" : "Archive"}
      </Button>
    </>
  );
}
