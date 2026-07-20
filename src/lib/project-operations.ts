import { ProjectSummary } from "@/lib/types";

export type ProjectOperationalStatus =
  | "on_track"
  | "needs_follow_up"
  | "blocked"
  | "waiting_on_client"
  | "waiting_on_internal"
  | "waiting_on_vendor";

export type ProjectTaskStatus = "open" | "in_progress" | "blocked" | "done";

export type ProjectOperationsStateRow = {
  project_id: string;
  operational_status: ProjectOperationalStatus;
  next_action: string | null;
  blocker_summary: string | null;
  pending_human_input: string | null;
  context_notes: string | null;
  target_date: string | null;
  updated_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectOperationsTaskRow = {
  id: string;
  project_id: string;
  title: string;
  status: ProjectTaskStatus;
  owner_label: string | null;
  due_date: string | null;
  needs_human_input: boolean;
  notes: string | null;
  sort_order: number;
  created_by: string | null;
  updated_by: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProjectActivityEventRow = {
  id: string;
  project_id: string;
  event_date: string;
  event_type: string;
  summary: string;
  details: string | null;
  created_by: string | null;
  created_at?: string;
};

export type ProjectOperationsBoardRow = {
  project: ProjectSummary;
  state: ProjectOperationsStateRow | null;
  tasks: ProjectOperationsTaskRow[];
  events: ProjectActivityEventRow[];
  operational_status: ProjectOperationalStatus;
  next_action: string | null;
  blocker_summary: string | null;
  pending_human_input: string | null;
  target_date: string | null;
  open_task_count: number;
  blocked_task_count: number;
  needs_human_count: number;
  latest_activity_at: string | null;
};

export type ProjectOperationsBoardFilters = {
  search: string;
  pm: string;
  projectStatus: string;
  operationalStatus: string;
  humanOnly: boolean;
  blockedOnly: boolean;
};

export const EMPTY_PROJECT_OPERATIONS_FILTERS: ProjectOperationsBoardFilters = {
  search: "",
  pm: "All",
  projectStatus: "All",
  operationalStatus: "All",
  humanOnly: false,
  blockedOnly: false,
};

export const PROJECT_OPERATIONAL_STATUS_OPTIONS: Array<{ value: ProjectOperationalStatus; label: string }> = [
  { value: "on_track", label: "On track" },
  { value: "needs_follow_up", label: "Needs follow-up" },
  { value: "blocked", label: "Blocked" },
  { value: "waiting_on_client", label: "Waiting on client" },
  { value: "waiting_on_internal", label: "Waiting on internal" },
  { value: "waiting_on_vendor", label: "Waiting on vendor" },
];

export const PROJECT_TASK_STATUS_OPTIONS: Array<{ value: ProjectTaskStatus; label: string }> = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

export function getOperationalStatusLabel(status: ProjectOperationalStatus | null | undefined): string {
  const option = PROJECT_OPERATIONAL_STATUS_OPTIONS.find((item) => item.value === status);
  return option?.label ?? "On track";
}

export function getTaskStatusLabel(status: ProjectTaskStatus): string {
  return PROJECT_TASK_STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function normalizeIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function maxIsoDate(values: Array<string | null | undefined>): string | null {
  return values
    .map((value) => normalizeIsoDate(value))
    .filter((value): value is string => !!value)
    .sort((left, right) => right.localeCompare(left))[0] ?? null;
}

export function buildProjectOperationsBoardRows(args: {
  projects: ProjectSummary[];
  states: ProjectOperationsStateRow[];
  tasks: ProjectOperationsTaskRow[];
  events: ProjectActivityEventRow[];
}): ProjectOperationsBoardRow[] {
  const statesByProject = new Map(args.states.map((row) => [String(row.project_id), row]));
  const tasksByProject = new Map<string, ProjectOperationsTaskRow[]>();
  const eventsByProject = new Map<string, ProjectActivityEventRow[]>();

  for (const task of args.tasks) {
    const projectId = String(task.project_id);
    const bucket = tasksByProject.get(projectId) ?? [];
    bucket.push(task);
    tasksByProject.set(projectId, bucket);
  }

  for (const event of args.events) {
    const projectId = String(event.project_id);
    const bucket = eventsByProject.get(projectId) ?? [];
    bucket.push(event);
    eventsByProject.set(projectId, bucket);
  }

  return [...args.projects]
    .map((project) => {
      const projectId = String(project.id);
      const state = statesByProject.get(projectId) ?? null;
      const tasks = [...(tasksByProject.get(projectId) ?? [])].sort((left, right) => {
        const leftDue = left.due_date ?? "9999-12-31";
        const rightDue = right.due_date ?? "9999-12-31";
        if (leftDue !== rightDue) return leftDue.localeCompare(rightDue);
        return (left.sort_order ?? 0) - (right.sort_order ?? 0);
      });
      const events = [...(eventsByProject.get(projectId) ?? [])].sort((left, right) => {
        const leftDate = `${left.event_date}T00:00:00.000Z`;
        const rightDate = `${right.event_date}T00:00:00.000Z`;
        if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
        return (right.created_at ?? "").localeCompare(left.created_at ?? "");
      });
      const openTasks = tasks.filter((task) => task.status !== "done");
      const blockedTasks = tasks.filter((task) => task.status === "blocked");
      const needsHumanTasks = tasks.filter((task) => task.status !== "done" && task.needs_human_input);
      const latestActivityAt = maxIsoDate([
        state?.updated_at,
        ...tasks.map((task) => task.updated_at ?? task.created_at ?? null),
        ...events.map((event) => event.created_at ?? `${event.event_date}T00:00:00.000Z`),
      ]);

      return {
        project,
        state,
        tasks,
        events,
        operational_status: state?.operational_status ?? "on_track",
        next_action: state?.next_action ?? null,
        blocker_summary: state?.blocker_summary ?? null,
        pending_human_input: state?.pending_human_input ?? null,
        target_date: state?.target_date ?? null,
        open_task_count: openTasks.length,
        blocked_task_count: blockedTasks.length,
        needs_human_count: needsHumanTasks.length,
        latest_activity_at: latestActivityAt,
      } satisfies ProjectOperationsBoardRow;
    })
    .sort((left, right) => {
      const leftBlocked = left.operational_status === "blocked" ? 1 : 0;
      const rightBlocked = right.operational_status === "blocked" ? 1 : 0;
      if (leftBlocked !== rightBlocked) return rightBlocked - leftBlocked;
      const leftHuman = left.needs_human_count;
      const rightHuman = right.needs_human_count;
      if (leftHuman !== rightHuman) return rightHuman - leftHuman;
      return String(left.project.id).localeCompare(String(right.project.id), undefined, { numeric: true });
    });
}

export function applyProjectOperationsFilters(
  rows: ProjectOperationsBoardRow[],
  filters: ProjectOperationsBoardFilters,
): ProjectOperationsBoardRow[] {
  const search = filters.search.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.pm !== "All" && row.project.pm !== filters.pm) return false;
    if (filters.projectStatus !== "All" && row.project.status !== filters.projectStatus) return false;
    if (filters.operationalStatus !== "All" && row.operational_status !== filters.operationalStatus) return false;
    if (filters.humanOnly && row.needs_human_count === 0 && !row.pending_human_input) return false;
    if (filters.blockedOnly && row.operational_status !== "blocked" && row.blocked_task_count === 0) return false;
    if (!search) return true;

    const haystack = [
      String(row.project.id),
      row.project.name,
      row.project.client,
      row.project.pm,
      row.next_action ?? "",
      row.blocker_summary ?? "",
      row.pending_human_input ?? "",
      ...row.tasks.map((task) => task.title),
      ...row.events.map((event) => event.summary),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(search);
  });
}

export function filterProjectActivityEvents(
  events: ProjectActivityEventRow[],
  startDate: string,
  endDate: string,
): ProjectActivityEventRow[] {
  return [...events]
    .filter((event) => (!startDate || event.event_date >= startDate) && (!endDate || event.event_date <= endDate))
    .sort((left, right) => {
      if (left.event_date !== right.event_date) return right.event_date.localeCompare(left.event_date);
      return (right.created_at ?? "").localeCompare(left.created_at ?? "");
    });
}
