"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { isMissionControlAllowedEmail } from '@/lib/mission-control-access';
import { PageShell } from '@/components/ui/page-shell';

type MissionControlItem = {
  id: string;
  title: string;
  description: string;
  workstream: string;
  workstreamLabel: string;
  type: string;
  status: string;
  statusLabel: string;
  priority: string;
  owner: string;
  needsJoe: boolean;
  autonomousOk: boolean;
  blockedBy: string[];
  nextAction: string;
  acceptanceCriteria: string;
  links: string[];
  tags: string[];
  notes: string;
  boardScope: string;
  sourceProject: string;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
};

type MissionControlSummary = {
  activeCount: number;
  blockedCount: number;
  needsJoeCount: number;
  reviewCount: number;
  doneThisWeekCount: number;
  updatedTodayCount: number;
};

type MissionControlPayload = {
  items: MissionControlItem[];
  summary: MissionControlSummary;
  workstreams: Array<{ key: string; label: string }>;
  generatedAt: string;
};

type ActivityEvent = {
  id: string;
  type: string;
  scope: 'active' | 'history';
  workItemId?: string;
  actor: string;
  at: string;
  source?: string;
  payload: Record<string, unknown>;
};

type SavedView = 'active' | 'needsJoe' | 'blocked' | 'review' | 'done' | 'all';

type WorkItemDraft = {
  title: string;
  description: string;
  workstream: string;
  type: string;
  status: string;
  priority: string;
  owner: string;
  needsJoe: boolean;
  autonomousOk: boolean;
  nextAction: string;
  acceptanceCriteria: string;
  blockers: string;
  links: string;
  notes: string;
};

const SAVED_VIEWS: Array<{ key: SavedView; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'needsJoe', label: 'Needs Joe' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done this week' },
  { key: 'all', label: 'All' },
];

