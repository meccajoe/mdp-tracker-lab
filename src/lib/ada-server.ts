import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function requireAdaAccess() {
  const cookieStore = await cookies();
  const auth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user: cookieUser } } = await auth.auth.getUser();
  let user = cookieUser;
  if (!user) {
    const authorization = (await headers()).get("authorization") ?? "";
    const bearerToken = authorization.replace(/^Bearer\s+/i, "").trim();
    if (bearerToken) {
      const bearerAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data: { user: bearerUser } } = await bearerAuth.auth.getUser(bearerToken);
      user = bearerUser;
    }
  }
  if (!user?.email) return { ok: false as const, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  const actorEmail = user.email.toLowerCase();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: roleRow, error } = await supabase.from("user_roles").select("ada_access, role, pm_initials").eq("email", actorEmail).maybeSingle();
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!roleRow?.ada_access) return { ok: false as const, response: NextResponse.json({ error: "Ada access is not enabled for this user." }, { status: 403 }) };
  return { ok: true as const, supabase, actorEmail, actorRole: roleRow.role ?? null, pmInitials: roleRow.pm_initials ?? null };
}

export async function requireAdaWorkspaceAccess(workspaceId: string) {
  const access = await requireAdaAccess();
  if (!access.ok) return access;
  const { data: workspace, error } = await access.supabase.from("ada_quote_workspaces").select("id").eq("id", workspaceId).eq("created_by_email", access.actorEmail).maybeSingle();
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (!workspace) return { ok: false as const, response: NextResponse.json({ error: "Ada chat not found." }, { status: 404 }) };
  return access;
}

export async function resolveAdaCompatibilityThread(access: { supabase: any; actorEmail: string }, workspaceId: string) {
  const existing = await access.supabase.from("ada_quote_concepts").select("id").eq("workspace_id", workspaceId).order("created_at").limit(1).maybeSingle();
  if (existing.error) return { id: null as string | null, error: existing.error.message };
  if (existing.data?.id) return { id: String(existing.data.id), error: null };
  const created = await access.supabase.from("ada_quote_concepts").insert({ workspace_id: workspaceId, label: "Workspace", mode: "standard", status: "draft", created_by_email: access.actorEmail }).select("id").single();
  return created.error ? { id: null as string | null, error: created.error.message } : { id: String(created.data.id), error: null };
}
