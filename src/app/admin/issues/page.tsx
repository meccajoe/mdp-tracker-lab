"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { IssueEditDialog, type EditableIssue } from "@/components/issue-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";

type IssueRow = EditableIssue & {
  project_id: string;
  projects: { id: string; name: string | null; client: string | null } | null;
};

export default function IssuesReportPage() {
  const router = useRouter();
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("production_issues")
      .select("*, projects(id, name, client)")
      .order("reported_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(`Could not load issues: ${error.message}`);
    else setIssues((data ?? []) as IssueRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) return router.replace("/");
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("email", session.user.email.toLowerCase()).maybeSingle();
      if (!["admin", "pm", "production"].includes(roleRow?.role ?? "")) return router.replace("/");
      void load();
    }
    void checkAccess();
  }, [load, router]);

  const projects = useMemo(() => Array.from(new Map(issues.map((issue) => [issue.project_id, issue.projects])).entries()).sort(([, a], [, b]) => (a?.name ?? "").localeCompare(b?.name ?? "")), [issues]);
  const visibleIssues = useMemo(() => issues.filter((issue) => {
    if (dateFrom && issue.reported_date < dateFrom) return false;
    if (dateTo && issue.reported_date > dateTo) return false;
    if (projectId && issue.project_id !== projectId) return false;
    if (category && issue.category !== category) return false;
    if (severity && issue.severity !== severity) return false;
    return true;
  }), [category, dateFrom, dateTo, issues, projectId, severity]);

  return <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reports</p><h1 className="text-2xl font-semibold tracking-tight">Production issues</h1><p className="mt-1 text-sm text-muted-foreground">All logged production issues. Filter, review, edit, or remove records.</p></div><Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button></div>
    <section className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Filter label="From"><input className="filter-input" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></Filter>
      <Filter label="To"><input className="filter-input" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></Filter>
      <Filter label="Project"><select className="filter-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map(([id, project]) => <option key={id} value={id}>{id} — {project?.name ?? "Unknown"}</option>)}</select></Filter>
      <Filter label="Category"><select className="filter-input" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All categories</option>{["defect", "rework", "safety", "site", "vendor", "labor", "other"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></Filter>
      <Filter label="Severity"><select className="filter-input" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="">All severities</option>{["low", "medium", "high", "critical"].map((entry) => <option key={entry} value={entry}>{entry}</option>)}</select></Filter>
    </section>
    <p className="text-sm text-muted-foreground">Showing {visibleIssues.length} of {issues.length} issues.</p>
    <section className="overflow-x-auto rounded-xl border border-border bg-card"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Project</th><th className="px-4 py-3">Issue</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Severity</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead><tbody>{loading ? <tr><td className="px-4 py-6 text-muted-foreground" colSpan={7}>Loading issues...</td></tr> : visibleIssues.map((issue) => <tr key={issue.id} className="border-t border-border/70"><td className="whitespace-nowrap px-4 py-3">{issue.reported_date}</td><td className="px-4 py-3"><Link className="font-medium hover:underline" href={`/projects/${issue.project_id}`}>{issue.project_id} — {issue.projects?.name ?? "Unknown"}</Link><p className="text-xs text-muted-foreground">{issue.projects?.client ?? ""}</p></td><td className="px-4 py-3 font-medium">{issue.title}</td><td className="px-4 py-3"><Badge variant="outline">{issue.category}</Badge></td><td className="px-4 py-3 capitalize">{issue.severity}</td><td className="px-4 py-3 capitalize">{issue.status.replace("_", " ")}</td><td className="px-4 py-3"><IssueEditDialog issue={issue} onChanged={() => void load()} /></td></tr>)}</tbody></table>{!loading && !visibleIssues.length && <p className="p-6 text-sm text-muted-foreground">No issues match these filters.</p>}</section>
  </main>;
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) { return <label className="text-sm font-medium">{label}<span className="mt-1 block [&_.filter-input]:w-full [&_.filter-input]:rounded-md [&_.filter-input]:border [&_.filter-input]:border-border [&_.filter-input]:bg-background [&_.filter-input]:px-3 [&_.filter-input]:py-2 [&_.filter-input]:text-sm">{children}</span></label>; }
