import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Alias for server-side use
export const createServerClient = () => createClient(supabaseUrl, supabaseAnonKey);
