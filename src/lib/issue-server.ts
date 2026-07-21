import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { canManageIssues } from "@/lib/issue-access";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type IssueActor = {
  ok: true;
  supabase: any;
  actorEmail: string;
  role: string;
};

type IssueActorError = {
  ok: false;
  response: NextResponse;
};

async function getActorEmail(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (bearer) {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { user }, error } = await authClient.auth.getUser(bearer);
    return error || !user?.email ? null : user.email.toLowerCase();
  }

  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
  const { data: { user }, error } = await supabaseAuth.auth.getUser();
  return error || !user?.email ? null : user.email.toLowerCase();
}

export async function requireIssueActor(request: NextRequest): Promise<IssueActor | IssueActorError> {
  const actorEmail = await getActorEmail(request);
  if (!actorEmail) {
    return { ok: false, response: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("email", actorEmail)
    .maybeSingle();
  if (roleError) {
    return { ok: false, response: NextResponse.json({ error: roleError.message }, { status: 500 }) };
  }
  const role = roleRow?.role;
  if (!canManageIssues(role)) {
    return { ok: false, response: NextResponse.json({ error: "Issue-tracker access required" }, { status: 403 }) };
  }

  return { ok: true, supabase, actorEmail, role };
}
