"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchProjectLookup, type ProjectLookupResult } from "@/lib/project-lookups";
import { Project, PM_OPTIONS, PM_NAMES } from "@/lib/types";
import { BUDGET_FIELDS, formatCurrency } from "@/lib/constants";
import { ProjectLookupStatus } from "@/components/project-lookup-status";
import { Button } from "@/components/ui/button";

type EditableProject = Project & { _isNew?: boolean };

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Completed: "bg-red-500/15 text-red-700 dark:text-red-400",
  "On Hold": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS["On Hold"]}`}
    >
      {status}
    </span>
  );
}

function FormField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 transition-colors";
const selectClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer transition-colors";

export default function DataEntryPage() {
  const [projects, setProjects] = useState<EditableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterPM, setFilterPM] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<ProjectLookupResult | null>(null);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [actualsLoading, setActualsLoading] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user?.email) return;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("email", session.user.email)
        .single();
      setIsAdmin(data?.role === "admin");
    }
    checkAccess();
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .order("id", { ascending: false });
    if (error) {
      toast.error("Failed to load projects");
    } else {
      setProjects(data as EditableProject[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  async function openEdit(project: EditableProject) {
    setExpandedId(project.id);
    setDeleting(null);
    setFormData({
      id: project.id,
      name: project.name ?? "",
      client: project.client ?? "",
      pm: project.pm ?? "",
      status: project.status ?? "Active",
      job_number: project.job_number ?? "",
      close_date: project.close_date ?? "",
      contract_amount: project.contract_amount ?? "",
      hubspot_deal_id: project.hubspot_deal_id ?? null,
      hubspot_deal_url: project.hubspot_deal_url ?? null,
      qbo_project_id: project.qbo_project_id ?? null,
      qbo_project_url: project.qbo_project_url ?? null,
      budget_hrs: project.budget_hrs ?? "",
      budget_design: project.budget_design ?? "",
      budget_pm: project.budget_pm ?? "",
      budget_shipping: project.budget_shipping ?? "",
      budget_id_labor: project.budget_id_labor ?? "",
      budget_travel: project.budget_travel ?? "",
      budget_props: project.budget_props ?? "",
      budget_equipment: project.budget_equipment ?? "",
      budget_flooring: project.budget_flooring ?? "",
      notes: project.notes ?? "",
      _isNew: project._isNew ?? false,
    });
    setLookupResult(null);
    setActuals({});

    if (!project._isNew) {
      setActualsLoading(true);
      const { data } = await supabase
        .from("project_actuals")
        .select("category, manual_amount")
        .eq("project_id", project.id);
      const map: Record<string, string> = {};
      if (data) {
        data.forEach((r: { category: string; manual_amount: number | null }) => {
          if (r.manual_amount != null) map[r.category] = String(r.manual_amount);
        });
      }
      const { data: laborData } = await supabase
        .from("labor_entries")
        .select("hours")
        .eq("project_id", project.id);
      const totalHrs =
        laborData?.reduce(
          (sum: number, e: { hours: number }) => sum + (e.hours || 0),
          0
        ) ?? 0;
      if (totalHrs > 0) map["labor_hours_used"] = String(totalHrs);
      setActuals(map);
      setActualsLoading(false);
    }
  }

  function openNewProject() {
    const tempId = `__NEW__`;
    // Remove any previous unsaved new project
    setProjects((prev) => prev.filter((p) => !p._isNew));
    const blank: EditableProject = {
      id: tempId,
      name: "",
      client: "",
      pm: "",
      status: "Active",
      job_number: null,
      close_date: null,
      contract_amount: null,
      hubspot_deal_id: null,
      hubspot_deal_url: null,
      qbo_project_id: null,
      qbo_project_url: null,
      budget_hrs: null,
      budget_design: null,
      budget_pm: null,
      budget_shipping: null,
      budget_id_labor: null,
      budget_travel: null,
      budget_props: null,
      budget_equipment: null,
      budget_flooring: null,
      notes: null,
      project_type: null,
      created_at: "",
      updated_at: "",
      _isNew: true,
    };
    setProjects((prev) => [blank, ...prev]);
    setExpandedId(tempId);
    setDeleting(null);
    setFormData({
      id: "",
      name: "",
      client: "",
      pm: "",
      status: "Active",
      job_number: "",
      close_date: "",
      contract_amount: "",
      hubspot_deal_id: null,
      hubspot_deal_url: null,
      qbo_project_id: null,
      qbo_project_url: null,
      budget_hrs: "",
      budget_design: "",
      budget_pm: "",
      budget_shipping: "",
      budget_id_labor: "",
      budget_travel: "",
      budget_props: "",
      budget_equipment: "",
      budget_flooring: "",
      notes: "",
      _isNew: true,
    });
    setLookupResult(null);
    setActuals({});
    setActualsLoading(false);
  }

  function cancelEdit() {
    // Remove unsaved new projects
    setProjects((prev) => prev.filter((p) => !p._isNew));
    setExpandedId(null);
    setFormData({});
    setDeleting(null);
    setLookupResult(null);
    setActuals({});
    setActualsLoading(false);
  }

  function updateForm(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleJobNumberChange(value: string) {
    setLookupResult(null);
    setFormData((prev) => ({
      ...prev,
      job_number: value,
      hubspot_deal_id: null,
      hubspot_deal_url: null,
      qbo_project_id: null,
      qbo_project_url: null,
    }));
  }

  async function handleJobNumberBlur() {
    const trimmed = String(formData.id ?? formData.job_number ?? "").trim();
    if (!trimmed) {
      setLookupResult(null);
      return;
    }

    setLookupLoading(true);
    try {
      const result = await fetchProjectLookup(trimmed);
      setLookupResult(result);
      setFormData((prev) => ({
        ...prev,
        job_number: trimmed,
        hubspot_deal_id: result.hubspot_deal_id,
        hubspot_deal_url: result.hubspot_deal_url,
        qbo_project_id: result.qbo_project_id,
        qbo_project_url: result.qbo_project_url,
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }

  function numVal(v: unknown): number | null {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }

  async function handleSave() {
    const isNew = formData._isNew as boolean;
    const projectId = isNew ? (formData.id as string).trim() : expandedId!;

    if (isNew && !projectId) {
      toast.error("Job # is required");
      return;
    }
    if (!(formData.name as string).trim()) {
      toast.error("Project Name is required");
      return;
    }

    setSaving(true);

    const payload: Record<string, unknown> = {
      id: projectId,
      name: (formData.name as string).trim(),
      client: (formData.client as string).trim(),
      pm: formData.pm as string,
      status: formData.status as string,
      job_number: (formData.job_number as string).trim() || null,
      close_date: (formData.close_date as string) || null,
      contract_amount: numVal(formData.contract_amount),
      hubspot_deal_id: formData.hubspot_deal_id ?? null,
      hubspot_deal_url: formData.hubspot_deal_url ?? null,
      qbo_project_id: formData.qbo_project_id ?? null,
      qbo_project_url: formData.qbo_project_url ?? null,
      budget_hrs: numVal(formData.budget_hrs),
      budget_design: numVal(formData.budget_design),
      budget_pm: numVal(formData.budget_pm),
      budget_shipping: numVal(formData.budget_shipping),
      budget_id_labor: numVal(formData.budget_id_labor),
      budget_travel: numVal(formData.budget_travel),
      budget_props: numVal(formData.budget_props),
      budget_equipment: numVal(formData.budget_equipment),
      budget_flooring: numVal(formData.budget_flooring),
      notes: (formData.notes as string).trim() || null,
    };

    if (isNew) {
      const { error } = await supabase.from("projects").insert(payload);
      if (error) {
        toast.error("Failed to create project: " + error.message);
        setSaving(false);
        return;
      }
      toast.success(`Created project ${projectId}`);
    } else {
      const { id: _id, ...updatePayload } = payload;
      const { error } = await supabase
        .from("projects")
        .update(updatePayload)
        .eq("id", projectId);
      if (error) {
        toast.error("Failed to save: " + error.message);
        setSaving(false);
        return;
      }
      toast.success(`Saved ${projectId}`);
    }

    // Save actuals — use field.label as key to match project details page
    for (const [category, amountStr] of Object.entries(actuals)) {
      if (category === "labor_hours_used") continue;
      const amount = amountStr === "" ? null : Number(amountStr);
      if (amount !== null) {
        await supabase.from("project_actuals").upsert(
          {
            project_id: projectId,
            category,
            manual_amount: amount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "project_id,category" }
        );
      }
    }

    // Save labor hours as a labor_entry row
    const laborHrsStr = actuals["labor_hours_used"];
    if (laborHrsStr && Number(laborHrsStr) > 0) {
      // Delete any existing "Data Entry" manual labor rows for this project, then insert fresh
      await supabase
        .from("labor_entries")
        .delete()
        .eq("project_id", projectId)
        .eq("person", "Data Entry");
      await supabase.from("labor_entries").insert({
        project_id: projectId,
        hours: Number(laborHrsStr),
        labor_type: "Production Labor",
        person: "Data Entry",
        notes: "Manual entry via data entry form",
        date: new Date().toISOString().split("T")[0],
      });
    }

    setExpandedId(null);
    setFormData({});
    setActuals({});
    setSaving(false);
    await fetchProjects();
  }

  async function handleDelete(project: EditableProject) {
    setSaving(true);
    const { error } = await supabase
      .from("projects")
      .delete()
      .eq("id", project.id);
    if (error) {
      toast.error("Failed to delete: " + error.message);
      setSaving(false);
      return;
    }
    toast.success(`Deleted ${project.name || project.id}`);
    setExpandedId(null);
    setFormData({});
    setDeleting(null);
    setSaving(false);
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
  }

  if (!isAdmin && !loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Admin access required</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading projects...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Data Entry Hub</h1>
            <p className="text-sm text-muted-foreground">
              Manage projects, budgets, and details
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={openNewProject}>
            + New Project
          </Button>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-wrap gap-3 mt-4">
          {/* Universal search */}
          <div className="relative flex-1 min-w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search job #, project, client, PM..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>

          {/* PM filter */}
          <select
            value={filterPM}
            onChange={(e) => setFilterPM(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="All">All PMs</option>
            {PM_OPTIONS.map((init) => (
              <option key={init} value={init}>{PM_NAMES[init] ?? init}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>

          {/* Clear filters */}
          {(search || filterPM !== "All" || filterStatus !== "All") && (
            <button
              onClick={() => { setSearch(""); setFilterPM("All"); setFilterStatus("All"); }}
              className="text-sm text-muted-foreground hover:text-foreground px-2"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="text-left px-4 py-3 font-semibold border-b border-border w-28">
                Job #
              </th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border">
                Project Name
              </th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border hidden sm:table-cell">
                Client
              </th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border hidden md:table-cell w-40">
                PM
              </th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border w-28">
                Status
              </th>
              <th className="text-right px-4 py-3 font-semibold border-b border-border hidden lg:table-cell w-32">
                Contract $
              </th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border hidden lg:table-cell w-32">
                Close Date
              </th>
              <th className="text-center px-4 py-3 font-semibold border-b border-border w-24">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {projects.filter((project) => {
              const q = search.toLowerCase();
              if (q) {
                const pmName = (PM_NAMES[project.pm] ?? project.pm ?? "").toLowerCase();
                if (
                  !project.id.toLowerCase().includes(q) &&
                  !(project.name ?? "").toLowerCase().includes(q) &&
                  !(project.client ?? "").toLowerCase().includes(q) &&
                  !pmName.includes(q)
                ) return false;
              }
              if (filterPM !== "All" && project.pm !== filterPM) return false;
              if (filterStatus !== "All" && project.status !== filterStatus) return false;
              return true;
            }).map((project) => {
              const isExpanded = expandedId === project.id;
              const isCompleted = project.status === "Completed";
              const currentProject = project;

              return (
                <>
                  {/* Summary row */}
                  <tr
                    key={project.id}
                    className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${isCompleted ? "text-muted-foreground" : ""} ${isExpanded ? "bg-muted/20" : ""}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs w-28">
                      {project._isNew ? "NEW" : project.id}
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">
                      {project.name || <span className="text-muted-foreground italic">Untitled</span>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground truncate hidden sm:table-cell max-w-[160px]">
                      {project.client}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {PM_NAMES[project.pm] ?? project.pm}
                    </td>
                    <td className="px-4 py-3 w-28">
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs hidden lg:table-cell w-32">
                      {project.contract_amount ? formatCurrency(project.contract_amount) : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell w-32">
                      {project.close_date ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-center w-24">
                      <Button
                        size="sm"
                        variant={isExpanded ? "secondary" : "ghost"}
                        className="h-7 px-3 text-xs"
                        onClick={() => isExpanded ? cancelEdit() : openEdit(project)}
                      >
                        {isExpanded ? "Close" : "Edit"}
                      </Button>
                    </td>
                  </tr>

                  {/* Expanded edit form row */}
                  {isExpanded && (
                  <tr>
                    <td colSpan={8} className="p-0 border-b border-border">
                      <div className="bg-muted/30 px-6 py-6">
                        <div className="max-w-5xl mx-auto space-y-5">
                          {/* Row 1 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField label="Job # (MDP Number)">
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  className={inputClass}
                                  value={(formData.id as string) ?? ""}
                                  readOnly={!formData._isNew}
                                  onChange={(e) => {
                                    updateForm("id", e.target.value);
                                    handleJobNumberChange(e.target.value);
                                  }}
                                  onBlur={(e) => {
                                    handleJobNumberBlur();
                                  }}
                                  placeholder="e.g. 26058"
                                />
                                <ProjectLookupStatus loading={lookupLoading} result={lookupResult} />
                              </div>
                            </FormField>
                            <FormField label="QBO Project URL">
                              <input
                                type="text"
                                className={inputClass}
                                value={(formData.qbo_project_url as string) ?? ""}
                                onChange={(e) => updateForm("qbo_project_url", e.target.value)}
                                placeholder="Paste from QuickBooks project page"
                              />
                            </FormField>
                            <FormField label="Project Name">
                              <input
                                type="text"
                                className={inputClass}
                                value={(formData.name as string) ?? ""}
                                onChange={(e) =>
                                  updateForm("name", e.target.value)
                                }
                                placeholder="Project name"
                              />
                            </FormField>
                            <FormField label="Client">
                              <input
                                type="text"
                                className={inputClass}
                                value={(formData.client as string) ?? ""}
                                onChange={(e) =>
                                  updateForm("client", e.target.value)
                                }
                                placeholder="Client name"
                              />
                            </FormField>
                          </div>

                          {/* Row 2 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <FormField label="PM">
                              <select
                                className={selectClass}
                                value={(formData.pm as string) ?? ""}
                                onChange={(e) =>
                                  updateForm("pm", e.target.value)
                                }
                              >
                                <option value="">Select PM</option>
                                {PM_OPTIONS.map((pm) => (
                                  <option key={pm} value={pm}>
                                    {PM_NAMES[pm]}
                                  </option>
                                ))}
                              </select>
                            </FormField>
                            <FormField label="Status">
                              <select
                                className={selectClass}
                                value={(formData.status as string) ?? "Active"}
                                onChange={(e) =>
                                  updateForm("status", e.target.value)
                                }
                              >
                                <option value="Active">Active</option>
                                <option value="Completed">Completed</option>
                                <option value="On Hold">On Hold</option>
                              </select>
                            </FormField>
                            <FormField label="Close Date">
                              <input
                                type="date"
                                className={inputClass}
                                value={(formData.close_date as string) ?? ""}
                                onChange={(e) =>
                                  updateForm("close_date", e.target.value)
                                }
                              />
                            </FormField>
                            <FormField label="Contract Amount">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.contract_amount as string ?? ""}
                                onChange={(e) =>
                                  updateForm("contract_amount", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                          </div>

                          {/* Row 3 — Budget fields */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField label="Budget Hours">
                              <input
                                type="number"
                                step="0.5"
                                className={inputClass}
                                value={formData.budget_hrs as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_hrs", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                            <FormField label="Design $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_design as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_design", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                            <FormField label="PM $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_pm as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_pm", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                          </div>

                          {/* Row 4 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField label="Shipping $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_shipping as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_shipping", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                            <FormField label="I&D Labor $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_id_labor as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_id_labor", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                            <FormField label="Travel $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_travel as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_travel", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                          </div>

                          {/* Row 5 */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            <FormField label="Props $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_props as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_props", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                            <FormField label="Equipment $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_equipment as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_equipment", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                            <FormField label="Flooring $">
                              <input
                                type="number"
                                step="1"
                                className={inputClass}
                                value={formData.budget_flooring as string ?? ""}
                                onChange={(e) =>
                                  updateForm("budget_flooring", e.target.value)
                                }
                                placeholder="0"
                              />
                            </FormField>
                          </div>

                          {!formData._isNew && (
                            <div className="border-t border-border pt-4">
                              <h4 className="text-sm font-semibold text-foreground mb-3">
                                Actual Spend
                              </h4>
                              {actualsLoading ? (
                                <p className="text-sm text-muted-foreground">
                                  Loading actuals...
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                  <FormField label="Labor Hours Used">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        step="0.5"
                                        className={inputClass}
                                        value={actuals["labor_hours_used"] ?? ""}
                                        onChange={(e) =>
                                          setActuals((prev) => ({
                                            ...prev,
                                            labor_hours_used: e.target.value,
                                          }))
                                        }
                                        placeholder={`Budget: ${formData.budget_hrs || 0} hrs`}
                                      />
                                    </div>
                                  </FormField>
                                  {BUDGET_FIELDS.filter((f) => !f.isHours).map((field) => (
                                    <FormField
                                      key={field.key}
                                      label={`${field.label} Actual $`}
                                    >
                                      <input
                                        type="number"
                                        step="1"
                                        className={inputClass}
                                        value={actuals[field.label] ?? ""}
                                        onChange={(e) =>
                                          setActuals((prev) => ({
                                            ...prev,
                                            [field.label]: e.target.value,
                                          }))
                                        }
                                        placeholder={`Budget: $${formData[field.key] || 0}`}
                                      />
                                    </FormField>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Row 6 — Notes */}
                          <FormField label="Notes">
                            <textarea
                              className={`${inputClass} min-h-[80px] resize-y`}
                              value={(formData.notes as string) ?? ""}
                              onChange={(e) =>
                                updateForm("notes", e.target.value)
                              }
                              placeholder="Internal notes..."
                            />
                          </FormField>

                          {/* Actions */}
                          <div className="flex items-center justify-between pt-2">
                            <div>
                              {!formData._isNew && (
                                <>
                                  {deleting === currentProject.id ? (
                                    <div className="flex items-center gap-3">
                                      <p className="text-sm text-destructive">
                                        Are you sure? This will permanently
                                        delete{" "}
                                        <strong>
                                          {currentProject.name ||
                                            currentProject.id}
                                        </strong>{" "}
                                        and all associated expenses and labor
                                        entries. This cannot be undone.
                                      </p>
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() =>
                                          handleDelete(currentProject)
                                        }
                                        disabled={saving}
                                      >
                                        {saving
                                          ? "Deleting..."
                                          : "Yes, Delete"}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setDeleting(null)}
                                      >
                                        No
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                      onClick={() =>
                                        setDeleting(currentProject.id)
                                      }
                                    >
                                      Delete Project
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelEdit}
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                onClick={handleSave}
                                disabled={saving}
                              >
                                {saving
                                  ? "Saving..."
                                  : formData._isNew
                                    ? "Create Project"
                                    : "Save Changes"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>

        {projects.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <p className="text-muted-foreground">
              No projects found. Click &quot;+ New Project&quot; to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
