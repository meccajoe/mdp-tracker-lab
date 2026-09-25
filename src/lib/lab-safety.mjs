export const LAB_PROJECT_REF = "gkvaeqlqrthztobxitvn";
export const LAB_SUPABASE_URL = "https://" + LAB_PROJECT_REF + ".supabase.co";

// Configuration checks, not a substitute for isolated credentials and accounts.
export function assertLabEnvironment(env) {
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]) {
    const value = env[name];
    if (name === "SUPABASE_URL" && !value) continue;
    if (value !== LAB_SUPABASE_URL) throw new Error("Lab requires its own Supabase URL: " + name);
  }
  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    if (/^(HUBSPOT_|QBO_|TSHEETS_|BILLCOM_|BILL_COM_|MONDAY_|SLACK_|MDP_SLACK_|ADA_GOOGLE_|ADA_LLM_|ANTHROPIC_|OPENAI_|GOOGLE_SERVICE_ACCOUNT)/.test(name)) {
      throw new Error("External integration configuration is disabled in the lab: " + name);
    }
  }
  for (const name of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const key = env[name];
    if (!key) throw new Error("Missing lab credential: " + name);
    // Legacy keys carry a project ref. Modern keys are opaque and must be
    // provisioned from the lab project; their ownership cannot be decoded.
    if (key.startsWith("eyJ")) {
      let claims;
      try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); }
      catch { throw new Error("Invalid legacy credential: " + name); }
      if (claims.ref !== LAB_PROJECT_REF) throw new Error("Wrong project credential: " + name);
      const role = name.startsWith("NEXT_PUBLIC_") ? "anon" : "service_role";
      if (claims.role !== role) throw new Error("Wrong credential role: " + name);
    } else if (!key.startsWith(name.startsWith("NEXT_PUBLIC_") ? "sb_publishable_" : "sb_secret_")) {
      throw new Error("Unsupported lab credential format: " + name);
    }
  }
}

export function isLabBlockedPath(pathname) {
  let path;
  try { path = decodeURIComponent(pathname).toLowerCase(); }
  catch { return true; }
  if (!path.startsWith("/api/")) return false;
  return /^\/api\/(cron|slack|webhooks|billcom|qbo|tsheets|monday)(\/|$)/.test(path)
    || /\/(sync[^/]*|test-delivery|bill-budget|sheet|generate|revise|intelligence|analyze|initial-quote|messages|copilot)(\/|$)/.test(path)
    || /^\/api\/reports\/wip\/live\/?$/.test(path);
}
