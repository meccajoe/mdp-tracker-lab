type SlackThreadBindingRow = {
  project_id: string;
};

function isMissingThreadBindingsTable(error: { message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  return message.includes("project_conversation_threads") && (message.includes("does not exist") || message.includes("relation"));
}

export async function findSlackThreadBinding(args: {
  supabase: any;
  slackTeamId: string;
  channelId: string;
  threadTs: string;
}) {
  const { data, error } = await args.supabase
    .from("project_conversation_threads")
    .select("project_id")
    .eq("slack_team_id", args.slackTeamId)
    .eq("channel_id", args.channelId)
    .eq("thread_ts", args.threadTs)
    .maybeSingle();

  if (error) {
    if (isMissingThreadBindingsTable(error)) {
      return { data: null, error: null, available: false };
    }
    return { data: null, error: error.message, available: true };
  }

  return { data: data as SlackThreadBindingRow | null, error: null, available: true };
}

export async function upsertSlackThreadBinding(args: {
  supabase: any;
  slackTeamId: string;
  channelId: string;
  threadTs: string;
  projectId: string;
  createdBySlackUserId: string | null;
}) {
  const { error } = await args.supabase
    .from("project_conversation_threads")
    .upsert({
      slack_team_id: args.slackTeamId,
      channel_id: args.channelId,
      thread_ts: args.threadTs,
      project_id: args.projectId,
      created_by_slack_user_id: args.createdBySlackUserId,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "slack_team_id,channel_id,thread_ts" });

  if (error) {
    if (isMissingThreadBindingsTable(error)) {
      return { error: null, available: false };
    }
    return { error: error.message, available: true };
  }

  return { error: null, available: true };
}
