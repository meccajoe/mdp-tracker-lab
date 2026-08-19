import { NextResponse } from "next/server";

import { generateAdaConversation } from "@/lib/ada-conversation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { buildAdaIntelligenceQuery } from "@/lib/ada-intelligence/planner";
import { requireAdaWorkspaceAccess } from "@/lib/ada-server";

type EvidenceContextInput = { assetId?: unknown; page?: unknown };

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "Message content is required." }, { status: 400 });

  const requestedConceptId = typeof body.conceptId === "string" ? body.conceptId.trim() : "";
  const conceptQuery = access.supabase.from("ada_quote_concepts").select("id, workspace_id").eq("workspace_id", workspaceId).order("created_at").limit(1);
  const { data: requestedConcept, error: conceptError } = requestedConceptId
    ? await access.supabase.from("ada_quote_concepts").select("id, workspace_id").eq("id", requestedConceptId).eq("workspace_id", workspaceId).maybeSingle()
    : { data: (await conceptQuery).data?.[0] ?? null, error: null };
  if (conceptError) return NextResponse.json({ error: conceptError.message }, { status: 500 });
  if (!requestedConcept) return NextResponse.json({ error: "Ada chat compatibility thread not found." }, { status: 404 });
  const conceptId = requestedConcept.id;

  const { data: userMessage, error: messageError } = await access.supabase
    .from("ada_quote_messages")
    .insert({ workspace_id: workspaceId, concept_id: conceptId, role: "user", content, created_by_email: access.actorEmail })
    .select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at")
    .single();
  if (messageError) return NextResponse.json({ error: messageError.message }, { status: 500 });

  const workspaceResult = await access.supabase.from("ada_quote_workspaces").select("title, client_name, contact_name, tracker_project_id, status").eq("id", workspaceId).eq("created_by_email", access.actorEmail).single();
  if (workspaceResult.error) {
    await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: conceptId, event_type: "chat_turn_failed", actor_email: access.actorEmail, payload_json: { user_message_id: userMessage.id, stage: "workspace_context" } });
    return NextResponse.json({ error: workspaceResult.error.message }, { status: 500 });
  }

  const [messagesResult, assetsResult, revisionResult] = await Promise.all([
    access.supabase.from("ada_quote_messages").select("role, content, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(30),
    access.supabase.from("ada_quote_assets").select("id, original_name, mime_type, analysis_json").eq("workspace_id", workspaceId).eq("analysis_status", "ready").order("created_at", { ascending: false }).limit(20),
    access.supabase.from("ada_quote_revisions").select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (messagesResult.error || assetsResult.error || revisionResult.error) {
    const detail = messagesResult.error?.message ?? assetsResult.error?.message ?? revisionResult.error?.message ?? "Ada context could not load.";
    await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: conceptId, event_type: "chat_turn_failed", actor_email: access.actorEmail, payload_json: { user_message_id: userMessage.id, stage: "context" } });
    return NextResponse.json({ error: detail }, { status: 500 });
  }

  const intelligenceQuery = buildAdaIntelligenceQuery({
    message: content,
    workspaceTitle: workspaceResult.data.title,
    clientName: workspaceResult.data.client_name,
    recentMessages: (messagesResult.data ?? []).slice(0, 6).reverse().map((message) => message.content),
  });
  const intelligence = await retrieveAdaIntelligence(access.supabase, intelligenceQuery, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: workspaceResult.data.tracker_project_id });

  const assets = (assetsResult.data ?? []).map((asset) => ({ sourceId: `asset:${asset.id}`, label: asset.original_name, mimeType: asset.mime_type, analysis: asset.analysis_json }));
  const trackerEvidence = intelligence.evidence.map((item) => ({ sourceId: `${item.resource}:${item.sourceId}`, label: item.title, resource: item.resource, rationale: item.rationale, freshness: item.freshness, confidence: item.confidence, data: item.data }));
  const evidenceInput = (body.evidenceContext ?? {}) as EvidenceContextInput;
  const selectedAssetId = typeof evidenceInput.assetId === "string" ? evidenceInput.assetId.trim() : "";
  const selectedAsset = selectedAssetId ? assets.find((asset) => asset.sourceId === `asset:${selectedAssetId}`) : null;
  if (selectedAssetId && !selectedAsset) return NextResponse.json({ error: "Selected evidence is not available in this Ada chat." }, { status: 400 });
  const selectedPage = Number(evidenceInput.page);

  try {
    const generated = await generateAdaConversation({
      workspace: { title: workspaceResult.data.title, clientName: workspaceResult.data.client_name, contactName: workspaceResult.data.contact_name, status: workspaceResult.data.status },
      messages: (messagesResult.data ?? []).reverse().map((message) => ({ role: message.role as "user" | "assistant" | "system", content: message.content })),
      activeRevision: revisionResult.data,
      assets,
      trackerEvidence,
      limitations: intelligence.limitations,
      selectedEvidence: selectedAsset ? { sourceId: selectedAsset.sourceId, ...(Number.isInteger(selectedPage) && selectedPage > 0 ? { page: selectedPage } : {}) } : null,
    });
    const payload = { citations: generated.response.citations, needsInput: generated.response.needsInput, quoteAction: generated.response.quoteAction, revisionInstruction: generated.response.revisionInstruction, limitations: generated.response.limitations, model: generated.model };
    const { data: assistantMessage, error: assistantError } = await access.supabase
      .from("ada_quote_messages")
      .insert({ workspace_id: workspaceId, concept_id: conceptId, role: "assistant", content: generated.response.message, structured_payload_json: payload, created_by_email: access.actorEmail })
      .select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at")
      .single();
    if (assistantError) throw new Error(assistantError.message);
    const completedAt = new Date().toISOString();
    await Promise.all([
      access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: conceptId, event_type: "chat_turn_completed", actor_email: access.actorEmail, payload_json: { user_message_id: userMessage.id, assistant_message_id: assistantMessage.id, citations: generated.response.citations, quote_action: generated.response.quoteAction, model: generated.model } }),
      access.supabase.from("ada_quote_workspaces").update({ last_activity_at: completedAt, ...(generated.response.needsInput.length ? { status: "gathering_inputs" } : {}) }).eq("id", workspaceId).eq("created_by_email", access.actorEmail),
    ]);
    return NextResponse.json({ userMessage, assistantMessage }, { status: 201 });
  } catch (reason) {
    await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: conceptId, event_type: "chat_turn_failed", actor_email: access.actorEmail, payload_json: { user_message_id: userMessage.id, stage: "generation" } });
    return NextResponse.json({ error: reason instanceof Error ? reason.message : "Ada could not complete this chat turn." }, { status: 500 });
  }
}
