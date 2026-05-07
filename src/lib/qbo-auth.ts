import { execSync } from "child_process";

const QBO_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const OP_ITEM = "QBO - Mecca HubSpot Integration";
const OP_VAULT = "Archie";
const OP_CREDS_ENV = "source ~/.config/archie/credentials/1password.env";

function opGet(field: string): string {
  const cmd = `${OP_CREDS_ENV} && op item get "${OP_ITEM}" --vault ${OP_VAULT} --fields "${field}" --reveal`;
  return execSync(cmd, { shell: "/bin/zsh" }).toString().trim();
}

function opSet(field: string, value: string): void {
  const cmd = `${OP_CREDS_ENV} && op item edit "${OP_ITEM}" --vault ${OP_VAULT} "${field}=${value}"`;
  execSync(cmd, { shell: "/bin/zsh" });
}

export async function getQboAccessToken(): Promise<string> {
  const clientId = process.env.QBO_CLIENT_ID!;
  const clientSecret = process.env.QBO_CLIENT_SECRET!;

  if (!clientId || !clientSecret) {
    throw new Error("QBO_CLIENT_ID or QBO_CLIENT_SECRET not set in environment");
  }

  // Read refresh token from 1Password — shared source of truth with mecca-qbo
  const refreshToken = opGet("refresh_token");
  if (!refreshToken) {
    throw new Error("QBO refresh token not found in 1Password");
  }

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

  // Rotate refresh token back to 1Password if QBO returned a new one
  if (tokenData.refresh_token && tokenData.refresh_token !== refreshToken) {
    opSet("refresh_token", tokenData.refresh_token);
  }

  return tokenData.access_token;
}
