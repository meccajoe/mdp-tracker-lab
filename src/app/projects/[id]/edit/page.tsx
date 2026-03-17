"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PM_OPTIONS,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  Project,
} from "@/lib/types";
import { BUDGET_FIELDS } from "@/lib/constants";
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
  const [status, setStatus] = useState<string>("Active");
  const [closeDate, setCloseDate] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [notes, setNotes] = useState("");
  const [budgets, setBudgets] = useState<Record<string, string>>({});

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
      setStatus(project.status);
      setCloseDate(project.close_date ?? "");
      setContractAmount(
        project.contract_amount != null ? String(project.contract_amount) : ""
      );
      setProjectType(project.project_type ?? PROJECT_TYPES[0]);
      setNotes(project.notes ?? "");

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
      status,
      close_date: closeDate || null,
      contract_amount: contractAmount ? Number(contractAmount) : null,
      project_type: projectType,
      notes: notes.trim() || null,
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
