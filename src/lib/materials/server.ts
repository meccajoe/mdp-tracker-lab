import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { canManageProjectActions } from "@/lib/admin-access";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function getSupabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

export function normalizeAliasText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

type MaterialsAdminContext = {
  ok: true;
  supabase: any;
  actorEmail: string;
};

type MaterialsAdminError = {
  ok: false;
  response: NextResponse;
};

export async function requireMaterialsReader(): Promise<MaterialsAdminContext | MaterialsAdminError> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user }, error } = await supabaseAuth.auth.getUser();
  if (error || !user?.email) return { ok: false, response: NextResponse.json({ error: "Authentication required. Please sign out and sign back in." }, { status: 401 }) };
  return { ok: true, supabase: getSupabaseAdmin(), actorEmail: user.email.toLowerCase() };
}

export async function requireMaterialsAdmin(): Promise<MaterialsAdminContext | MaterialsAdminError> {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user?.email) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    };
  }

  const actorEmail = user.email.toLowerCase();
  const supabase = getSupabaseAdmin();
  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("email", actorEmail)
    .maybeSingle();

  if (roleError) {
    return {
      ok: false,
      response: NextResponse.json({ error: roleError.message }, { status: 500 }),
    };
  }

  if (!canManageProjectActions(roleRow?.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    supabase,
    actorEmail,
  };
}
