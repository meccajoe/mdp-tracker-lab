import { NextResponse } from "next/server";

import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { generateAdaQuote } from "@/lib/ada-quote-generation";
import { createAdaQuoteRevision } from "@/lib/ada-quote-revisions";
import { requireAdaWorkspaceAccess, resolveAdaCompatibilityThread } from "@/lib/ada-server";

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function plainFileName(value: string) {
  return value.replace(/[\[\]_*`#<>]/g, "").trim() || "client drawing";
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ workspaceId: string; assetId: string }> },
) {
  const { workspaceId, assetId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft");
  if (!access.ok) return access.response;

  const [workspaceResult, assetResult, existingResult] = await Promise.all([
    access.supabase.from("ada_quote_workspaces").select("id,title,tracker_project_id,status").eq("id", workspaceId).eq("created_by_email", access.actorEmail).single(),
    access.supabase.from("ada_quote_assets").select("id,original_name,mime_type,analysis_status,analysis_json").eq("id", assetId).eq("workspace_id", workspaceId).maybeSingle(),
    access.supabase.from("ada_quote_revisions").select("id,revision_number,quote_json,internal_cost,sell_price,margin_pct,assumptions_json,evidence_json,created_at").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (workspaceResult.error || assetResult.error || existingResult.error) return NextResponse.json({ error: workspaceResult.error?.message ?? assetResult.error?.message ?? existingResult.error?.message }, { status: 500 });
  const asset = assetResult.data;
  const existingRevision = existingResult.data;
  if (!asset) return NextResponse.json({ error: "Ada asset not found for this quote." }, { status: 404 });
  if (asset.analysis_status !== "ready" || !asset.analysis_json) return NextResponse.json({ error: "Ada must finish analyzing this drawing before creating the initial quote." }, { status: 409 });
  if (existingRevision) return NextResponse.json({ created: false, revision: existingRevision, reason: "quote_exists" });

  const [messagesResult, assetsResult] = await Promise.all([
    access.supabase.from("ada_quote_messages").select("role,content").eq("workspace_id", workspaceId).order("created_at"),
    access.supabase.from("ada_quote_assets").select("id,original_name,mime_type,analysis_status,analysis_json").eq("workspace_id", workspaceId).eq("analysis_status", "ready").order("created_at"),
  ]);
  if (messagesResult.error || assetsResult.error) return NextResponse.json({ error: messagesResult.error?.message ?? assetsResult.error?.message }, { status: 500 });

  const analysis = asset.analysis_json as { summary?: string; components?: Array<{ name?: string }>; questions?: string[] };
  const intelligenceQuery = [workspaceResult.data.title, analysis.summary, ...(analysis.components ?? []).map((component) => component.name)].filter(Boolean).join(" ").slice(0, 1200);
  const intelligence = await retrieveAdaIntelligence(access.supabase, intelligenceQuery, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: workspaceResult.data.tracker_project_id });

  try {
    const quote = await generateAdaQuote({ messages: messagesResult.data ?? [], assets: assetsResult.data ?? [], intelligence: intelligence.evidence });
    const latestCheck = await access.supabase.from("ada_quote_revisions").select("id,revision_number,quote_json,internal_cost,sell_price,margin_pct,assumptions_json,evidence_json,created_at").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle();
    if (latestCheck.error) throw new Error(latestCheck.error.message);
    if (latestCheck.data) return NextResponse.json({ created: false, revision: latestCheck.data, reason: "quote_exists" });

    const compatibilityThread = await resolveAdaCompatibilityThread(access, workspaceId);
    if (compatibilityThread.error || !compatibilityThread.id) {
      throw new Error(compatibilityThread.error ?? "Ada chat compatibility thread not found.");
    }
    const { revision, snapshot } = await createAdaQuoteRevision({ supabase: access.actorSupabase, workspaceId, actorEmail: access.actorEmail, quoteValue: { lineItems: quote.lineItems }, assumptions: quote.assumptions, evidence: quote.evidence });

    const fileName = plainFileName(asset.original_name);
    const userContent = `Uploaded client drawing: ${fileName}`;
    const assistantContent = `I analyzed **${fileName}** and created **Revision ${revision.revision_number}** as an initial quote.\n\n${analysis.summary || "The drawing analysis is attached to this quote for review."}\n\n**Initial estimate**\n- Internal cost: ${money(snapshot.totals.internalCost)}\n- Sell price: ${money(snapshot.totals.sellPrice)}\n- Gross margin: ${snapshot.totals.marginPct.toFixed(1)}%\n\nReview the scope, assumptions, and confidence in the Quote Canvas. Tell me what to change and I’ll create the next revision without overwriting this one.`;
    const { data: userMessage, error: userError } = await access.supabase.from("ada_quote_messages").insert({ workspace_id: workspaceId, concept_id: compatibilityThread.id, role: "user", content: userContent, created_by_email: access.actorEmail }).select("id,workspace_id,concept_id,role,content,structured_payload_json,created_by_email,created_at").single();
    if (userError) {
      throw new Error(userError.message);
    }
    const payload = { citations: [{ sourceId: `asset:${assetId}`, label: asset.original_name }], needsInput: Array.isArray(analysis.questions) ? analysis.questions.slice(0, 1) : [], limitations: intelligence.limitations, quoteAction: "propose_revision", revisionInstruction: "Initial quote generated from analyzed client drawing.", revision, revisionDelta: null };
    const { data: assistantMessage, error: assistantError } = await access.supabase.from("ada_quote_messages").insert({ workspace_id: workspaceId, concept_id: compatibilityThread.id, role: "assistant", content: assistantContent, structured_payload_json: payload, created_by_email: access.actorEmail }).select("id,workspace_id,concept_id,role,content,structured_payload_json,created_by_email,created_at").single();
    if (assistantError) {
      await access.supabase.from("ada_quote_messages").delete().eq("id", userMessage.id).eq("workspace_id", workspaceId);
      throw new Error(assistantError.message);
    }

    const completedAt = new Date().toISOString();
    await Promise.all([
      access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: compatibilityThread.id, event_type: "drawing_initial_quote_created", actor_email: access.actorEmail, payload_json: { asset_id: assetId, revision_id: revision.id, revision_number: revision.revision_number, user_message_id: userMessage.id, assistant_message_id: assistantMessage.id } }),
      access.supabase.from("ada_quote_workspaces").update({ last_activity_at: completedAt, status: "in_review" }).eq("id", workspaceId).eq("created_by_email", access.actorEmail),
    ]);
    return NextResponse.json({ created: true, revision, userMessage, assistantMessage }, { status: 201 });
  } catch (reason) {
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Ada could not create the initial quote from this drawing." }, { status: 500 });
  }
}
