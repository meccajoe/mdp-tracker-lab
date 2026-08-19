import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function requireAdminActor() {
  const cookieStore = await cookies();
  const cookieAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  });
  const { data: { user: cookieUser } } = await cookieAuth.auth.getUser();
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
  const { data: roleRow, error } = await supabase.from("user_roles").select("role").eq("email", actorEmail).maybeSingle();
  if (error) return { ok: false as const, response: NextResponse.json({ error: error.message }, { status: 500 }) };
  if (roleRow?.role !== "admin") return { ok: false as const, response: NextResponse.json({ error: "Admin access required" }, { status: 403 }) };
  return { ok: true as const, supabase, actorEmail };
}
