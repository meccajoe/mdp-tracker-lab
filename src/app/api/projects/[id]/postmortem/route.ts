import { NextRequest, NextResponse } from "next/server";
import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await requireProjectAdmin(); if (!actor.ok) return actor.response;
  const { id } = await context.params;
  const { data, error } = await actor.supabase.from("project_postmortems").select("*").eq("project_id", id).order("generated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ postmortem: data });
}
