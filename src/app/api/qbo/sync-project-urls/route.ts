import { execSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function runSecret(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: "/bin/zsh" }).trim();
}

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function POST() {
  try {
    const clientId = runSecret(`source ~/.config/archie/credentials/1password.env && op item get "QBO - Mecca HubSpot Integration" --vault Archie --fields "client ID" --reveal`);
    const clientSecret = runSecret(`source ~/.config/archie/credentials/1password.env && op item get "QBO - Mecca HubSpot Integration" --vault Archie --fields "client secret" --reveal`);
    const refreshToken = runSecret(`source ~/.config/archie/credentials/1password.env && op item get "QBO - Mecca HubSpot Integration" --vault Archie --fields "refresh_token" --reveal`);

    const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenRes = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST",
      headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    });
    const { access_token } = await tokenRes.json() as { access_token: string };

    // Fetch all QBO sub-customers (paginated)
    const allCustomers = new Map<string, string>(); // job_number -> qbo_customer_id
    let startPosition = 1;
    while (true) {
      const url = `https://quickbooks.api.intuit.com/v3/company/9130350693918016/query?query=${encodeURIComponent(`SELECT Id, DisplayName FROM Customer WHERE Job = true STARTPOSITION ${startPosition} MAXRESULTS 1000`)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}`, Accept: "application/json" }, cache: "no-store" });
      const data = await res.json() as { QueryResponse?: { Customer?: Array<{ Id: string; DisplayName: string }> } };
      const customers = data.QueryResponse?.Customer ?? [];
      for (const c of customers) {
        const match = c.DisplayName.match(/^(\d{4,6})\b/);
        if (match) allCustomers.set(match[1], c.Id);
      }
      if (customers.length < 1000) break;
      startPosition += 1000;
      await sleep(300);
    }

    const supabase = getSupabaseAdmin();
    const { data: projects } = await supabase.from("projects").select("id, job_number, qbo_project_id, qbo_project_url");
    if (!projects) return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });

    let updated = 0;
    for (const proj of projects) {
      const jobNum = String(proj.job_number);
      const qboId = allCustomers.get(jobNum);
      if (!qboId) continue;
      if (proj.qbo_project_id && proj.qbo_project_url) continue; // already set

      const qboUrl = `https://app.qbo.intuit.com/app/customerdetail?nameId=${qboId}`;
      await supabase.from("projects").update({
        qbo_project_id: proj.qbo_project_id || qboId,
        qbo_project_url: proj.qbo_project_url || qboUrl,
      }).eq("id", proj.id);
      updated++;
    }

    return NextResponse.json({ updated, total: projects.length, qboCustomers: allCustomers.size });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
