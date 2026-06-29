import { NextRequest, NextResponse } from "next/server";

import { normalizeAliasText, requireMaterialsAdmin } from "@/lib/materials/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeAliasText(payload: Record<string, unknown>) {
  return typeof payload.alias_text === "string" && payload.alias_text.trim() ? payload.alias_text.trim() : "";
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireMaterialsAdmin();
  if (!auth.ok) return auth.response;

  const { supabase, actorEmail } = auth;
  const { id: materialId } = await context.params;
  const rawPayload = (await req.json()) as Record<string, unknown>;
  const aliasText = sanitizeAliasText(rawPayload);

  if (!aliasText) {
    return NextResponse.json({ error: "alias_text is required" }, { status: 400 });
  }

  const normalizedAliasText = normalizeAliasText(aliasText);
  const { data: existingAlias } = await supabase
    .from("material_aliases")
    .select("id, alias_text, normalized_alias_text")
    .eq("material_id", materialId)
    .eq("normalized_alias_text", normalizedAliasText)
    .maybeSingle();

  if (existingAlias?.id) {
    return NextResponse.json({ item: existingAlias });
  }

  const { data, error } = await supabase
    .from("material_aliases")
    .insert({
      material_id: materialId,
      alias_text: aliasText,
      normalized_alias_text: normalizedAliasText,
    })
    .select("id, alias_text, normalized_alias_text, created_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "failed to create alias" }, { status: 500 });
  }

  await supabase.from("material_change_log").insert({
    material_id: materialId,
    entity_type: "material_alias",
    entity_id: data.id,
    change_type: "create",
    new_value: data,
    changed_by: actorEmail,
  });

  return NextResponse.json({ item: data }, { status: 201 });
}
