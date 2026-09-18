import { execSync } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizeLaborServiceItem } from "@/lib/labor-service-item";
import { resolveLaborRateForSync } from "@/lib/labor-rate-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const TSHEETS_BASE = "https://rest.tsheets.com/api/v1";
const PAGE_SIZE = 200;
const SERVICE_ITEM_CUSTOMFIELD_ID = "957306";

// ── helpers ──────────────────────────────────────────────────────────────────

function runSecret(cmd: string): string {
  return execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: "/bin/zsh",
  }).trim();
}

function getTsheetsToken(): string {
  return runSecret(
    `source ~/.config/archie/credentials/1password.env && ` +
    `op item get "QBO Time - MDP Project Tracker" --vault Archie --fields credential --reveal`
  );
}

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function tsFetch(path: string, token: string, retries = 5): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(`${TSHEETS_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 429) {
      const backoff = Math.min(1000 * Math.pow(2, i), 30000);
      console.warn(`TSheets rate limit, backing off ${backoff}ms`);
      await sleep(backoff);
      continue;
    }
    return res;
  }
  throw new Error("TSheets persistent rate limit");
}

// ── jobcode map ───────────────────────────────────────────────────────────────
// Returns map of jobcode_id → job_number (e.g. "26042")

async function buildJobcodeMap(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let page = 1;

  while (true) {
    const res = await tsFetch(
      `/jobcodes?active=both&type=all&limit=${PAGE_SIZE}&page=${page}`,
      token
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`TSheets jobcodes failed (${res.status}): ${t}`);
    }
    const data = (await res.json()) as {
      results: { jobcodes: Record<string, { name: string; parent_id: number }> };
      more: boolean;
    };
    const jcs = data.results?.jobcodes ?? {};
    const entries = Object.entries(jcs);

    for (const [jid, jc] of entries) {
      // Job number is the leading digits in the name, e.g. "26042-Unicorns..." or "25173 - Dallas..."
      const match = jc.name.match(/^(\d{4,6})\b/);
      if (match) {
        map.set(jid, match[1]);
      }
    }

    // Use TSheets 'more' flag — not entry count — to determine if there are more pages
    if (!data.more) break;
    page++;
    await sleep(200);
  }

  return map;
}

// ── timesheets ────────────────────────────────────────────────────────────────

interface TsTimesheet {
  id: number;
  user_id: number;
  jobcode_id: number;
  date: string;
  duration: number; // seconds
  type: "regular" | "overtime" | "pto" | string;
  state: string;
  customfields?: Record<string, string | null | undefined>;
}

interface TsSupplemental {
  users?: Record<string, { display_name: string; pay_rate?: number; salaried?: boolean }>;
  jobcodes?: Record<string, { name: string }>;
}

// Fetch all active users and return a map of user_id → { name, pay_rate, salaried }
async function fetchUserRates(token: string): Promise<Map<string, { name: string; pay_rate: number; salaried: boolean }>> {
  const map = new Map<string, { name: string; pay_rate: number; salaried: boolean }>();
  let page = 1;
  while (true) {
    const res = await tsFetch(`/users?active=both&limit=200&page=${page}`, token);
    if (!res.ok) break;
    const data = (await res.json()) as {
      results: { users: Record<string, { id: number; display_name: string; pay_rate: number; salaried: boolean }> };
      more: boolean;
    };
    for (const u of Object.values(data.results?.users ?? {})) {
      map.set(String(u.id), {
        name: u.display_name,
        pay_rate: u.pay_rate ?? 0,
        salaried: u.salaried ?? false,
      });
    }
    if (!data.more) break;
    page++;
    await sleep(200);
  }
  return map;
}

async function fetchTimesheets(
  token: string,
  jobcodeIds: string[],
  startDate: string,
  endDate: string
): Promise<{ sheets: TsTimesheet[]; users: Record<string, string> }> {
  const allSheets: TsTimesheet[] = [];
  const allUsers: Record<string, string> = {};

  // TSheets allows up to 50 jobcode IDs per request
  const chunkSize = 50;
  for (let i = 0; i < jobcodeIds.length; i += chunkSize) {
    const chunk = jobcodeIds.slice(i, i + chunkSize);
    let page = 1;

    while (true) {
      const params = new URLSearchParams({
        jobcode_ids: chunk.join(","),
        start_date: startDate,
        end_date: endDate,
        limit: String(PAGE_SIZE),
        page: String(page),
        supplemental_data: "yes",
      });

      const res = await tsFetch(`/timesheets?${params}`, token);
      if (!res.ok) {
        const t = await res.text();
        console.error(`TSheets timesheets failed (${res.status}): ${t.slice(0, 200)}`);
        break;
      }

      const data = (await res.json()) as {
        results: { timesheets: Record<string, TsTimesheet> };
        supplemental_data?: TsSupplemental;
        more: boolean;
      };

      const sheets = Object.values(data.results?.timesheets ?? {});
      allSheets.push(...sheets);

      // Merge user names from supplemental
      const sup = data.supplemental_data ?? {};
      for (const [uid, u] of Object.entries(sup.users ?? {})) {
        allUsers[uid] = u.display_name;
      }

      // Use TSheets 'more' flag for reliable pagination
      if (!data.more) break;
      page++;
      await sleep(300);
    }

    if (i + chunkSize < jobcodeIds.length) await sleep(300);
  }

  return { sheets: allSheets, users: allUsers };
}

// ── main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as {
      projectId?: string;
      startDate?: string;
      endDate?: string;
    };

    const supabase = getSupabaseAdmin();
    const token = getTsheetsToken();

    // 1. Fetch all tracker projects
    let projectsQuery = supabase
      .from("projects")
      .select("id, job_number, status")
      .not("job_number", "is", null);

    if (body.projectId) {
      projectsQuery = projectsQuery.eq("id", body.projectId);
    }

    const { data: projects, error: projErr } = await projectsQuery;
    if (projErr || !projects?.length) {
      return NextResponse.json({ error: projErr?.message ?? "No projects found" }, { status: 500 });
    }

    // 2. Fetch user pay rates from TSheets
    const userRates = await fetchUserRates(token);

    // 3. Build jobcode map from TSheets
    const jobcodeMap = await buildJobcodeMap(token);
    // Invert: job_number → jobcode_id
    const jobToJcId = new Map<string, string>();
    for (const [jcId, jobNum] of jobcodeMap) {
      jobToJcId.set(jobNum, jcId);
    }

    // 3. Match tracker projects → TSheets jobcode IDs
    const matchedProjects: Array<{ projectId: string; jobNumber: string; jcId: string }> = [];
    const unmatched: string[] = [];

    for (const p of projects) {
      const jobNum = String(p.job_number);
      const jcId = jobToJcId.get(jobNum);
      if (jcId) {
        matchedProjects.push({ projectId: p.id, jobNumber: jobNum, jcId });
      } else {
        unmatched.push(jobNum);
      }
    }

    if (matchedProjects.length === 0) {
      return NextResponse.json({
        synced: 0,
        matched: 0,
        unmatched,
        message: "No projects matched TSheets jobcodes",
      });
    }

    // 4. Fetch timesheets for all matched projects
    const startDate = body.startDate ?? "2024-01-01";
    const endDate = body.endDate ?? new Date().toISOString().split("T")[0];
    const jcIds = matchedProjects.map((m) => m.jcId);
    const jcIdToProject = new Map(matchedProjects.map((m) => [m.jcId, m.projectId]));

    const { sheets, users } = await fetchTimesheets(token, jcIds, startDate, endDate);

    // 5. Transform and upsert
    const rows = sheets
      .filter((s) => s.type === "regular" || s.type === "overtime")
      .map((s) => {
        const projectId = jcIdToProject.get(String(s.jobcode_id));
        if (!projectId) return null;
        const totalHours = s.duration / 3600;
        const userRate = userRates.get(String(s.user_id));
        const verifiedRate = Number(userRate?.pay_rate) > 0 ? Number(userRate?.pay_rate) : null;
        const rateVerifiedAt = new Date().toISOString();
        return {
          project_id: projectId,
          qbo_time_user_id: s.user_id,
          qbo_time_salaried: userRate?.salaried ?? null,
          employee_name: userRate?.name ?? users[String(s.user_id)] ?? `User ${s.user_id}`,
          date: s.date,
          reg_hours: s.type === "regular" ? totalHours : 0,
          ot_hours: s.type === "overtime" ? totalHours : 0,
          hourly_rate: verifiedRate,
          rate_source: verifiedRate === null ? null : "qbo_time_users",
          rate_verified_at: verifiedRate === null ? null : rateVerifiedAt,
          service_item: normalizeLaborServiceItem(s.customfields?.[SERVICE_ITEM_CUSTOMFIELD_ID]),
          qbo_entry_id: `ts_${s.id}`, // prefix to distinguish from QBO TimeActivity IDs
          synced_at: new Date().toISOString(),
        };
      })
      .filter(Boolean) as Array<{
        project_id: string;
        qbo_time_user_id: number;
        qbo_time_salaried: boolean | null;
        employee_name: string;
        date: string;
        reg_hours: number;
        ot_hours: number;
        hourly_rate: number | null;
        rate_source: string | null;
        rate_verified_at: string | null;
        service_item: string | null;
        qbo_entry_id: string;
        synced_at: string;
      }>;

    let totalSynced = 0;
    for (let i = 0; i < rows.length; i += 100) {
      const batch = rows.slice(i, i + 100);
      const entryIds = batch.map((row) => row.qbo_entry_id);
      const { data: existingRows, error: existingError } = await supabase
        .from("qbo_labor_entries")
        .select("qbo_entry_id,hourly_rate,rate_source,rate_verified_at")
        .in("qbo_entry_id", entryIds);
      if (existingError) throw new Error(`Existing rate lookup failed: ${existingError.message}`);
      const existingByEntryId = new Map((existingRows ?? []).map((row) => [row.qbo_entry_id, row]));
      const resolvedBatch = batch.map((row) => ({
        ...row,
        ...resolveLaborRateForSync(existingByEntryId.get(row.qbo_entry_id), {
          hourly_rate: row.hourly_rate,
          rate_source: row.rate_source,
          rate_verified_at: row.rate_verified_at,
        }),
      }));
      const { error: upsertErr } = await supabase
        .from("qbo_labor_entries")
        .upsert(resolvedBatch, { onConflict: "qbo_entry_id" });
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
      totalSynced += resolvedBatch.length;
    }

    return NextResponse.json({
      synced: totalSynced,
      matched: matchedProjects.length,
      unmatched,
      startDate,
      endDate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("TSheets sync error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
