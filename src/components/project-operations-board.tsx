"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserRoles } from "@/hooks/useUserRoles";
import { formatCurrency, getBudgetHealthClasses } from "@/lib/constants";
import { formatDateCentral } from "@/lib/date-utils";
import {
  applyProjectOperationsFilters,
  buildProjectOperationsBoardRows,
  EMPTY_PROJECT_OPERATIONS_FILTERS,
  filterProjectActivityEvents,
  getOperationalStatusLabel,
  getTaskStatusLabel,
  PROJECT_OPERATIONAL_STATUS_OPTIONS,
  PROJECT_TASK_STATUS_OPTIONS,
  type ProjectActivityEventRow,
  type ProjectOperationsStateRow,
  type ProjectOperationsTaskRow,
} from "@/lib/project-operations";
import { PROJECT_STATUSES, type ProjectSummary } from "@/lib/types";

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 transition-colors";
const selectClass = inputClass;
const checkboxClass = "h-4 w-4 rounded border-border text-primary focus:ring-ring/40";

type BoardPayload = {
  projects: ProjectSummary[];
  states: ProjectOperationsStateRow[];
  tasks: ProjectOperationsTaskRow[];
  events: ProjectActivityEventRow[];
};

type StateForm = {
  operationalStatus: string;
  nextAction: string;
  blockerSummary: string;
  pendingHumanInput: string;
  contextNotes: string;
  targetDate: string;
};

type NewTaskForm = {
  title: string;
  status: string;
  ownerLabel: string;
  dueDate: string;
  needsHumanInput: boolean;
  notes: string;
};

type NewEventForm = {
  eventDate: string;
  eventType: string;
  summary: string;
  details: string;
};

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoString(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function emptyStateForm(): StateForm {
  return {
    operationalStatus: "on_track",
    nextAction: "",
    blockerSummary: "",
    pendingHumanInput: "",
    contextNotes: "",
    targetDate: "",
  };
}

function emptyTaskForm(): NewTaskForm {
  return {
    title: "",
    status: "open",
    ownerLabel: "",
    dueDate: "",
    needsHumanInput: false,
    notes: "",
  };
}

function emptyEventForm(): NewEventForm {
  return {
    eventDate: todayString(),
    eventType: "update",
    summary: "",
    details: "",
  };
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    const errorMessage = typeof (payload as { error?: string }).error === "string"
      ? (payload as { error?: string }).error
      : "Request failed";
    throw new Error(errorMessage);
  }
  return payload;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "blocked":
      return "bg-red-100 text-red-700 border-red-200";
    case "needs_follow_up":
      return "bg-amber-100 text-amber-800 border-amber-200";
    case "waiting_on_client":
    case "waiting_on_internal":
    case "waiting_on_vendor":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
  }
}

