"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

type ProjectOption = {
  id: string;
  name: string | null;
  client: string | null;
  pm: string | null;
  status: string | null;
};

const CATEGORIES = [
  ["defect", "Defect"],
  ["rework", "Rework"],
  ["safety", "Safety"],
  ["site", "Site / install"],
  ["vendor", "Vendor"],
  ["labor", "Labor"],
  ["other", "Other"],
] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export function IssueQuickLogDialog({ collapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("defect");
  const [severity, setSeverity] = useState("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [ownerLabel, setOwnerLabel] = useState("");
  const [linkedVendor, setLinkedVendor] = useState("");
  const [costImpact, setCostImpact] = useState("");
  const [scheduleImpactDays, setScheduleImpactDays] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || projects.length > 0) return;
    supabase
      .from("project_summary")
      .select("id, name, client, pm, status")
      .in("status", ["Active", "Pending", "On Hold"])
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (error) toast.error("Could not load projects for issue logging.");
        else setProjects((data ?? []) as ProjectOption[]);
      });
  }, [open, projects.length]);

  const selectedProject = projects.find((project) => String(project.id) === projectId);
  const visibleProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter((project) => [project.id, project.name, project.client, project.pm]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query));
  }, [projectSearch, projects]);

  function selectProject(nextProjectId: string) {
    setProjectId(nextProjectId);
    const project = projects.find((entry) => String(entry.id) === nextProjectId);
    if (project?.pm) setOwnerLabel(project.pm);
  }

  function resetForm() {
    setProjectSearch("");
    setProjectId("");
    setCategory("defect");
    setSeverity("medium");
    setTitle("");
    setDescription("");
    setOwnerLabel("");
    setLinkedVendor("");
    setCostImpact("");
    setScheduleImpactDays("");
  }

  async function submit(keepOpen: boolean) {
    if (!projectId || !title.trim()) {
      toast.error("Choose a project and describe what happened.");
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Authentication required");
      const response = await fetch("/api/production-issues", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + session.access_token,
        },
        body: JSON.stringify({
          projectId,
          category,
          severity,
          title: title.trim(),
          description: description.trim() || undefined,
          ownerLabel: ownerLabel.trim() || undefined,
          linkedVendor: linkedVendor.trim() || undefined,
          costImpact: costImpact === "" ? undefined : Number(costImpact),
          scheduleImpactDays: scheduleImpactDays === "" ? undefined : Number(scheduleImpactDays),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error ?? "Issue could not be logged.");
      toast.success(`Issue logged for ${selectedProject?.name ?? "project"}.`);
      resetForm();
      if (!keepOpen) setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Issue could not be logged.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        title={collapsed ? "Log issue" : undefined}
        className={`flex w-full items-center gap-3 rounded-lg bg-amber-500 px-2.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-600 ${collapsed ? "justify-center" : ""}`}
      >
        <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" /></svg>
        {!collapsed && <span>Log issue</span>}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Log issue</DialogTitle>
          <DialogDescription>Capture the problem now. Details, notes, photos, and resolution can follow.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="block text-sm font-medium">
            Project <span className="text-destructive">*</span>
            <input value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search active projects" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
            <select value={projectId} onChange={(event) => selectProject(event.target.value)} className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" required>
              <option value="">Choose project</option>
              {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.name || "Untitled"}{project.client ? ` (${project.client})` : ""}</option>)}
            </select>
          </label>

          <label className="block text-sm font-medium">
            What happened? <span className="text-destructive">*</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="One-sentence issue summary" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" required />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">Category
              <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">Severity
              <select value={severity} onChange={(event) => setSeverity(event.target.value)} className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
                {SEVERITIES.map((value) => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}
              </select>
            </label>
          </div>

          <details className="rounded-md border border-border px-3 py-2">
            <summary className="cursor-pointer text-sm font-medium">Add impact or context</summary>
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-medium">Details
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder="What was observed, what is needed, and any relevant context" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Assigned to
                  <input value={ownerLabel} onChange={(event) => setOwnerLabel(event.target.value)} placeholder="Defaults to project PM" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Vendor
                  <input value={linkedVendor} onChange={(event) => setLinkedVendor(event.target.value)} placeholder="Optional" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">Cost impact ($)
                  <input value={costImpact} onChange={(event) => setCostImpact(event.target.value)} type="number" min="0" step="1" placeholder="Optional" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </label>
                <label className="block text-sm font-medium">Schedule impact (days)
                  <input value={scheduleImpactDays} onChange={(event) => setScheduleImpactDays(event.target.value)} type="number" min="0" step="1" placeholder="Optional" className="mt-1.5 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" />
                </label>
              </div>
            </div>
          </details>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => submit(true)} disabled={saving}>Log & add another</Button>
          <Button type="button" onClick={() => submit(false)} disabled={saving}>{saving ? "Logging..." : "Log issue"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
