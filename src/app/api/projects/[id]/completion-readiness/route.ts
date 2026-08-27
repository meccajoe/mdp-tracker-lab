import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";
import { COMPLETION_READINESS_ITEMS, evaluateCompletionReadiness, type CompletionReadinessChecklist, type CompletionReadinessValue } from "@/lib/project-completion-readiness";

const allowed = new Set<CompletionReadinessValue>(["pending", "confirmed", "exception", "not_applicable"]);

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireProjectAdmin(); if (!actor.ok) return actor.response;
  const { id } = await context.params;
  const { data, error } = await actor.supabase.from("project_completion_reviews").select("*").eq("project_id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const checklist = (data?.checklist ?? {}) as CompletionReadinessChecklist;
  return NextResponse.json({ review: data ?? { project_id: id, checklist, exception_notes: {}, reviewed_by: null, updated_at: null }, readiness: evaluateCompletionReadiness(checklist) });
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireProjectAdmin(request); if (!actor.ok) return actor.response;
  const { id } = await context.params;
  const body = await request.json();
  const checklist = (body.checklist ?? {}) as Record<string, unknown>;
  const validKeys = new Set(COMPLETION_READINESS_ITEMS.map((item) => item.key));
  if (Object.entries(checklist).some(([key, value]) => !validKeys.has(key as never) || !allowed.has(value as CompletionReadinessValue))) return NextResponse.json({ error: "Invalid completion readiness checklist." }, { status: 400 });
  const exceptionNotes = typeof body.exception_notes === "object" && body.exception_notes ? body.exception_notes : {};
  const now = new Date().toISOString();
  const { data, error } = await actor.supabase.from("project_completion_reviews").upsert({ project_id: id, checklist, exception_notes: exceptionNotes, reviewed_by: actor.actorEmail, updated_at: now }, { onConflict: "project_id" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: data, readiness: evaluateCompletionReadiness(checklist as CompletionReadinessChecklist) });
}
