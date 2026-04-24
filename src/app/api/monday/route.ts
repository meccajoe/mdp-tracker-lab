import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MONDAY_API_KEY = process.env.MONDAY_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function mondayQuery(query: string) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Authorization": MONDAY_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  return res.json();
}

// GET /api/monday?jobNumber=26099&projectId=xxx
// Looks up Monday board by job number, caches result in Supabase
export async function GET(req: NextRequest) {
  const jobNumber = req.nextUrl.searchParams.get("jobNumber");
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!jobNumber) return NextResponse.json({ error: "jobNumber required" }, { status: 400 });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Check cache first
  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("monday_board_id, monday_board_url")
      .eq("id", projectId)
      .single();
    if (data?.monday_board_id) {
      return NextResponse.json({ boardId: data.monday_board_id, boardUrl: data.monday_board_url });
    }
  }

  // Search Monday boards for job number
  const data = await mondayQuery(`{
    boards(limit: 200) {
      id
      name
      url
    }
  }`);

  const boards: { id: string; name: string; url: string }[] = data?.data?.boards || [];

  // Match board name starting with job number
  const match = boards.find((b) => {
    const normalized = b.name.replace(/[\s\-_]+/g, "").toLowerCase();
    return normalized.startsWith(jobNumber.replace(/[\s\-_]+/g, "").toLowerCase());
  });

  if (!match) {
    return NextResponse.json({ boardId: null, boardUrl: null });
  }

  // Cache in Supabase
  if (projectId) {
    await supabase
      .from("projects")
      .update({ monday_board_id: match.id, monday_board_url: match.url })
      .eq("id", projectId);
  }

  return NextResponse.json({ boardId: match.id, boardUrl: match.url });
}
