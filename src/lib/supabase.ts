import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Single client for all use — plain createClient avoids SSR/implicit flow reload issues
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Alias for server-side use
export const createServerClient = () => createClient(supabaseUrl, supabaseAnonKey);