function taskStatusBadgeClass(status: string) {
  switch (status) {
    case "blocked":
      return "bg-red-100 text-red-700 border-red-200";
    case "in_progress":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "done":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

export function ProjectOperationsBoard() {
  const { activePMs, resolveName } = useUserRoles();
  const [loading, setLoading] = useState(true);
  const [savingState, setSavingState] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [payload, setPayload] = useState<BoardPayload>({ projects: [], states: [], tasks: [], events: [] });
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [filters, setFilters] = useState(EMPTY_PROJECT_OPERATIONS_FILTERS);
  const [lookbackStart, setLookbackStart] = useState(daysAgoString(14));
  const [lookbackEnd, setLookbackEnd] = useState(todayString());
  const [stateForm, setStateForm] = useState<StateForm>(emptyStateForm());
  const [newTask, setNewTask] = useState<NewTaskForm>(emptyTaskForm());
  const [newEvent, setNewEvent] = useState<NewEventForm>(emptyEventForm());

  const loadBoard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/project-operations/board", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await parseJsonResponse<BoardPayload>(response);
      setPayload({
        projects: data.projects ?? [],
        states: data.states ?? [],
        tasks: data.tasks ?? [],
        events: data.events ?? [],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load operations board");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const boardRows = useMemo(
    () => buildProjectOperationsBoardRows(payload),
    [payload],
  );

  const filteredRows = useMemo(
    () => applyProjectOperationsFilters(boardRows, filters),
    [boardRows, filters],
  );

  const selectedRow = useMemo(
    () => filteredRows.find((row) => String(row.project.id) === selectedProjectId) ?? filteredRows[0] ?? null,
    [filteredRows, selectedProjectId],
  );

  useEffect(() => {
    if (selectedRow && String(selectedRow.project.id) !== selectedProjectId) {
      setSelectedProjectId(String(selectedRow.project.id));
    }
    if (!selectedRow) {
      setSelectedProjectId("");
    }
  }, [selectedProjectId, selectedRow]);

  useEffect(() => {
    if (!selectedRow) {
      setStateForm(emptyStateForm());
      setNewTask(emptyTaskForm());
      setNewEvent(emptyEventForm());
      return;
    }

    setStateForm({
      operationalStatus: selectedRow.operational_status,
      nextAction: selectedRow.next_action ?? "",
      blockerSummary: selectedRow.blocker_summary ?? "",
      pendingHumanInput: selectedRow.pending_human_input ?? "",
      contextNotes: selectedRow.state?.context_notes ?? "",
      targetDate: selectedRow.target_date ?? "",
    });
    setNewTask(emptyTaskForm());
    setNewEvent((current) => ({ ...emptyEventForm(), eventDate: current.eventDate || todayString() }));
  }, [selectedRow?.project.id]);

  const projectById = useMemo(
    () => new Map(payload.projects.map((project) => [String(project.id), project])),
    [payload.projects],
  );

  const lookbackEvents = useMemo(
    () => filterProjectActivityEvents(payload.events, lookbackStart, lookbackEnd),
    [lookbackEnd, lookbackStart, payload.events],
  );

  const summary = useMemo(() => ({
    totalProjects: filteredRows.length,
    blockedProjects: filteredRows.filter((row) => row.operational_status === "blocked").length,
    needsFollowUp: filteredRows.filter((row) => row.operational_status === "needs_follow_up").length,
    pendingHuman: filteredRows.reduce((sum, row) => sum + row.needs_human_count, 0),
  }), [filteredRows]);

  async function handleSaveState() {
    if (!selectedRow) return;
    setSavingState(true);
    try {
      const response = await fetch(`/api/project-operations/projects/${selectedRow.project.id}/state`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stateForm),
      });
      await parseJsonResponse<{ state: ProjectOperationsStateRow }>(response);
      toast.success("Project operations state saved");
      await loadBoard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save operations state");
    } finally {
      setSavingState(false);
    }
  }

  async function handleCreateTask() {
    if (!selectedRow || !newTask.title.trim()) return;
    setCreatingTask(true);
    try {
      const response = await fetch("/api/project-operations/tasks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: String(selectedRow.project.id),
          title: newTask.title,
          status: newTask.status,
          ownerLabel: newTask.ownerLabel,
          dueDate: newTask.dueDate,
          needsHumanInput: newTask.needsHumanInput,
          notes: newTask.notes,
        }),
      });
      await parseJsonResponse<{ task: ProjectOperationsTaskRow }>(response);
      toast.success("Task added");
      setNewTask(emptyTaskForm());
      await loadBoard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add task");
    } finally {
      setCreatingTask(false);
    }
  }

  async function updateTask(taskId: string, updates: Partial<ProjectOperationsTaskRow>) {
    try {
      const response = await fetch(`/api/project-operations/tasks/${taskId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      await parseJsonResponse<{ task: ProjectOperationsTaskRow }>(response);
      await loadBoard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update task");
    }
  }

  async function deleteTask(taskId: string) {
    try {
      const response = await fetch(`/api/project-operations/tasks/${taskId}`, {
        method: "DELETE",
        credentials: "include",
      });
      await parseJsonResponse<{ success: boolean }>(response);
      toast.success("Task removed");
      await loadBoard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove task");
    }
  }

  async function handleCreateEvent() {
    if (!selectedRow || !newEvent.summary.trim()) return;
    setCreatingEvent(true);
    try {
      const response = await fetch("/api/project-operations/events", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: String(selectedRow.project.id),
          eventDate: newEvent.eventDate,
          eventType: newEvent.eventType,
          summary: newEvent.summary,
          details: newEvent.details,
        }),
      });
      await parseJsonResponse<{ event: ProjectActivityEventRow }>(response);
      toast.success("Activity event logged");
      setNewEvent(emptyEventForm());
      await loadBoard();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to log event");
    } finally {
      setCreatingEvent(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="Projects in view" value={String(summary.totalProjects)} />
        <SummaryCard label="Blocked projects" value={String(summary.blockedProjects)} />
        <SummaryCard label="Needs follow-up" value={String(summary.needsFollowUp)} />
        <SummaryCard label="Open human checks" value={String(summary.pendingHuman)} />
      </div>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Operations board</CardTitle>
          <p className="text-sm text-muted-foreground">
            Control active projects, next actions, blockers, and manual follow-up work from one shared board.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_180px_180px_180px]">
            <Input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search by job, client, task, or note"
            />
            <select
              className={selectClass}
              value={filters.pm}
              onChange={(event) => setFilters((current) => ({ ...current, pm: event.target.value }))}
            >
              <option value="All">All PMs</option>
              {activePMs.map((pm) => (
                <option key={pm.initials} value={pm.initials}>{pm.fullName}</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.projectStatus}
              onChange={(event) => setFilters((current) => ({ ...current, projectStatus: event.target.value }))}
            >
              <option value="All">All project statuses</option>
              {PROJECT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              className={selectClass}
              value={filters.operationalStatus}
              onChange={(event) => setFilters((current) => ({ ...current, operationalStatus: event.target.value }))}
            >
              <option value="All">All ops statuses</option>
              {PROJECT_OPERATIONAL_STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>{status.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.humanOnly}
                onChange={(event) => setFilters((current) => ({ ...current, humanOnly: event.target.checked }))}
              />
              Only projects with pending human checks
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                className={checkboxClass}
                checked={filters.blockedOnly}
                onChange={(event) => setFilters((current) => ({ ...current, blockedOnly: event.target.checked }))}
              />
              Only blocked work
            </label>
            <Button variant="outline" size="sm" onClick={() => setFilters(EMPTY_PROJECT_OPERATIONS_FILTERS)}>Reset filters</Button>
            <Button variant="outline" size="sm" onClick={() => void loadBoard()}>Refresh board</Button>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.95fr)]">
            <Card className="border-dashed">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>PM</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next action</TableHead>
                      <TableHead className="text-right">Tasks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">Loading operations board…</TableCell>
                      </TableRow>
                    ) : filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">No projects match the current filters.</TableCell>
                      </TableRow>
                    ) : filteredRows.map((row) => {
                      const health = getBudgetHealthClasses(row.project.pct_budget_used ?? 0);
                      const active = String(row.project.id) === String(selectedRow?.project.id);
                      return (
                        <TableRow
                          key={row.project.id}
                          className={`cursor-pointer ${active ? "bg-accent/40" : "hover:bg-muted/50"}`}
                          onClick={() => setSelectedProjectId(String(row.project.id))}
                        >
                          <TableCell className="font-mono text-sm">{row.project.id}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium leading-tight">{row.project.name}</div>
                              <div className="text-xs text-muted-foreground">{row.project.client}</div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                <Badge variant="outline" className={health.pill}>{Math.round(row.project.pct_budget_used ?? 0)}% budget</Badge>
                                {row.needs_human_count > 0 && <Badge variant="outline">{row.needs_human_count} human</Badge>}
                                {row.blocked_task_count > 0 && <Badge variant="outline" className="border-red-200 text-red-700">{row.blocked_task_count} blocked</Badge>}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{resolveName(row.project.pm)}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Badge variant="outline" className={statusBadgeClass(row.operational_status)}>{getOperationalStatusLabel(row.operational_status)}</Badge>
                              <div className="text-xs text-muted-foreground">{row.project.status}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[220px] text-sm leading-5">
                              {row.next_action || <span className="text-muted-foreground">No next action yet</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            <div>{row.open_task_count} open</div>
                            <div className="text-xs text-muted-foreground">
                              {row.latest_activity_at ? `Touched ${formatDateCentral(row.latest_activity_at, { month: "short", day: "numeric" })}` : "No activity"}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="space-y-2">
                <CardTitle>{selectedRow ? `${selectedRow.project.id} · ${selectedRow.project.name}` : "Select a project"}</CardTitle>
                {selectedRow ? (
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>{selectedRow.project.client}</span>
                    <span>•</span>
                    <span>{resolveName(selectedRow.project.pm)}</span>
                    {selectedRow.project.due_date && <><span>•</span><span>Due {formatDateCentral(selectedRow.project.due_date)}</span></>}
                    <span>•</span>
                    <span>{formatCurrency(selectedRow.project.contract_amount ?? 0)} contract</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Pick a project row to manage state, tasks, and history.</p>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {selectedRow ? (
                  <>
                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Operations state</h3>
                        <Button size="sm" onClick={() => void handleSaveState()} disabled={savingState}>{savingState ? "Saving…" : "Save state"}</Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Ops status</span>
                          <select className={selectClass} value={stateForm.operationalStatus} onChange={(event) => setStateForm((current) => ({ ...current, operationalStatus: event.target.value }))}>
                            {PROJECT_OPERATIONAL_STATUS_OPTIONS.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1 text-sm">
                          <span className="text-muted-foreground">Target date</span>
                          <input className={inputClass} type="date" value={stateForm.targetDate} onChange={(event) => setStateForm((current) => ({ ...current, targetDate: event.target.value }))} />
                        </label>
                      </div>
                      <label className="space-y-1 text-sm block">
                        <span className="text-muted-foreground">Next action</span>
                        <Input value={stateForm.nextAction} onChange={(event) => setStateForm((current) => ({ ...current, nextAction: event.target.value }))} placeholder="What should happen next?" />
                      </label>
                      <label className="space-y-1 text-sm block">
                        <span className="text-muted-foreground">Blockers</span>
                        <Textarea value={stateForm.blockerSummary} onChange={(event) => setStateForm((current) => ({ ...current, blockerSummary: event.target.value }))} placeholder="What is blocked or at risk?" rows={3} />
                      </label>
                      <label className="space-y-1 text-sm block">
                        <span className="text-muted-foreground">Pending human input / checks</span>
                        <Textarea value={stateForm.pendingHumanInput} onChange={(event) => setStateForm((current) => ({ ...current, pendingHumanInput: event.target.value }))} placeholder="Who needs to answer or approve something?" rows={3} />
                      </label>
                      <label className="space-y-1 text-sm block">
                        <span className="text-muted-foreground">Context notes</span>
                        <Textarea value={stateForm.contextNotes} onChange={(event) => setStateForm((current) => ({ ...current, contextNotes: event.target.value }))} placeholder="Extra context for the board" rows={4} />
                      </label>
                    </section>

                    <section className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open tasks</h3>
                        <Link href={`/projects/${selectedRow.project.id}`} className="text-sm text-primary hover:underline">Open project</Link>
                      </div>
                      <div className="space-y-2">
                        {selectedRow.tasks.length === 0 ? (
                          <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">No manual tasks yet for this project.</div>
                        ) : selectedRow.tasks.map((task) => (
                          <div key={task.id} className="rounded-lg border px-3 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="font-medium leading-tight">{task.title}</div>
                                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                  <Badge variant="outline" className={taskStatusBadgeClass(task.status)}>{getTaskStatusLabel(task.status)}</Badge>
                                  {task.owner_label && <span>{task.owner_label}</span>}
                                  {task.due_date && <span>Due {formatDateCentral(task.due_date)}</span>}
                                  {task.needs_human_input && <span>Needs human input</span>}
                                </div>
                                {task.notes && <p className="text-sm text-muted-foreground">{task.notes}</p>}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {task.status !== "in_progress" && task.status !== "done" && (
                                  <Button variant="outline" size="sm" onClick={() => void updateTask(task.id, { status: "in_progress" })}>Start</Button>
                                )}
                                {task.status !== "blocked" && task.status !== "done" && (
                                  <Button variant="outline" size="sm" onClick={() => void updateTask(task.id, { status: "blocked" })}>Block</Button>
                                )}
                                {task.status !== "done" ? (
                                  <Button variant="outline" size="sm" onClick={() => void updateTask(task.id, { status: "done" })}>Done</Button>
                                ) : (
                                  <Button variant="outline" size="sm" onClick={() => void updateTask(task.id, { status: "open" })}>Reopen</Button>
                                )}
                                <Button variant="outline" size="sm" onClick={() => void deleteTask(task.id)}>Delete</Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-lg border border-dashed p-4 space-y-3">
                        <h4 className="font-medium">Add task</h4>
                        <Input value={newTask.title} onChange={(event) => setNewTask((current) => ({ ...current, title: event.target.value }))} placeholder="Task title" />
                        <div className="grid gap-3 md:grid-cols-3">
                          <input className={inputClass} value={newTask.ownerLabel} onChange={(event) => setNewTask((current) => ({ ...current, ownerLabel: event.target.value }))} placeholder="Owner / queue" />
                          <select className={selectClass} value={newTask.status} onChange={(event) => setNewTask((current) => ({ ...current, status: event.target.value }))}>
                            {PROJECT_TASK_STATUS_OPTIONS.map((status) => (
                              <option key={status.value} value={status.value}>{status.label}</option>
                            ))}
                          </select>
                          <input className={inputClass} type="date" value={newTask.dueDate} onChange={(event) => setNewTask((current) => ({ ...current, dueDate: event.target.value }))} />
                        </div>
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input type="checkbox" className={checkboxClass} checked={newTask.needsHumanInput} onChange={(event) => setNewTask((current) => ({ ...current, needsHumanInput: event.target.checked }))} />
                          Requires human check / approval
                        </label>
                        <Textarea value={newTask.notes} onChange={(event) => setNewTask((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional task notes" rows={3} />
                        <Button onClick={() => void handleCreateTask()} disabled={creatingTask || !newTask.title.trim()}>{creatingTask ? "Adding…" : "Add task"}</Button>
                      </div>
                    </section>

                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Activity log</h3>
                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {selectedRow.events.length === 0 ? (
                          <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">No activity logged yet for this project.</div>
                        ) : selectedRow.events.map((event) => (
                          <div key={event.id} className="rounded-lg border px-3 py-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="font-medium">{event.summary}</div>
                              <div className="text-xs text-muted-foreground">{formatDateCentral(event.event_date)} · {event.event_type}</div>
                            </div>
                            {event.details && <p className="mt-2 text-sm text-muted-foreground">{event.details}</p>}
                            {event.created_by && <div className="mt-2 text-xs text-muted-foreground">Logged by {event.created_by}</div>}
                          </div>
                        ))}
                      </div>
                      <div className="rounded-lg border border-dashed p-4 space-y-3">
                        <h4 className="font-medium">Log activity</h4>
                        <div className="grid gap-3 md:grid-cols-2">
                          <input className={inputClass} type="date" value={newEvent.eventDate} onChange={(event) => setNewEvent((current) => ({ ...current, eventDate: event.target.value }))} />
                          <input className={inputClass} value={newEvent.eventType} onChange={(event) => setNewEvent((current) => ({ ...current, eventType: event.target.value }))} placeholder="Type (update, call, risk, decision)" />
                        </div>
                        <Input value={newEvent.summary} onChange={(event) => setNewEvent((current) => ({ ...current, summary: event.target.value }))} placeholder="One-line summary" />
                        <Textarea value={newEvent.details} onChange={(event) => setNewEvent((current) => ({ ...current, details: event.target.value }))} placeholder="Optional detail / outcome" rows={3} />
                        <Button onClick={() => void handleCreateEvent()} disabled={creatingEvent || !newEvent.summary.trim()}>{creatingEvent ? "Logging…" : "Log event"}</Button>
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                    No project selected.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <CardTitle>Lookback</CardTitle>
          <p className="text-sm text-muted-foreground">Review what changed during a date window across all tracked project activity.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[180px_180px_auto]">
            <input className={inputClass} type="date" value={lookbackStart} onChange={(event) => setLookbackStart(event.target.value)} />
            <input className={inputClass} type="date" value={lookbackEnd} onChange={(event) => setLookbackEnd(event.target.value)} />
            <div className="text-sm text-muted-foreground flex items-center">{lookbackEvents.length} event(s) in range</div>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lookbackEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No logged events in this date range yet.</TableCell>
                  </TableRow>
                ) : lookbackEvents.map((event) => {
                  const project = projectById.get(String(event.project_id));
                  return (
                    <TableRow key={event.id}>
                      <TableCell>{formatDateCentral(event.event_date)}</TableCell>
                      <TableCell>{project ? `${project.id} · ${project.name}` : event.project_id}</TableCell>
                      <TableCell>{event.event_type}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div>{event.summary}</div>
                          {event.details && <div className="text-xs text-muted-foreground">{event.details}</div>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
