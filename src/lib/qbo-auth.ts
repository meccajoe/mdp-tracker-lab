import { createClient } from "@supabase/supabase-js";

const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getQboAccessToken(): Promise<string> {
  const clientId = process.env.QBO_CLIENT_ID!;
  const clientSecret = process.env.QBO_CLIENT_SECRET!;

  if (!clientId || !clientSecret) {
    throw new Error("QBO_CLIENT_ID or QBO_CLIENT_SECRET not set in environment");
  }

  // Read current refresh token from Supabase
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "qbo_refresh_token")
    .single();

  if (error || !data?.value) {
    throw new Error("QBO refresh token not found in app_config");
  }

  const refreshToken = data.value;
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(QBO_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`QBO token refresh failed (${response.status})`);
  }

  const tokenData = (await response.json()) as { access_token?: string; refresh_token?: string };

  if (!tokenData.access_token) {
    throw new Error("No access token returned from QBO");
  }

  // Rotate refresh token if QBO returned a new one
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    await supabase
      .from("app_config")
      .update({ value: tokenData.refresh_token, updated_at: new Date().toISOString() })
      .eq("key", "qbo_refresh_token");
  }

  return tokenData.access_token;
}
