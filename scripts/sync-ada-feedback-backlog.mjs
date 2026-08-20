#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

function loadEnvFile(text) {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || process.env[key]) continue;
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

const projectRoot = resolve(new URL("..", import.meta.url).pathname);
try { loadEnvFile(await readFile(resolve(projectRoot, ".env.local"), "utf8")); } catch { /* runtime env may already provide configuration */ }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputPath = process.env.ADA_FEEDBACK_BACKLOG_PATH || "/Users/archie/.openclaw/workspace/backlogs/ada-feedback.md";
if (!supabaseUrl || !serviceKey) throw new Error("Ada feedback sync is missing Supabase runtime configuration.");

const params = new URLSearchParams({
  select: "id,workspace_id,submitted_by_email,category,message,page_path,status,created_at,workspace:ada_quote_workspaces(title,client_name)",
  status: "neq.resolved",
  order: "created_at.asc",
});
const response = await fetch(`${supabaseUrl}/rest/v1/ada_feedback?${params}`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
if (!response.ok) throw new Error(`Ada feedback query failed with HTTP ${response.status}.`);
const items = await response.json();

const labels = { bug: "Bug", idea: "Idea", confusing: "Confusing", other: "Other" };
const groups = ["new", "triaged", "planned"];
const lines = [
  "# Ada Feedback Backlog",
  "",
  "Mirrored automatically from `public.ada_feedback`. Update status in the database to `triaged`, `planned`, or `resolved`; resolved items disappear from this active backlog.",
  "",
  `Active feedback: **${items.length}**`,
  "",
];
for (const status of groups) {
  const group = items.filter((item) => item.status === status);
  lines.push(`## ${status[0].toUpperCase()}${status.slice(1)} (${group.length})`, "");
  if (!group.length) {
    lines.push("_None._", "");
    continue;
  }
  for (const item of group) {
    const workspace = Array.isArray(item.workspace) ? item.workspace[0] : item.workspace;
    const title = clean(workspace?.title) || "Ada library";
    lines.push(
      `- [ ] **${labels[item.category] ?? "Feedback"}** — ${clean(item.message)}`,
      `  - Submitted: ${item.created_at} by ${clean(item.submitted_by_email)}`,
      `  - Context: ${title}${item.workspace_id ? ` · workspace \`${item.workspace_id}\`` : ""} · \`${clean(item.page_path)}\``,
      `  - Feedback ID: \`${item.id}\``,
      "",
    );
  }
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${lines.join("\n").trim()}\n`);

const stable = items.map((item) => ({ id: item.id, status: item.status, category: item.category, message: clean(item.message), createdAt: item.created_at }));
console.log(JSON.stringify({ count: stable.length, backlogPath: outputPath, items: stable }));
