"use client";

import { useEffect, useMemo, useState } from 'react';

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

type SavedView = 'active' | 'needsJoe' | 'blocked' | 'review' | 'done' | 'all';

const SAVED_VIEWS: Array<{ key: SavedView; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'needsJoe', label: 'Needs Joe' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Done this week' },
  { key: 'all', label: 'All' },
];

const ACTIVE_STATUSES = new Set(['inbox', 'todo', 'in-progress', 'blocked', 'review']);

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function priorityTone(priority: string) {
  switch (priority) {
    case 'high':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'medium':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'blocked':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'review':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'in-progress':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'done':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    default:
      return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function matchesSavedView(item: MissionControlItem, savedView: SavedView) {
  switch (savedView) {
    case 'active':
      return ACTIVE_STATUSES.has(item.status);
    case 'needsJoe':
      return ACTIVE_STATUSES.has(item.status) && item.needsJoe;
    case 'blocked':
      return item.status === 'blocked' || item.blockedBy.length > 0;
    case 'review':
      return item.status === 'review';
    case 'done':
      return item.status === 'done';
    case 'all':
    default:
      return true;
  }
}

export default function AdminMissionControlPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [payload, setPayload] = useState<MissionControlPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedView, setSavedView] = useState<SavedView>('active');
  const [search, setSearch] = useState('');
  const [workstream, setWorkstream] = useState('all');
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

    async function loadBoard() {
      try {
        setLoadError(null);
        const response = await fetch('/admin/mission-control/bridge/api/work-items', {
          credentials: 'same-origin',
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`Mission Control load failed (${response.status})`);
        }

        const nextPayload = (await response.json()) as MissionControlPayload;
        setPayload(nextPayload);
        setSelectedId(current => current ?? nextPayload.items[0]?.id ?? null);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Mission Control failed to load.');
      }
    }

    void loadBoard();
  }, [allowed, loading]);

  const ownerOptions = useMemo(() => {
    const items = payload?.items ?? [];
    return ['all', ...new Set(items.map(item => item.owner).filter(Boolean))];
  }, [payload]);

  const filteredItems = useMemo(() => {
    const items = payload?.items ?? [];
    const needle = search.trim().toLowerCase();

    const nextItems = items.filter(item => {
      if (!matchesSavedView(item, savedView)) return false;
      if (workstream !== 'all' && item.workstream !== workstream) return false;
      if (status !== 'all' && item.status !== status) return false;
      if (owner !== 'all' && item.owner !== owner) return false;
      if (!needle) return true;

      const haystack = [
        item.title,
        item.description,
        item.nextAction,
        item.notes,
        item.workstreamLabel,
        item.owner,
        item.blockedBy.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(needle);
    });

    const statusOrder = ['inbox', 'todo', 'in-progress', 'blocked', 'review', 'done', 'parked'];
    const priorityOrder = ['high', 'medium', 'low'];

    return nextItems.sort((a, b) => {
      const aPriority = priorityOrder.indexOf(a.priority);
      const bPriority = priorityOrder.indexOf(b.priority);
      if (aPriority !== bPriority) return aPriority - bPriority;

      const aStatus = statusOrder.indexOf(a.status);
      const bStatus = statusOrder.indexOf(b.status);
      if (aStatus !== bStatus) return aStatus - bStatus;

      return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
    });
  }, [owner, payload, savedView, search, status, workstream]);

  useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredItems.some(item => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  const selectedItem = filteredItems.find(item => item.id === selectedId) ?? null;

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading Mission Control…</div>;
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
          <p className="mt-3 text-sm text-muted-foreground">This surface is currently visible to Joe only.</p>
          {email ? <p className="mt-2 text-xs text-muted-foreground">Signed in as {email}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <PageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Mission Control</h1>
        <p className="text-sm text-muted-foreground">Fresh tracker-native view for dev work. No standalone app chrome, no second-brain shell.</p>
      </div>

      {loadError ? (
        <div className="tracker-banner-danger">{loadError}</div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2">
        {[
          ['Active', payload?.summary.activeCount ?? 0],
          ['Blocked', payload?.summary.blockedCount ?? 0],
          ['Needs Joe', payload?.summary.needsJoeCount ?? 0],
          ['In review', payload?.summary.reviewCount ?? 0],
          ['Done this week', payload?.summary.doneThisWeekCount ?? 0],
          ['Updated today', payload?.summary.updatedTodayCount ?? 0],
        ].map(([label, value]) => (
          <div key={label} className="tracker-kpi">
            <div className="text-sm text-muted-foreground">{label}</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
          </div>
        ))}
      </section>

      <section className="tracker-shell p-4 sm:p-5">
        <div className="flex flex-wrap gap-2">
          {SAVED_VIEWS.map(view => {
            const active = savedView === view.key;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => setSavedView(view.key)}
                className={`tracker-filter-pill px-3 py-1.5 text-sm ${active ? 'tracker-filter-pill-active' : ''}`}
              >
                {view.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Search</span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Title, blocker, next action, workstream"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground"
            />
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Workstream</span>
            <select value={workstream} onChange={event => setWorkstream(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <option value="all">All workstreams</option>
              {(payload?.workstreams ?? []).map(entry => (
                <option key={entry.key} value={entry.key}>{entry.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Status</span>
            <select value={status} onChange={event => setStatus(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              <option value="all">All statuses</option>
              <option value="inbox">Inbox</option>
              <option value="todo">To do</option>
              <option value="in-progress">In progress</option>
              <option value="blocked">Blocked</option>
              <option value="review">Review</option>
              <option value="done">Done</option>
              <option value="parked">Parked</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Owner</span>
            <select value={owner} onChange={event => setOwner(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground">
              {ownerOptions.map(entry => (
                <option key={entry} value={entry}>{entry === 'all' ? 'All owners' : entry}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="grid min-w-0 max-w-full gap-4">
        <div className="tracker-shell min-w-0 overflow-hidden">
          <div className="border-b border-border px-4 py-4 sm:px-5">
            <div className="text-xl font-semibold tracking-tight">Active work</div>
            <div className="mt-1 text-sm text-muted-foreground">{filteredItems.length} items in this view</div>
          </div>

          <div className="divide-y divide-border">
            {filteredItems.length === 0 ? (
              <div className="px-4 py-10 text-sm text-muted-foreground sm:px-5">No work items match these filters.</div>
            ) : (
              filteredItems.map(item => {
                const selected = item.id === selectedId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`block w-full px-4 py-4 text-left transition sm:px-5 ${selected ? 'bg-black/[0.03]' : 'hover:bg-black/[0.02]'}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${priorityTone(item.priority)}`}>{item.priority}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(item.status)}`}>{item.statusLabel}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.workstreamLabel}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{item.owner}</span>
                      {item.needsJoe ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Needs Joe</span> : null}
                      {item.blockedBy.length > 0 ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{item.blockedBy.length} blocker{item.blockedBy.length === 1 ? '' : 's'}</span> : null}
                    </div>
                    <div className="mt-3 text-base font-semibold tracking-tight text-foreground">{item.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{item.type} · source {item.sourceProject}</div>
                    {item.nextAction ? <div className="mt-3 text-sm text-foreground/80"><span className="font-medium">Next:</span> {item.nextAction}</div> : null}
                    <div className="mt-2 text-xs text-muted-foreground">Updated {formatDate(item.updatedAt)}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <aside className="tracker-shell min-w-0 p-4 sm:p-5">
          {!selectedItem ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Select a work item to inspect its detail.</div>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="tracker-section-label">{selectedItem.workstreamLabel} · {selectedItem.type}</div>
                <h2 className="mt-2 break-words text-2xl font-semibold tracking-tight">{selectedItem.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${priorityTone(selectedItem.priority)}`}>{selectedItem.priority}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(selectedItem.status)}`}>{selectedItem.statusLabel}</span>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">Owner: {selectedItem.owner}</span>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="tracker-panel-muted p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Next action</div>
                  <div className="mt-2 text-sm text-foreground">{selectedItem.nextAction || '—'}</div>
                </div>
                <div className="tracker-panel-muted p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Blockers</div>
                  <div className="mt-2 text-sm text-foreground">{selectedItem.blockedBy.length ? selectedItem.blockedBy.join(' · ') : 'Clear'}</div>
                </div>
              </div>

              {selectedItem.description ? (
                <div className="tracker-panel-muted p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Description</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{selectedItem.description}</div>
                </div>
              ) : null}

              {selectedItem.notes ? (
                <div className="tracker-panel-muted p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Notes</div>
                  <div className="mt-2 whitespace-pre-wrap text-sm text-foreground">{selectedItem.notes}</div>
                </div>
              ) : null}

              {selectedItem.links.length > 0 ? (
                <div className="tracker-panel-muted p-3">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Links</div>
                  <div className="mt-2 space-y-2">
                    {selectedItem.links.map(link => (
                      <a key={link} href={link} target="_blank" rel="noreferrer" className="block break-all text-sm text-blue-700 underline underline-offset-2">
                        {link}
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="text-xs text-muted-foreground">
                Created {formatDate(selectedItem.createdAt)} · Updated {formatDate(selectedItem.updatedAt)}
              </div>
            </div>
          )}
        </aside>
      </section>
    </PageShell>
  );
}
