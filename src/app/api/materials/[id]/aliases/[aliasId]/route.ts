import { NextRequest, NextResponse } from "next/server";

import { normalizeAliasText, requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeAliasText(payload: Record<string, unknown>) {
  return typeof payload.alias_text === "string" && payload.alias_text.trim() ? payload.alias_text.trim() : "";
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string; aliasId: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const { id: materialId, aliasId } = await context.params;
  const rawPayload = (await req.json()) as Record<string, unknown>;
  const aliasText = sanitizeAliasText(rawPayload);

  if (!aliasText) {
    return NextResponse.json({ error: "alias_text is required" }, { status: 400 });
  }

  const normalizedAliasText = normalizeAliasText(aliasText);
  const { data: existing, error: existingError } = await supabase
    .from("material_aliases")
    .select("*")
    .eq("id", aliasId)
    .eq("material_id", materialId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: existingError?.message ?? "alias not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("material_aliases")
    .update({
      alias_text: aliasText,
      normalized_alias_text: normalizedAliasText,
    })
    .eq("id", aliasId)
    .eq("material_id", materialId)
    .select("id, alias_text, normalized_alias_text, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "failed to update alias" }, { status: 500 });
  }

  await supabase.from("material_change_log").insert({
    material_id: materialId,
    entity_type: "material_alias",
    entity_id: aliasId,
    change_type: "update",
    old_value: existing,
    new_value: data,
    changed_by: actorEmail,
  });

  return NextResponse.json({ item: data });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string; aliasId: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const { id: materialId, aliasId } = await context.params;

  const { data: existing, error: existingError } = await supabase
    .from("material_aliases")
    .select("*")
    .eq("id", aliasId)
    .eq("material_id", materialId)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: existingError?.message ?? "alias not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("material_aliases")
    .delete()
    .eq("id", aliasId)
    .eq("material_id", materialId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("material_change_log").insert({
    material_id: materialId,
    entity_type: "material_alias",
    entity_id: aliasId,
    change_type: "delete",
    old_value: existing,
    changed_by: actorEmail,
  });

  return NextResponse.json({ ok: true });
}
