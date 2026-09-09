import { NextResponse } from "next/server";

import { streamAdaConversation } from "@/lib/ada-conversation";
import { retrieveAdaIntelligence } from "@/lib/ada-intelligence/gateway";
import { buildAdaIntelligenceQuery } from "@/lib/ada-intelligence/planner";
import { generateAdaRevisionProposalFromInstruction } from "@/lib/ada-quote-revisions";
import { validateAdaAssistantResponse, validateAdaUserRequest } from "@/lib/ada-chat-bounds";
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
  const userBoundsError = content ? validateAdaUserRequest(content) : null;
  if (!content) return NextResponse.json({ error: "Message content is required." }, { status: 400 });
  if (userBoundsError) return NextResponse.json({ error: userBoundsError.message }, { status: 400 });
  const clientRequestId = typeof body.clientRequestId === "string" ? body.clientRequestId.trim() : "";
  if (!UUID_PATTERN.test(clientRequestId)) return NextResponse.json({ error: "A valid client request id is required." }, { status: 400 });

  const { data: claimData, error: claimError } = await access.actorSupabase.rpc("claim_ada_chat_turn", {
    p_workspace_id: workspaceId,
    p_actor_email: access.actorEmail,
    p_client_request_id: clientRequestId,
    p_request_content: content,
  });
  if (claimError) {
    console.error("Ada chat turn claim failed", { workspaceId, actor: access.actorEmail, error: claimError.message });
    return NextResponse.json({ error: "Ada could not start this chat turn." }, { status: 400 });
  }
  const claim = Array.isArray(claimData) ? claimData[0] : claimData;
  if (!claim) return NextResponse.json({ error: "Ada could not claim this chat turn." }, { status: 500 });
  if (claim.turn_status === "completed" && claim.response_json) return NextResponse.json(claim.response_json, { status: 200 });
  if (claim.turn_status === "pending" && !claim.claimed) return NextResponse.json({ error: "Ada is already working on this message." }, { status: 409 });
  const turnId = claim.turn_id as string;
  const failTurn = async (message = "Ada could not complete this chat turn.") => {
    try { await access.actorSupabase.rpc("fail_ada_chat_turn", { p_workspace_id: workspaceId, p_turn_id: turnId, p_actor_email: access.actorEmail, p_error_message: message }); }
    catch (error) { console.error("Ada chat failure persistence failed", { workspaceId, turnId, error }); }
  };

  const compatibilityThread = await resolveAdaCompatibilityThread(access, workspaceId);
  if (compatibilityThread.error || !compatibilityThread.id) {
    console.error("Ada compatibility thread resolution failed", { workspaceId, actor: access.actorEmail, error: compatibilityThread.error });
    await failTurn();
    return NextResponse.json({ error: "Ada could not prepare this chat turn." }, { status: 500 });
  }
  const compatibilityThreadId = compatibilityThread.id;

  const userResult = await access.actorSupabase.rpc("ensure_ada_proposal_chat_user_message", {
    p_workspace_id: workspaceId,
    p_turn_id: turnId,
    p_concept_id: compatibilityThreadId,
    p_actor_email: access.actorEmail,
    p_request_content: content,
  });
  if (userResult.error || !userResult.data?.userMessage) {
    console.error("Ada chat user message persistence failed", { workspaceId, turnId, actor: access.actorEmail, error: userResult.error?.message ?? "missing user message" });
    await failTurn("Ada could not save this chat message.");
    return NextResponse.json({ error: "Ada could not save this chat message." }, { status: 500 });
  }
  const userMessage = userResult.data.userMessage;

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
          const workspaceResult = await access.supabase.from("ada_quote_workspaces").select("title, client_name, contact_name, tracker_project_id, status, row_version, current_revision_id").eq("id", workspaceId).single();
          if (workspaceResult.error) throw new Error(workspaceResult.error.message);
          const sourceRevisionId = workspaceResult.data.current_revision_id as string | null;
          const [messagesResult, assetsResult, revisionResult] = await Promise.all([
            access.supabase.from("ada_quote_messages").select("role, content, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(30),
            access.supabase.from("ada_quote_assets").select("id, original_name, mime_type, analysis_json").eq("workspace_id", workspaceId).eq("analysis_status", "ready").is("archived_at", null).order("created_at", { ascending: false }).limit(20),
            sourceRevisionId ? access.supabase.from("ada_quote_revisions").select("id, revision_number, quote_json, internal_cost, sell_price, margin_pct, assumptions_json, evidence_json, created_at").eq("workspace_id", workspaceId).eq("id", sourceRevisionId).maybeSingle() : Promise.resolve({ data: null, error: null }),
          ]);
          if (messagesResult.error || assetsResult.error || revisionResult.error) throw new Error(messagesResult.error?.message ?? assetsResult.error?.message ?? revisionResult.error?.message ?? "Ada context could not load.");
          if (sourceRevisionId && !revisionResult.data) throw new Error("Ada workspace current quote revision could not be loaded.");
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
          if (generated.response.quoteAction === "propose_revision") send({ type: "status", phase: "saving_proposal", label: "Preparing proposal for review…" });
          const proposalAction = generated.response.quoteAction === "propose_revision" && generated.response.revisionInstruction
            ? await generateAdaRevisionProposalFromInstruction({ workspaceId, instruction: generated.response.revisionInstruction, currentRevision: revisionResult.data as any, messages: conversationMessages, assets, intelligence: trackerEvidence }) : null;
          const proposalDelta = proposalAction?.proposalDelta ?? null;
          const proposalSnapshot = proposalAction?.snapshot ?? null;
          const assistantContent = proposalSnapshot ? `${generated.response.message}\n\nProposal ready for review.` : generated.response.message;
          const assistantPayload = { citations: generated.response.citations, needsInput: generated.response.needsInput, quoteAction: generated.response.quoteAction, revisionInstruction: generated.response.revisionInstruction, limitations: generated.response.limitations, model: generated.model };
          const assistantBoundsError = validateAdaAssistantResponse(assistantContent, assistantPayload, proposalDelta);
          if (assistantBoundsError) throw new Error("Ada response exceeded the technical size limit.");
          const finalized = await access.actorSupabase.rpc("complete_ada_proposal_chat_turn", {
            p_workspace_id: workspaceId,
            p_turn_id: turnId,
            p_concept_id: compatibilityThreadId,
            p_actor_email: access.actorEmail,
            p_expected_row_version: workspaceResult.data.row_version,
            p_source_revision_id: proposalAction?.sourceRevisionId ?? sourceRevisionId,
            p_proposed_revision_json: proposalSnapshot?.quoteJson ?? null,
            p_proposed_assumptions_json: proposalSnapshot?.assumptions ?? null,
            p_proposed_evidence_json: proposalSnapshot?.evidence ?? null,
            p_creation_idempotency_key: `ada-chat-turn:${turnId}`,
            p_assistant_content: assistantContent,
            p_assistant_payload_json: assistantPayload,
            p_proposal_delta_json: proposalDelta,
            p_workspace_status: proposalSnapshot ? "in_review" : generated.response.needsInput.length ? "gathering_inputs" : null,
          });
          if (finalized.error || !finalized.data) {
            console.error("Ada chat turn finalization failed", { workspaceId, turnId, actor: access.actorEmail, error: finalized.error?.message ?? "missing response" });
            throw new Error("Ada chat turn finalization failed");
          }
          send({ type: "final", response: finalized.data });
        } catch (reason) {
          console.error("Ada chat turn failed", { workspaceId, turnId, actor: access.actorEmail, error: reason });
          await failTurn();
          send({ type: "error", message: "Ada could not complete this chat turn." });
        } finally {
          if (clientConnected) { try { controller.close(); } catch { /* client disconnected */ } }
        }
      })();
    },
    cancel() { clientConnected = false; },
  });
  return new Response(responseStream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
