"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { fetchProjectLookup, type ProjectLookupResult } from "@/lib/project-lookups";
import {
  PM_OPTIONS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  Project,
} from "@/lib/types";
import { BUDGET_FIELDS } from "@/lib/constants";
import { ProjectLookupStatus } from "@/components/project-lookup-status";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function EditProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [pm, setPm] = useState<string>(PM_OPTIONS[0]);
  const [jobNumber, setJobNumber] = useState("");
  const [status, setStatus] = useState<string>("Active");
  const [closeDate, setCloseDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [budgets, setBudgets] = useState<Record<string, string>>({});
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<ProjectLookupResult | null>(null);
  const [hubspotDealId, setHubspotDealId] = useState<string | null>(null);
  const [hubspotDealUrl, setHubspotDealUrl] = useState<string | null>(null);
  const [qboProjectId, setQboProjectId] = useState<string | null>(null);
  const [qboProjectUrl, setQboProjectUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProject() {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", projectId)
        .single();

      if (error || !data) {
        toast.error("Failed to load project.");
        setLoading(false);
        return;
      }

      const project = data as Project;
      setName(project.name);
      setClient(project.client);
      setPm(project.pm);
      setJobNumber(project.job_number ?? "");
      setStatus(project.status);
      setCloseDate(project.close_date ?? "");
      setDueDate((project as unknown as Record<string, unknown>).due_date as string ?? "");
      setContractAmount(
        project.contract_amount != null ? String(project.contract_amount) : ""
      );
      setProjectType(project.project_type ?? PROJECT_TYPES[0]);
      setNotes(project.notes ?? "");
      setHubspotDealId(project.hubspot_deal_id);
      setHubspotDealUrl(project.hubspot_deal_url);
      setQboProjectId(project.qbo_project_id);
      setQboProjectUrl(project.qbo_project_url);

      const budgetValues: Record<string, string> = {};
      for (const field of BUDGET_FIELDS) {
        const val = project[field.key as keyof Project];
        budgetValues[field.key] = val != null ? String(val) : "";
      }
      setBudgets(budgetValues);

      setLoading(false);
    }
    fetchProject();
  }, [projectId]);

  function updateBudget(key: string, value: string) {
    setBudgets((prev) => ({ ...prev, [key]: value }));
  }

  function handleJobNumberChange(value: string) {
    setJobNumber(value);
    setLookupResult(null);
    setHubspotDealId(null);
    setHubspotDealUrl(null);
    setQboProjectId(null);
    setQboProjectUrl(null);
  }

  async function handleJobNumberBlur() {
    const trimmed = jobNumber.trim();
    if (!trimmed) {
      setLookupResult(null);
      return;
    }

    setLookupLoading(true);
    try {
      const result = await fetchProjectLookup(trimmed);
      setLookupResult(result);
      setHubspotDealId(result.hubspot_deal_id);
      setHubspotDealUrl(result.hubspot_deal_url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Project Name is required.");
      return;
    }

    setSaving(true);

    const row: Record<string, unknown> = {
      name: name.trim(),
      client: client.trim(),
      pm,
      job_number: jobNumber.trim() || null,
      status,
      close_date: closeDate || null,
      due_date: dueDate || null,
      contract_amount: contractAmount ? Number(contractAmount) : null,
      project_type: projectType,
      notes: notes.trim() || null,
      hubspot_deal_id: hubspotDealId,
      hubspot_deal_url: hubspotDealUrl,
      qbo_project_id: qboProjectId,
      qbo_project_url: qboProjectUrl,
    };

    for (const field of BUDGET_FIELDS) {
      const val = budgets[field.key];
      row[field.key] = val ? Number(val) : null;
    }

    const { error } = await supabase
      .from("projects")
      .update(row)
      .eq("id", projectId);

    setSaving(false);

    if (error) {
      toast.error("Failed to update project: " + error.message);
      return;
    }

    toast.success("Project updated successfully.");
    router.push(`/projects/${projectId}`);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Edit Project</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Project ID</Label>
                <Input value={projectId} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobNumber">Job Number</Label>
              <Input
                id="jobNumber"
                value={jobNumber}
                onChange={(e) => handleJobNumberChange(e.target.value)}
                onBlur={handleJobNumberBlur}
                placeholder="Used for HubSpot and QBO lookup"
              />
              <ProjectLookupStatus loading={lookupLoading} result={lookupResult} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qboProjectUrl">QBO Project URL</Label>
              <Input
                id="qboProjectUrl"
                value={qboProjectUrl ?? ""}
                onChange={(e) => setQboProjectUrl(e.target.value || null)}
                placeholder="Paste from QuickBooks project page"
              />
              <p className="text-xs text-muted-foreground">Open the project in QBO and copy the URL from your browser</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="client">Client *</Label>
                <Input
                  id="client"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>PM</Label>
                <Select value={pm} onValueChange={(v) => v !== null && setPm(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PM_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => v !== null && setStatus(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="closeDate">Close Date</Label>
                <Input
                  id="closeDate"
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">When the deal closed</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">When the project must be completed</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractAmount">Contract Amount</Label>
                <Input
                  id="contractAmount"
                  type="number"
                  step="0.01"
                  value={contractAmount}
                  onChange={(e) => setContractAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>Project Type</Label>
                <Select value={projectType} onValueChange={(v) => v !== null && setProjectType(v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {BUDGET_FIELDS.map((field) => (
                <div key={field.key} className="space-y-2">
                  <Label htmlFor={field.key}>
                    {field.label}
                    {field.isHours ? " (hrs)" : " ($)"}
                  </Label>
                  <Input
                    id={field.key}
                    type="number"
                    step={field.isHours ? "0.5" : "0.01"}
                    value={budgets[field.key] ?? ""}
                    onChange={(e) => updateBudget(field.key, e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Separator />

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
