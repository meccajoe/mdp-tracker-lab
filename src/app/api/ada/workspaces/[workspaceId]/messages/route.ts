import { NextResponse } from "next/server";

import { streamAdaConversation } from "@/lib/ada-conversation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { buildAdaIntelligenceQuery } from "@/lib/ada-intelligence/planner";
import { createAdaRevisionFromInstruction } from "@/lib/ada-quote-revisions";
import { requireAdaWorkspaceAccess, resolveAdaCompatibilityThread } from "@/lib/ada-server";
import { encodeAdaStreamEvent, type AdaStreamEvent } from "@/lib/ada-stream-protocol";

type EvidenceContextInput = { assetId?: unknown; page?: unknown };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await context.params;
  const access = await requireAdaWorkspaceAccess(workspaceId, "edit_draft");
  if (!access.ok) return access.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : "";
  if (!UUID_PATTERN.test(clientRequestId)) return NextResponse.json({ error: "A valid client request id is required." }, { status: 400 });

  const { data: claimData, error: claimError } = await access.actorSupabase.rpc("claim_ada_chat_turn", {
    p_workspace_id: workspaceId,
    p_actor_email: access.actorEmail,
    p_client_request_id: clientRequestId,
    p_request_content: content,
  });
  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 400 });
  const claim = Array.isArray(claimData) ? claimData[0] : claimData;
  if (!claim) return NextResponse.json({ error: "Ada could not claim this chat turn." }, { status: 500 });
  if (claim.turn_status === "completed" && claim.response_json) return NextResponse.json(claim.response_json, { status: 200 });
  if (claim.turn_status === "pending" && !claim.claimed) return NextResponse.json({ error: "Ada is already working on this message." }, { status: 409 });
  const turnId = claim.turn_id as string;
  const failTurn = async (message: string) => {
    await access.supabase.from("ada_chat_turns").update({ status: "failed", error_message: message }).eq("id", turnId).eq("workspace_id", workspaceId).eq("actor_email", access.actorEmail.toLowerCase());
  };

  const compatibilityThread = await resolveAdaCompatibilityThread(access, workspaceId);
  if (compatibilityThread.error || !compatibilityThread.id) {
    const message = compatibilityThread.error ?? "Ada chat compatibility thread not found.";
    await failTurn(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const compatibilityThreadId = compatibilityThread.id;

  const { data: userMessage, error: messageError } = await access.supabase
    .from("ada_quote_messages")
    .insert({ workspace_id: workspaceId, concept_id: compatibilityThreadId, role: "user", content, created_by_email: access.actorEmail })
    .select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at")
    .single();
  if (messageError) {
    await failTurn(messageError.message);
    return NextResponse.json({ error: messageError.message }, { status: 500 });
  }
  const linkedTurn = await access.supabase.from("ada_chat_turns").update({ user_message_id: userMessage.id }).eq("id", turnId).eq("workspace_id", workspaceId).eq("actor_email", access.actorEmail.toLowerCase());
  if (linkedTurn.error) {
    await failTurn(linkedTurn.error.message);
    return NextResponse.json({ error: linkedTurn.error.message }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let clientConnected = true;
  const responseStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: AdaStreamEvent) => {
        if (!clientConnected) return;
        try { controller.enqueue(encoder.encode(encodeAdaStreamEvent(event))); } catch { clientConnected = false; }
      };
      void (async () => {
        try {
          send({ type: "status", phase: "context", label: "Gathering Tracker context…" });
          const workspaceResult = await access.supabase.from("ada_quote_workspaces").select("title, client_name, contact_name, tracker_project_id, status").eq("id", workspaceId).single();
          if (workspaceResult.error) throw new Error(workspaceResult.error.message);
          const [messagesResult, assetsResult, revisionResult] = await Promise.all([
            access.supabase.from("ada_quote_messages").select("role, content, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(30),
            access.supabase.from("ada_quote_assets").select("id, original_name, mime_type, analysis_json").eq("workspace_id", workspaceId).eq("analysis_status", "ready").is("archived_at", null).order("created_at", { ascending: false }).limit(20),
            access.supabase.from("ada_quote_revisions").select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").eq("workspace_id", workspaceId).order("revision_number", { ascending: false }).limit(1).maybeSingle(),
          ]);
          if (messagesResult.error || assetsResult.error || revisionResult.error) throw new Error(messagesResult.error?.message ?? assetsResult.error?.message ?? revisionResult.error?.message ?? "Ada context could not load.");
          const intelligenceQuery = buildAdaIntelligenceQuery({ message: content, workspaceTitle: workspaceResult.data.title, clientName: workspaceResult.data.client_name, recentMessages: (messagesResult.data ?? []).slice(0, 6).reverse().map((message) => message.content) });
          send({ type: "status", phase: "evidence", label: "Reviewing evidence…" });
          const intelligence = await retrieveAdaIntelligence(access.supabase, intelligenceQuery, { actorRole: access.actorRole, pmInitials: access.pmInitials, currentTrackerProjectId: workspaceResult.data.tracker_project_id });
          const assets = (assetsResult.data ?? []).map((asset) => ({ sourceId: `asset:${asset.id}`, label: asset.original_name, mimeType: asset.mime_type, analysis: asset.analysis_json }));
          const trackerEvidence = intelligence.evidence.map((item) => ({ sourceId: `${item.resource}:${item.sourceId}`, label: item.title, resource: item.resource, rationale: item.rationale, freshness: item.freshness, confidence: item.confidence, data: item.data }));
          const evidenceInput = (body.evidenceContext ?? {}) as EvidenceContextInput;
          const selectedAssetId = typeof evidenceInput.assetId === "string" ? evidenceInput.assetId.trim() : "";
          const selectedAsset = selectedAssetId ? assets.find((asset) => asset.sourceId === `asset:${selectedAssetId}`) : null;
          if (selectedAssetId && !selectedAsset) throw new Error("Selected evidence is not available in this Ada chat.");
          const selectedPage = Number(evidenceInput.page);
          const conversationMessages = [...(messagesResult.data ?? [])].reverse().map((message) => ({ role: message.role as "user" | "assistant" | "system", content: message.content }));
          send({ type: "status", phase: "responding", label: "Ada is responding…" });
          const generated = await streamAdaConversation({
            workspace: { title: workspaceResult.data.title, clientName: workspaceResult.data.client_name, contactName: workspaceResult.data.contact_name, status: workspaceResult.data.status }, messages: conversationMessages, activeRevision: revisionResult.data, assets, trackerEvidence, limitations: intelligence.limitations,
            selectedEvidence: selectedAsset ? { sourceId: selectedAsset.sourceId, ...(Number.isInteger(selectedPage) && selectedPage > 0 ? { page: selectedPage } : {}) } : null,
          }, { onTextDelta: (text) => send({ type: "delta", text }) });
          if (generated.response.quoteAction === "propose_revision") send({ type: "status", phase: "updating_quote", label: "Updating quote…" });
          const revisionAction = generated.response.quoteAction === "propose_revision" && generated.response.revisionInstruction
            ? await createAdaRevisionFromInstruction({ supabase: access.supabase, workspaceId, actorEmail: access.actorEmail, instruction: generated.response.revisionInstruction, currentRevision: revisionResult.data as any, messages: conversationMessages, assets, intelligence: trackerEvidence }) : null;
          if (revisionAction) {
            const linkedRevision = await access.supabase.from("ada_chat_turns").update({ revision_id: revisionAction.revision.id }).eq("id", turnId).eq("workspace_id", workspaceId).eq("actor_email", access.actorEmail.toLowerCase());
            if (linkedRevision.error) throw new Error(linkedRevision.error.message);
            const revisionEvent = await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: compatibilityThreadId, event_type: "quote_revision_created_from_chat", actor_email: access.actorEmail, payload_json: { revision_id: revisionAction.revision.id, revision_number: revisionAction.revision.revision_number, source_revision_id: revisionAction.sourceRevisionId, instruction: generated.response.revisionInstruction, delta: revisionAction.revisionDelta } });
            if (revisionEvent.error) { await access.supabase.from("ada_quote_revisions").delete().eq("id", revisionAction.revision.id).eq("workspace_id", workspaceId); throw new Error(revisionEvent.error.message); }
          }
          const payload = { citations: generated.response.citations, needsInput: generated.response.needsInput, quoteAction: generated.response.quoteAction, revisionInstruction: generated.response.revisionInstruction, limitations: generated.response.limitations, model: generated.model, revision: revisionAction?.revision ?? null, revisionDelta: revisionAction?.revisionDelta ?? null };
          const assistantContent = revisionAction ? `${generated.response.message}\n\nQuote updated — Revision ${revisionAction.revision.revision_number}.` : generated.response.message;
          const { data: assistantMessage, error: assistantError } = await access.supabase.from("ada_quote_messages").insert({ workspace_id: workspaceId, concept_id: compatibilityThreadId, role: "assistant", content: assistantContent, structured_payload_json: payload, created_by_email: access.actorEmail }).select("id, workspace_id, concept_id, role, content, structured_payload_json, created_by_email, created_at").single();
          if (assistantError) throw new Error(assistantError.message);
          const completedAt = new Date().toISOString();
          const responseJson = { userMessage, assistantMessage, revision: revisionAction?.revision ?? null, revisionDelta: revisionAction?.revisionDelta ?? null };
          const completedTurn = await access.supabase.from("ada_chat_turns").update({ status: "completed", assistant_message_id: assistantMessage.id, revision_id: revisionAction?.revision.id ?? null, response_json: responseJson, error_message: null, completed_at: completedAt }).eq("id", turnId).eq("workspace_id", workspaceId).eq("actor_email", access.actorEmail.toLowerCase());
          if (completedTurn.error) throw new Error(completedTurn.error.message);
          const { error: eventError } = await access.actorSupabase.rpc("record_ada_compatibility_event", {
            p_workspace_id: workspaceId,
            p_concept_id: compatibilityThreadId,
            p_event_type: "chat_turn_completed",
            p_actor_email: access.actorEmail,
            p_actor_capability: "edit_draft",
            p_workspace_status: revisionAction ? "in_review" : generated.response.needsInput.length ? "gathering_inputs" : null,
            p_payload_json: { user_message_id: userMessage.id, assistant_message_id: assistantMessage.id, citations: generated.response.citations, quote_action: generated.response.quoteAction, model: generated.model },
            p_idempotency_key: `chat-turn-completed:${workspaceId}:${turnId}`,
          });
          if (eventError) throw new Error(eventError.message);
          send({ type: "final", response: responseJson });
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Ada could not complete this chat turn.";
          await failTurn(message);
          await access.supabase.from("ada_quote_events").insert({ workspace_id: workspaceId, concept_id: compatibilityThreadId, event_type: "chat_turn_failed", actor_email: access.actorEmail, payload_json: { user_message_id: userMessage.id, stage: "generation" } });
          send({ type: "error", message });
        } finally {
          if (clientConnected) { try { controller.close(); } catch { /* client disconnected */ } }
        }
      })();
    },
    cancel() { clientConnected = false; },
  });
  return new Response(responseStream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
