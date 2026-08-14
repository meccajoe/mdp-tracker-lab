import { NextResponse } from "next/server";

import { requireProjectAdmin } from "@/lib/project-portfolio-server";

export async function requireAdaAccess() {
  const admin = await requireProjectAdmin();
  if (!admin.ok) return admin;

  const { data: roleRow, error } = await admin.supabase
    .from("user_roles")
    .select("ada_access")
    .eq("email", admin.actorEmail)
    .maybeSingle();

  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!roleRow?.ada_access) return { ok: false as const, response: NextResponse.json({ error: "Ada access is not enabled for this user." }, { status: 403 }) };
  return admin;
}
