import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { canPerformQuoteAction, type QuoteAction, type QuoteActor } from "@/lib/quote-permissions";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function requireAdaIdentity() {
  const cookieStore = await cookies();
  const auth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user: cookieUser } } = await auth.auth.getUser();
  let user = cookieUser;
  let actorSupabase = auth;
  if (!user) {
    const authorization = (await headers()).get("authorization") ?? "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (bearerToken) {
      const bearerAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${bearerToken}` } } });
      const { data: { user: bearerUser } } = await bearerAuth.auth.getUser(bearerToken);
      user = bearerUser;
      actorSupabase = bearerAuth;
    }
  }
  if (!user?.email) return { ok: false as const, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const actorEmail = user.email.toLowerCase();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: roleRow, error } = await supabase.from("user_roles").select("ada_access, role, pm_initials").eq("email", actorEmail).maybeSingle();
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  return {
    ok: true as const,
    supabase,
    actorSupabase,
    actorId: user.id,
    actorEmail,
    actorRole: roleRow?.role ?? null,
    pmInitials: roleRow?.pm_initials ?? null,
    legacyAdaAccess: Boolean(roleRow?.ada_access),
  };
}

export async function requireAdaAccess() {
  const access = await requireAdaIdentity();
  if (!access.ok) return access;
  if (!access.legacyAdaAccess) return { ok: false as const, response: NextResponse.json({ error: "Ada access is not enabled for this user." }, { status: 403 }) };
  return access;
}

export async function requireAdaWorkspaceAccess(workspaceId: string, action: QuoteAction = "view_workspace") {
  const access = await requireAdaIdentity();
  if (!access.ok) return access;
  const authorization = await resolveQuoteWorkspaceAuthorization(access, workspaceId);
  if (!authorization.ok) return authorization;
  if (!canPerformQuoteAction(authorization.actor, action)) {
    return { ok: false as const, response: NextResponse.json({ error: "Quote Workspace access required." }, { status: 403 }) };
  }
  if (action !== "view_workspace" && authorization.workspaceLifecycle === "archived") {
    return { ok: false as const, response: NextResponse.json({ error: "Archived Quote Workspaces are read-only." }, { status: 409 }) };
  }
  return { ...access, quoteActor: authorization.actor, workspaceLifecycle: authorization.workspaceLifecycle };
}

export async function resolveQuoteWorkspaceAuthorization(
  access: { supabase: any; actorId: string; actorEmail: string; actorRole: string | null },
  workspaceId: string,
) {
  const membershipResult = await access.supabase
    .from("quote_workspace_members")
    .select("workspace_role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", access.actorId)
    .eq("email_normalized", access.actorEmail)
    .is("removed_at", null)
    .maybeSingle();
  if (membershipResult.error) {
    return { ok: false as const, response: NextResponse.json({ error: membershipResult.error.message }, { status: 500 }) };
  }
  if (!membershipResult.data) {
    return { ok: false as const, response: NextResponse.json({ error: "Ada chat not found." }, { status: 404 }) };
  }

  const workspaceResult = await access.supabase
    .from("ada_quote_workspaces")
    .select("lifecycle_status")
    .eq("id", workspaceId)
    .maybeSingle();
  if (workspaceResult.error) {
    return { ok: false as const, response: NextResponse.json({ error: workspaceResult.error.message }, { status: 500 }) };
  }
  if (!workspaceResult.data) {
    return { ok: false as const, response: NextResponse.json({ error: "Ada chat not found." }, { status: 404 }) };
  }

  const capabilityResult = await access.supabase
    .from("quote_user_capabilities")
    .select("capability")
    .eq("user_id", access.actorId)
    .eq("email_normalized", access.actorEmail)
    .is("revoked_at", null);
  if (capabilityResult.error) {
    return { ok: false as const, response: NextResponse.json({ error: capabilityResult.error.message }, { status: 500 }) };
  }

  const actor: QuoteActor = {
    email: access.actorEmail,
    systemRole: access.actorRole,
    workspaceRole: membershipResult.data.workspace_role,
    capabilities: (capabilityResult.data ?? []).map((row: { capability: string }) => row.capability),
    isActiveMember: true,
  };
  return { ok: true as const, actor, workspaceLifecycle: workspaceResult.data.lifecycle_status as string };
}

export async function resolveAdaCompatibilityThread(access: { supabase: any; actorEmail: string }, workspaceId: string) {
  const existing = await access.supabase.from("ada_quote_concepts").select("id").eq("workspace_id", workspaceId).order("created_at").limit(1).maybeSingle();
  if (existing.error) return { id: null as string | null, error: existing.error.message };
  if (existing.data?.id) return { id: String(existing.data.id), error: null };
  const created = await access.supabase.from("ada_quote_concepts").insert({ workspace_id: workspaceId, label: "Workspace", mode: "standard", status: "draft", created_by_email: access.actorEmail }).select("id").single();
  return created.error ? { id: null as string | null, error: created.error.message } : { id: String(created.data.id), error: null };
}
