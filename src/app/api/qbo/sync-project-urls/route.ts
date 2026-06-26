import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getQboAccessToken } from "@/lib/qbo-auth";
import { buildQboProjectDetailsUrl } from "@/lib/qbo-project-profitability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

interface QboProjectSearchResponse {
  data?: {
    projectManagementProjects?: {
      edges?: Array<{
        node?: {
          id?: string;
          name?: string;
          status?: string;
        };
      }>;
      pageInfo?: {
        hasNextPage?: boolean;
        endCursor?: string | null;
      };
    };
  };
}

async function getQboProjectMap(accessToken: string): Promise<Map<string, { id: string; name: string }>> {
  const map = new Map<string, { id: string; name: string }>();
  const query = 'query projectManagementProjects($first: PositiveInt!, $after: String, $filter: ProjectManagement_ProjectFilter!, $orderBy: [ProjectManagement_OrderBy!]) { projectManagementProjects(first: $first, after: $after, filter: $filter, orderBy: $orderBy) { edges { node { id name status } } pageInfo { hasNextPage endCursor } } }';
  let cursor: string | null = null;

  do {
    const variables: { first: number; filter: Record<string, never>; orderBy: string[]; after?: string } = {
      first: 100,
      filter: {},
      orderBy: ['DUE_DATE_DESC'],
    };
    if (cursor) variables.after = cursor;

    const res = await fetch('https://qb.api.intuit.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`QBO project search failed (${res.status})`);
    }

    const data = (await res.json()) as QboProjectSearchResponse;
    const result = data.data?.projectManagementProjects;

    for (const edge of result?.edges ?? []) {
      const node = edge.node;
      const name = node?.name?.trim();
      const id = node?.id?.trim();
      if (!name || !id) continue;
      const match = name.match(/^(\d{4,6})\b/);
      if (!match) continue;
      map.set(match[1], { id, name });
    }

    cursor = result?.pageInfo?.hasNextPage ? result.pageInfo.endCursor ?? null : null;
  } while (cursor);

  return map;
}

export async function POST() {
  try {
    const accessToken = await getQboAccessToken();
    const qboProjects = await getQboProjectMap(accessToken);

    const supabase = getSupabaseAdmin();
    const { data: projects } = await supabase.from("projects").select("id, job_number, qbo_project_id, qbo_project_url");
    if (!projects) return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });

    let updated = 0;
    for (const proj of projects) {
      const jobNum = String(proj.job_number ?? '').trim();
      if (!jobNum) continue;
      const found = qboProjects.get(jobNum);
      if (!found) continue;

      const canonicalUrl = buildQboProjectDetailsUrl(found.id);
      const needsUpdate = proj.qbo_project_id !== found.id || proj.qbo_project_url !== canonicalUrl;
      if (!needsUpdate) continue;

      const { error } = await supabase.from("projects").update({
        qbo_project_id: found.id,
        qbo_project_url: canonicalUrl,
      }).eq("id", proj.id);
      if (!error) updated++;
    }

    return NextResponse.json({ updated, total: projects.length, qboProjects: qboProjects.size });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
