import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function requireAdaAccess() {
  const cookieStore = await cookies();
  const auth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user?.email) return { ok: false as const, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
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
