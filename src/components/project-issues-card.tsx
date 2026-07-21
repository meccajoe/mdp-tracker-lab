"use client";

import { useCallback, useEffect, useState } from "react";

import { IssueQuickLogDialog } from "@/components/issue-quick-log-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/lib/supabase";

type ProjectIssue = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  owner_label: string | null;
  reported_date: string;
  schedule_impact_days: number | null;
  cost_impact: number | null;
};

type ProjectIssuesCardProps = {
  project: { id: string; name: string | null; pm: string | null };
};

export function ProjectIssuesCard({ project }: ProjectIssuesCardProps) {
  const [issues, setIssues] = useState<ProjectIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [canLogIssues, setCanLogIssues] = useState(false);

  const loadIssues = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("production_issues")
      .select("id, title, category, severity, status, owner_label, reported_date, schedule_impact_days, cost_impact")
      .eq("project_id", project.id)
      .order("reported_date", { ascending: false })
      .order("created_at", { ascending: false });
    setIssues((data ?? []) as ProjectIssue[]);
    setLoading(false);
  }, [project.id]);

  useEffect(() => {
    void loadIssues();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user?.email) return;
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("email", session.user.email.toLowerCase()).maybeSingle();
      setCanLogIssues(["admin", "pm", "production"].includes(roleRow?.role ?? ""));
    });
  }, [loadIssues]);

  const openIssues = issues.filter((issue) => !["resolved", "closed"].includes(issue.status));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Production issues</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">{openIssues.length} open of {issues.length} logged for this project.</p>
        </div>
        {canLogIssues && <IssueQuickLogDialog compact project={project} onLogged={() => void loadIssues()} />}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p className="text-sm text-muted-foreground">Loading issues...</p> : !issues.length ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">No issues logged for this project yet.</p>
        ) : issues.map((issue) => (
          <div key={issue.id} className="flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{issue.title}</p><Badge variant="outline">{issue.category}</Badge><SeverityBadge severity={issue.severity} /><StatusBadge status={issue.status} /></div>
              <p className="mt-1 text-xs text-muted-foreground">Logged {issue.reported_date}{issue.owner_label ? ` · Owner: ${issue.owner_label}` : ""}</p>
            </div>
            {(issue.schedule_impact_days || issue.cost_impact) && <p className="shrink-0 text-xs text-muted-foreground">{issue.schedule_impact_days ? `${issue.schedule_impact_days} day impact` : ""}{issue.schedule_impact_days && issue.cost_impact ? " · " : ""}{issue.cost_impact ? `$${issue.cost_impact.toLocaleString()} impact` : ""}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const className = severity === "critical" ? "border-red-300 bg-red-50 text-red-700" : severity === "high" ? "border-orange-300 bg-orange-50 text-orange-700" : severity === "medium" ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-300 bg-slate-50 text-slate-700";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${className}`}>{severity}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const className = status === "open" ? "border-blue-300 bg-blue-50 text-blue-700" : status === "in_progress" ? "border-violet-300 bg-violet-50 text-violet-700" : "border-emerald-300 bg-emerald-50 text-emerald-700";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${className}`}>{status.replace("_", " ")}</span>;
}
