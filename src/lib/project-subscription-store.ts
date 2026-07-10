import { getNextStatusForAction, type SubscriptionAction } from "@/lib/project-subscriptions";

export type ProjectSubscriptionListRow = {
  id: string;
  project_id: string;
  created_by_email: string;
  channel: string;
  target_json: Record<string, unknown> | null;
  subscription_type: string;
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

export async function listSlackDmSubscriptionsForProject(args: {
  supabase: any;
  projectId: string;
  slackUserId: string;
  createdByEmail?: string | null;
}) {
  const { data, error } = await args.supabase
    .from("project_subscriptions")
    .select("id, project_id, created_by_email, channel, target_json, subscription_type, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json")
    .eq("project_id", args.projectId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    return { data: null, error: error.message };
  }

  const filtered = ((data ?? []) as ProjectSubscriptionListRow[]).filter((row) => rowBelongsToSlackCreator({
    row,
    slackUserId: args.slackUserId,
    createdByEmail: args.createdByEmail,
  }));

  return { data: filtered, error: null };
}

export async function updateSlackDmSubscriptionStatus(args: {
  supabase: any;
  projectId: string;
  subscriptionId: string;
  action: SubscriptionAction;
  slackUserId: string;
  createdByEmail?: string | null;
}) {
  const current = await listSlackDmSubscriptionsForProject({
    supabase: args.supabase,
    projectId: args.projectId,
    slackUserId: args.slackUserId,
    createdByEmail: args.createdByEmail,
  });

  if (current.error) {
    return { data: null, error: current.error };
  }

  const row = (current.data ?? []).find((item) => item.id === args.subscriptionId);
  if (!row) {
    return { data: null, error: "Subscription not found for this Slack user" };
  }

  const { data, error } = await args.supabase
    .from("project_subscriptions")
    .update({ status: getNextStatusForAction(args.action), updated_at: new Date().toISOString() })
    .eq("project_id", args.projectId)
    .eq("id", args.subscriptionId)
    .select("id, project_id, created_by_email, channel, target_json, subscription_type, metric_key, condition_operator, threshold_value, schedule_cron, status, cooldown_minutes, summary_text, last_triggered_at, created_at, updated_at, rule_json")
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ProjectSubscriptionListRow, error: null };
}