const ACTIVE_STATUSES = new Set(['inbox', 'todo', 'in-progress', 'blocked', 'review']);
const STATUS_OPTIONS = ['inbox', 'todo', 'in-progress', 'blocked', 'review', 'done', 'parked'];
const OWNER_OPTIONS = ['joe', 'ferris', 'rex', 'archie', 'unassigned'];
const TYPE_OPTIONS = ['feature', 'bug', 'research', 'spec', 'ops', 'maintenance', 'data'];

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function humanize(value: string) {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function priorityTone(priority: string) {
  if (priority === 'high') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === 'medium') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function statusTone(status: string) {
  if (status === 'blocked') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'review') return 'border-violet-200 bg-violet-50 text-violet-700';
  if (status === 'in-progress') return 'border-sky-200 bg-sky-50 text-sky-700';
  if (status === 'done') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function draftFromItem(item?: MissionControlItem | null): WorkItemDraft {
  return {
    title: item?.title ?? '',
    description: item?.description ?? '',
    workstream: item?.workstream ?? 'mission-control',
    type: item?.type ?? 'feature',
    status: item?.status ?? 'todo',
    priority: item?.priority ?? 'medium',
    owner: item?.owner ?? 'unassigned',
    needsJoe: item?.needsJoe ?? false,
    autonomousOk: item?.autonomousOk ?? true,
    nextAction: item?.nextAction ?? '',
    acceptanceCriteria: item?.acceptanceCriteria ?? '',
    blockers: item?.blockedBy.join('\n') ?? '',
    links: item?.links.join('\n') ?? '',
    notes: item?.notes ?? '',
  };
}

function matchesSavedView(item: MissionControlItem, savedView: SavedView) {
  if (savedView === 'active') return ACTIVE_STATUSES.has(item.status);
  if (savedView === 'needsJoe') return ACTIVE_STATUSES.has(item.status) && item.needsJoe;
  if (savedView === 'blocked') return item.status === 'blocked' || item.blockedBy.length > 0;
  if (savedView === 'review') return item.status === 'review';
  if (savedView === 'done') return item.status === 'done';
  return true;
}

function eventSummary(event: ActivityEvent) {
  if (event.scope === 'history') {
    const payload = event.payload as { title?: string; sourceLabel?: string };
    return payload.title ?? 'Imported historical activity';
  }
  if (event.type === 'status_changed') return `Status: ${String(event.payload.from)} → ${String(event.payload.to)}`;
  if (event.type === 'owner_changed') return `Owner: ${String(event.payload.from)} → ${String(event.payload.to)}`;
  if (event.type === 'next_action_changed') return `Next action: ${String(event.payload.to)}`;
  if (event.type === 'blocker_added') return `Blocker added: ${String(event.payload.blocker)}`;
  if (event.type === 'blocker_removed') return `Blocker cleared: ${String(event.payload.blocker)}`;
  if (event.type === 'note_added') return 'Note updated';
  return humanize(event.type);
}

export default function AdminMissionControlPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [payload, setPayload] = useState<MissionControlPayload | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedView, setSavedView] = useState<SavedView>('active');
  const [search, setSearch] = useState('');
  const [workstream, setWorkstream] = useState('all');
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState<WorkItemDraft>(draftFromItem());
  const [editDraft, setEditDraft] = useState<WorkItemDraft>(draftFromItem());

  async function loadBoard() {
    const response = await fetch('/admin/mission-control/bridge/api/work-items', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Mission Control load failed (${response.status})`);
    const nextPayload = (await response.json()) as MissionControlPayload;
    setPayload(nextPayload);
    setSelectedId((current) => current ?? nextPayload.items[0]?.id ?? null);
  }

  async function loadActivity() {
    const response = await fetch('/admin/mission-control/bridge/api/activity?scope=all&days=90', {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`Mission Control activity load failed (${response.status})`);
    const nextPayload = (await response.json()) as { events: ActivityEvent[] };
    setActivity(nextPayload.events ?? []);
  }

  useEffect(() => {
    async function loadSession() {
      const { data: { session } } = await supabase.auth.getSession();
      const actorEmail = session?.user?.email?.toLowerCase() ?? null;
      setEmail(actorEmail);
      setAllowed(isMissionControlAllowedEmail(actorEmail));
      setLoading(false);
    }
    void loadSession();
  }, []);

  useEffect(() => {
    if (loading || !allowed) return;
    Promise.all([loadBoard(), loadActivity()]).catch((error) => {
      setLoadError(error instanceof Error ? error.message : 'Mission Control failed to load.');
    });
  }, [allowed, loading]);

  const ownerOptions = useMemo(() => ['all', ...new Set([...OWNER_OPTIONS, ...(payload?.items ?? []).map((item) => item.owner).filter(Boolean)])], [payload]);
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (payload?.items ?? [])
      .filter((item) => item.boardScope === 'dev')
      .filter((item) => matchesSavedView(item, savedView))
      .filter((item) => workstream === 'all' || item.workstream === workstream)
      .filter((item) => status === 'all' || item.status === status)
      .filter((item) => owner === 'all' || item.owner === owner)
      .filter((item) => !needle || [item.title, item.description, item.nextAction, item.notes, item.workstreamLabel, item.owner, ...item.blockedBy].join(' ').toLowerCase().includes(needle))
      .sort((left, right) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const statusOrder = { inbox: 0, todo: 1, 'in-progress': 2, blocked: 3, review: 4, done: 5, parked: 6 };
        return (priorityOrder[left.priority as keyof typeof priorityOrder] ?? 9) - (priorityOrder[right.priority as keyof typeof priorityOrder] ?? 9)
          || (statusOrder[left.status as keyof typeof statusOrder] ?? 9) - (statusOrder[right.status as keyof typeof statusOrder] ?? 9)
          || new Date(right.updatedAt ?? 0).getTime() - new Date(left.updatedAt ?? 0).getTime();
      });
  }, [owner, payload, savedView, search, status, workstream]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredItems.some((item) => item.id === selectedId)) setSelectedId(filteredItems[0].id);
  }, [filteredItems, selectedId]);

  const selectedItem = (payload?.items ?? []).find((item) => item.id === selectedId) ?? null;
  useEffect(() => setEditDraft(draftFromItem(selectedItem)), [selectedItem?.id]);

  async function createWorkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createDraft.title.trim()) return;
    setCreating(true);
    setActionError(null);
    try {
      const response = await fetch('/admin/mission-control/bridge/api/work-items', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'joe', input: { ...createDraft, blockedBy: createDraft.blockers.split('\n').filter(Boolean), links: createDraft.links.split('\n').filter(Boolean) } }),
      });
      if (!response.ok) throw new Error('Could not create work item.');
      const result = await response.json() as { item: MissionControlItem };
      setSelectedId(result.item.id);
      setCreateDraft(draftFromItem());
      setCreateOpen(false);
      await Promise.all([loadBoard(), loadActivity()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not create work item.');
    } finally {
      setCreating(false);
    }
  }

  async function updateWorkItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedItem) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(`/admin/mission-control/bridge/api/work-items/${encodeURIComponent(selectedItem.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actor: 'joe', updates: { ...editDraft, blockedBy: editDraft.blockers.split('\n').filter(Boolean), links: editDraft.links.split('\n').filter(Boolean) } }),
      });
      if (!response.ok) throw new Error('Could not save work item.');
      await Promise.all([loadBoard(), loadActivity()]);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Could not save work item.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading Mission Control…</div>;
  if (!allowed) {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm"><h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1><p className="mt-3 text-sm text-muted-foreground">This surface is currently visible to Joe only.</p>{email ? <p className="mt-2 text-xs text-muted-foreground">Signed in as {email}</p> : null}</div></div>;
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1"><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mission Control</h1><p className="text-sm text-muted-foreground">Live dev work, decisions, blockers, and recent movement across Mecca systems.</p></div>
        <button type="button" onClick={() => setCreateOpen((open) => !open)} className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background">{createOpen ? 'Close new item' : 'New work item'}</button>
      </div>

      {loadError || actionError ? <div className="tracker-banner-danger">{actionError || loadError}</div> : null}

      {createOpen ? (
        <form onSubmit={createWorkItem} className="tracker-shell grid gap-3 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">New work item</h2><p className="text-sm text-muted-foreground">Add only current dev work—the historical backfill stays in lookback.</p></div><button disabled={creating} className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">{creating ? 'Creating…' : 'Create item'}</button></div>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Title</span><input required value={createDraft.title} onChange={(event) => setCreateDraft({ ...createDraft, title: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="space-y-1 text-sm"><span>Next action</span><input value={createDraft.nextAction} onChange={(event) => setCreateDraft({ ...createDraft, nextAction: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="space-y-1 text-sm"><span>Workstream</span><select value={createDraft.workstream} onChange={(event) => setCreateDraft({ ...createDraft, workstream: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2">{['mission-control', 'mdp-tracker', 'ada', 'mecca-qbo', 'native-layer', 'infra', 'general'].map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label><label className="space-y-1 text-sm"><span>Owner</span><select value={createDraft.owner} onChange={(event) => setCreateDraft({ ...createDraft, owner: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2">{OWNER_OPTIONS.map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createDraft.needsJoe} onChange={(event) => setCreateDraft({ ...createDraft, needsJoe: event.target.checked })} /> Needs Joe</label>
        </form>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">{[['Active', payload?.summary.activeCount ?? 0], ['Blocked', payload?.summary.blockedCount ?? 0], ['Needs Joe', payload?.summary.needsJoeCount ?? 0], ['In review', payload?.summary.reviewCount ?? 0], ['Done this week', payload?.summary.doneThisWeekCount ?? 0], ['Updated today', payload?.summary.updatedTodayCount ?? 0]].map(([label, value]) => <div key={String(label)} className="tracker-kpi"><div className="text-sm text-muted-foreground">{label}</div><div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div></div>)}</section>

      <section className="tracker-shell p-4 sm:p-5"><div className="flex flex-wrap gap-2">{SAVED_VIEWS.map((view) => <button key={view.key} type="button" onClick={() => setSavedView(view.key)} className={`tracker-filter-pill px-3 py-1.5 text-sm ${savedView === view.key ? 'tracker-filter-pill-active' : ''}`}>{view.label}</button>)}</div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm text-muted-foreground"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title, blocker, next action, workstream" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground" /></label><label className="space-y-1 text-sm text-muted-foreground"><span>Workstream</span><select value={workstream} onChange={(event) => setWorkstream(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"><option value="all">All workstreams</option>{(payload?.workstreams ?? []).map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label><label className="space-y-1 text-sm text-muted-foreground"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"><option value="all">All statuses</option>{STATUS_OPTIONS.map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label><label className="space-y-1 text-sm text-muted-foreground"><span>Owner</span><select value={owner} onChange={(event) => setOwner(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">{ownerOptions.map((entry) => <option key={entry} value={entry}>{entry === 'all' ? 'All owners' : humanize(entry)}</option>)}</select></label></div></section>

      <section className="grid min-w-0 max-w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]"><div className={`tracker-shell min-w-0 overflow-hidden ${mobileDetailOpen ? 'hidden lg:block' : 'block'}`}><div className="border-b border-border px-4 py-4 sm:px-5"><div className="text-xl font-semibold tracking-tight">Active work</div><div className="mt-1 text-sm text-muted-foreground">{filteredItems.length} items in this view</div></div><div className="divide-y divide-border">{filteredItems.length === 0 ? <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">No current work items match this view. Create one to start the live queue.</div> : filteredItems.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedId(item.id); setMobileDetailOpen(true); }} className={`block w-full px-4 py-4 text-left transition sm:px-5 ${item.id === selectedId ? 'bg-black/[0.03]' : 'hover:bg-black/[0.02]'}`}><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${priorityTone(item.priority)}`}>{item.priority}</span><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(item.status)}`}>{item.statusLabel}</span><span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.workstreamLabel}</span><span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.owner}</span>{item.needsJoe ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Needs Joe</span> : null}</div><div className="mt-3 break-words text-base font-semibold tracking-tight text-foreground">{item.title}</div>{item.nextAction ? <div className="mt-2 text-sm text-foreground/80"><span className="font-medium">Next:</span> {item.nextAction}</div> : null}<div className="mt-2 text-xs text-muted-foreground">Updated {formatDate(item.updatedAt)}</div></button>)}</div></div>
        <aside className={`tracker-shell min-w-0 p-4 sm:p-5 ${mobileDetailOpen ? 'block' : 'hidden lg:block'}`}>{!selectedItem ? <div className="py-12 text-center text-sm text-muted-foreground">Select a work item to triage it.</div> : <form onSubmit={updateWorkItem} className="space-y-4"><button type="button" onClick={() => setMobileDetailOpen(false)} className="text-sm font-medium text-blue-700 underline underline-offset-2 lg:hidden">← Back to list</button><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="tracker-section-label">{selectedItem.workstreamLabel} · {selectedItem.type}</div><h2 className="mt-2 break-words text-2xl font-semibold tracking-tight">{selectedItem.title}</h2></div><button disabled={saving} className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background">{saving ? 'Saving…' : 'Save changes'}</button></div><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>Status</span><select value={editDraft.status} onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2">{STATUS_OPTIONS.map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label><label className="space-y-1 text-sm"><span>Owner</span><select value={editDraft.owner} onChange={(event) => setEditDraft({ ...editDraft, owner: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2">{OWNER_OPTIONS.map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label><label className="space-y-1 text-sm"><span>Priority</span><select value={editDraft.priority} onChange={(event) => setEditDraft({ ...editDraft, priority: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2">{['high', 'medium', 'low'].map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label><label className="space-y-1 text-sm"><span>Type</span><select value={editDraft.type} onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2">{TYPE_OPTIONS.map((entry) => <option key={entry} value={entry}>{humanize(entry)}</option>)}</select></label></div><label className="space-y-1 text-sm"><span>Next action</span><input value={editDraft.nextAction} onChange={(event) => setEditDraft({ ...editDraft, nextAction: event.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="space-y-1 text-sm"><span>Blockers — one per line</span><textarea value={editDraft.blockers} onChange={(event) => setEditDraft({ ...editDraft, blockers: event.target.value })} rows={3} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editDraft.needsJoe} onChange={(event) => setEditDraft({ ...editDraft, needsJoe: event.target.checked })} /> Needs Joe</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editDraft.autonomousOk} onChange={(event) => setEditDraft({ ...editDraft, autonomousOk: event.target.checked })} /> Autonomous OK</label><label className="space-y-1 text-sm"><span>Notes</span><textarea value={editDraft.notes} onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })} rows={5} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label><div className="text-xs text-muted-foreground">Created {formatDate(selectedItem.createdAt)} · Updated {formatDate(selectedItem.updatedAt)}</div></form>}</aside></section>

      <section className="tracker-shell p-4 sm:p-5"><div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between"><div><h2 className="text-xl font-semibold tracking-tight">Activity and history</h2><p className="mt-1 text-sm text-muted-foreground">Live work updates and the separate Mecca backfill in one lookback feed.</p></div><span className="text-sm text-muted-foreground">Last 90 days</span></div><div className="mt-4 divide-y divide-border">{activity.length === 0 ? <div className="py-8 text-sm text-muted-foreground">No activity yet. Creating or updating work items will populate this timeline; historical backfill remains separate from the active queue.</div> : activity.map((event) => <article key={event.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${event.scope === 'history' ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-sky-200 bg-sky-50 text-sky-700'}`}>{event.scope === 'history' ? 'History' : 'Live update'}</span><span className="text-sm font-medium">{eventSummary(event)}</span></div><div className="mt-1 text-xs text-muted-foreground">{event.scope === 'history' ? String((event.payload as { sourceLabel?: string }).sourceLabel ?? event.source ?? 'Mecca backfill') : `by ${event.actor}`}</div></div><time className="shrink-0 text-xs text-muted-foreground">{formatDate(event.at)}</time></article>)}</div></section>
    </PageShell>
  );
}
