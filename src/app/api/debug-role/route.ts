import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "no session" });

  const { data: role, error } = await supabase
    .from("user_roles")
    .select("*")
    .eq("email", session.user.email ?? "")
    .single();

  return NextResponse.json({ 
    email: session.user.email,
    role,
    error: error?.message 
  });
}
