import { NextResponse } from "next/server";

import { requireAdminActor } from "@/lib/admin-server";

const ROLES = new Set(["admin", "pm", "production", "viewer"]);

export async function PATCH(request: Request, context: { params: Promise<{ email: string }> }) {
  const admin = await requireAdminActor();
  if (!admin.ok) return admin.response;
  const email = decodeURIComponent((await context.params).email).trim().toLowerCase();
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if (Object.hasOwn(body, "fullName")) {
    const value = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!value) return NextResponse.json({ error: "Full name is required." }, { status: 400 });
    updates.full_name = value;
  }
  if (Object.hasOwn(body, "role")) {
    const value = typeof body.role === "string" ? body.role : "";
    if (!ROLES.has(value)) return NextResponse.json({ error: "Valid role is required." }, { status: 400 });
    if (email === admin.actorEmail && value !== "admin") return NextResponse.json({ error: "You cannot remove your own admin role." }, { status: 400 });
    updates.role = value;
  }
  if (Object.hasOwn(body, "billSpendEmail")) updates.bill_spend_email = typeof body.billSpendEmail === "string" ? body.billSpendEmail.trim().toLowerCase() || null : null;
  if (Object.hasOwn(body, "pmInitials")) updates.pm_initials = typeof body.pmInitials === "string" ? body.pmInitials.trim().toUpperCase() || null : null;
  if (Object.hasOwn(body, "showInFilters")) updates.show_in_filters = Boolean(body.showInFilters);
  if (Object.hasOwn(body, "adaAccess")) updates.ada_access = Boolean(body.adaAccess);
  if (!Object.keys(updates).length) return NextResponse.json({ error: "No supported user changes supplied." }, { status: 400 });

  const { data, error } = await admin.supabase.from("user_roles").update(updates).eq("email", email).select("*").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ user: data });
}

export async function DELETE(_request: Request, context: { params: Promise<{ email: string }> }) {
  const admin = await requireAdminActor();
  if (!admin.ok) return admin.response;
  const email = decodeURIComponent((await context.params).email).trim().toLowerCase();
  if (email === admin.actorEmail) return NextResponse.json({ error: "You cannot remove your own user role." }, { status: 400 });
  const { error, count } = await admin.supabase.from("user_roles").delete({ count: "exact" }).eq("email", email);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!count) return NextResponse.json({ error: "User not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
