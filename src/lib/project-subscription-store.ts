import { getNextStatusForAction, type SubscriptionAction, type SubscriptionScopeType } from "@/lib/project-subscriptions";

export type ProjectSubscriptionListRow = {
  id: string;
  project_id: string | null;
  created_by_email: string;
  channel: string;
  target_json: Record<string, unknown> | null;
  subscription_type: string;
  scope_type: SubscriptionScopeType;
  scope_json: Record<string, unknown> | null;
  metric_key: string | null;
  condition_operator: string | null;
  threshold_value: number | null;
  schedule_cron: string | null;
  status: string;
  cooldown_minutes: number;
  summary_text: string;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
  rule_json: Record<string, unknown> | null;
};

const PROJECT_SUBSCRIPTION_SELECT = "id, project_id, created_by_email, channel, target_json, subscription_type, scope_type, scope_json, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json";
const LEGACY_PROJECT_SUBSCRIPTION_SELECT = "id, project_id, created_by_email, channel, target_json, subscription_type, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json";

function normalizeCreatorIdentifiers(slackUserId: string, createdByEmail?: string | null) {
  const identifiers = new Set<string>([`slack:${slackUserId}`]);
  if (createdByEmail) {
    identifiers.add(createdByEmail.toLowerCase());
  }
  return identifiers;
}

function rowBelongsToSlackCreator(args: {
  row: ProjectSubscriptionListRow;
  slackUserId: string;
  createdByEmail?: string | null;
}) {
  const identifiers = normalizeCreatorIdentifiers(args.slackUserId, args.createdByEmail);
  const targetSlackUserId = typeof args.row.target_json?.slack_user_id === "string"
    ? args.row.target_json.slack_user_id
    : null;

  return targetSlackUserId === args.slackUserId || identifiers.has(args.row.created_by_email.toLowerCase());
}

function schemaColumnMissing(message?: string | null) {
  return !!message && (message.includes("scope_type") || message.includes("scope_json"));
}

function applyScopeDefaults(row: Record<string, unknown>): ProjectSubscriptionListRow {
  return {
    ...(row as unknown as Omit<ProjectSubscriptionListRow, "scope_type" | "scope_json">),
    project_id: typeof row.project_id === "string" ? row.project_id : null,
    scope_type: (row.scope_type as SubscriptionScopeType | undefined) ?? "project",
    scope_json: (row.scope_json as Record<string, unknown> | null | undefined) ?? (typeof row.project_id === "string" ? { project_id: row.project_id } : {}),
  };
}

export async function listSlackDmSubscriptions(args: {
  supabase: any;
  slackUserId: string;
  createdByEmail?: string | null;
  projectId?: string | null;
  scopeTypes?: SubscriptionScopeType[];
}) {
  const runQuery = async (selectClause: string, applyScopeFilter = true) => {
    let query = args.supabase
      .from("project_subscriptions")
      .select(selectClause)
      .eq("channel", "slack_dm")
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (args.projectId) {
      query = query.eq("project_id", args.projectId);
    }

    if (applyScopeFilter && args.scopeTypes && args.scopeTypes.length > 0) {
      query = query.in("scope_type", args.scopeTypes);
    }

    return query;
  };

  let { data, error } = await runQuery(PROJECT_SUBSCRIPTION_SELECT, true);
  if (error && schemaColumnMissing(error.message)) {
    const legacy = await runQuery(LEGACY_PROJECT_SUBSCRIPTION_SELECT, false);
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    return { data: null, error: error.message };
  }

  const filtered = ((data ?? []) as Array<Record<string, unknown>>)
    .map(applyScopeDefaults)
    .filter((row) => rowBelongsToSlackCreator({
      row,
      slackUserId: args.slackUserId,
      createdByEmail: args.createdByEmail,
    }))
    .filter((row) => !args.scopeTypes || args.scopeTypes.length === 0 || args.scopeTypes.includes(row.scope_type));

  return { data: filtered, error: null };
}

export async function listSlackDmSubscriptionsForProject(args: {
  supabase: any;
  projectId: string;
  slackUserId: string;
  createdByEmail?: string | null;
}) {
  return listSlackDmSubscriptions({
    supabase: args.supabase,
    projectId: args.projectId,
    slackUserId: args.slackUserId,
    createdByEmail: args.createdByEmail,
  });
}

export async function updateSlackDmSubscriptionStatus(args: {
  supabase: any;
  projectId?: string | null;
  subscriptionId: string;
  action: SubscriptionAction;
  slackUserId: string;
  createdByEmail?: string | null;
  scopeTypes?: SubscriptionScopeType[];
}) {
  const current = await listSlackDmSubscriptions({
    supabase: args.supabase,
    projectId: args.projectId,
    slackUserId: args.slackUserId,
    createdByEmail: args.createdByEmail,
    scopeTypes: args.scopeTypes,
  });

  if (current.error) {
    return { data: null, error: current.error };
  }

  const row = (current.data ?? []).find((item) => item.id === args.subscriptionId);
  if (!row) {
    return { data: null, error: "Subscription not found for this Slack user" };
  }

  const runUpdate = async (selectClause: string) => {
    let query = args.supabase
      .from("project_subscriptions")
      .update({ status: getNextStatusForAction(args.action), updated_at: new Date().toISOString() })
      .eq("id", args.subscriptionId)
      .select(selectClause)
      .single();

    if (args.projectId) {
      query = query.eq("project_id", args.projectId);
    }

    return query;
  };

  let { data, error } = await runUpdate(PROJECT_SUBSCRIPTION_SELECT);
  if (error && schemaColumnMissing(error.message)) {
    const legacy = await runUpdate(LEGACY_PROJECT_SUBSCRIPTION_SELECT);
    data = legacy.data;
    error = legacy.error;
  }

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: applyScopeDefaults(data as Record<string, unknown>), error: null };
}
