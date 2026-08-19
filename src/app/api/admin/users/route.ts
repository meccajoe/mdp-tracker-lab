import { NextResponse } from "next/server";

import { requireAdminActor } from "@/lib/admin-server";

const ROLES = new Set(["admin", "pm", "production", "viewer"]);

export async function POST(request: Request) {
  const admin = await requireAdminActor();
  if (!admin.ok) return admin.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body.role === "string" ? body.role : "";
  const billSpendEmail = typeof body.billSpendEmail === "string" ? body.billSpendEmail.trim().toLowerCase() || null : null;
  const pmInitials = typeof body.pmInitials === "string" ? body.pmInitials.trim().toUpperCase() || null : null;
  if (!email.endsWith("@meccadesign.com") || !fullName || !ROLES.has(role)) return NextResponse.json({ error: "Valid Mecca email, full name, and role are required." }, { status: 400 });
  const { data, error } = await admin.supabase.from("user_roles").insert({ email, bill_spend_email: billSpendEmail, full_name: fullName, role, pm_initials: pmInitials, show_in_filters: role === "pm", ada_access: false }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ user: data }, { status: 201 });
}
