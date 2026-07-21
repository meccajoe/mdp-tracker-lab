"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/lib/supabase";

const CATEGORIES = ["defect", "rework", "safety", "site", "vendor", "labor", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const STATUSES = ["open", "in_progress", "resolved", "closed"];

export type EditableIssue = {
  id: string; title: string; description?: string | null; category: string; severity: string; status: string;
  owner_label?: string | null; linked_vendor?: string | null; cost_impact?: number | null;
  schedule_impact_days?: number | null; reported_date: string;
};

export function IssueEditDialog({ issue, onChanged }: { issue: EditableIssue; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: issue.title, description: issue.description ?? "", category: issue.category, severity: issue.severity,
    status: issue.status, ownerLabel: issue.owner_label ?? "", linkedVendor: issue.linked_vendor ?? "",
    costImpact: issue.cost_impact?.toString() ?? "", scheduleImpactDays: issue.schedule_impact_days?.toString() ?? "", reportedDate: issue.reported_date,
  });

  function change(name: keyof typeof form, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  async function request(method: "PATCH" | "DELETE", body?: unknown) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Authentication required");
    const response = await fetch(`/api/production-issues/${issue.id}`, {
      method,
      credentials: "include",
      headers: { Authorization: "Bearer " + session.access_token, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error ?? "Issue could not be updated.");
    }
  }

  async function save() {
    if (!form.title.trim()) return toast.error("Issue title is required.");
    setSaving(true);
    try {
      await request("PATCH", {
        title: form.title.trim(), description: form.description, category: form.category, severity: form.severity, status: form.status,
        ownerLabel: form.ownerLabel, linkedVendor: form.linkedVendor,
        costImpact: form.costImpact === "" ? null : Number(form.costImpact),
        scheduleImpactDays: form.scheduleImpactDays === "" ? null : Number(form.scheduleImpactDays), reportedDate: form.reportedDate,
      });
      toast.success("Issue updated.");
      setOpen(false);
      onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Issue could not be updated."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!window.confirm(`Delete “${issue.title}”? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await request("DELETE");
      toast.success("Issue deleted.");
      setOpen(false);
      onChanged();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Issue could not be deleted."); }
    finally { setSaving(false); }
  }

  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted">Edit</DialogTrigger>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Edit issue</DialogTitle></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What happened?" className="sm:col-span-2"><input value={form.title} onChange={(event) => change("title", event.target.value)} className="input" /></Field>
        <Field label="Category"><Select value={form.category} values={CATEGORIES} onChange={(value) => change("category", value)} /></Field>
        <Field label="Severity"><Select value={form.severity} values={SEVERITIES} onChange={(value) => change("severity", value)} /></Field>
        <Field label="Status"><Select value={form.status} values={STATUSES} onChange={(value) => change("status", value)} /></Field>
        <Field label="Reported date"><input type="date" value={form.reportedDate} onChange={(event) => change("reportedDate", event.target.value)} className="input" /></Field>
        <Field label="Assigned to"><input value={form.ownerLabel} onChange={(event) => change("ownerLabel", event.target.value)} className="input" /></Field>
        <Field label="Vendor"><input value={form.linkedVendor} onChange={(event) => change("linkedVendor", event.target.value)} className="input" /></Field>
        <Field label="Cost impact ($)"><input type="number" min="0" value={form.costImpact} onChange={(event) => change("costImpact", event.target.value)} className="input" /></Field>
        <Field label="Schedule impact (days)"><input type="number" min="0" value={form.scheduleImpactDays} onChange={(event) => change("scheduleImpactDays", event.target.value)} className="input" /></Field>
        <Field label="Details" className="sm:col-span-2"><textarea rows={3} value={form.description} onChange={(event) => change("description", event.target.value)} className="input" /></Field>
      </div>
      <DialogFooter className="gap-2 sm:gap-2"><Button type="button" variant="destructive" onClick={() => void remove()} disabled={saving}>Delete issue</Button><Button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save changes"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) { return <label className={`block text-sm font-medium ${className}`}>{label}<span className="mt-1.5 block [&_.input]:w-full [&_.input]:rounded-md [&_.input]:border [&_.input]:border-border [&_.input]:bg-background [&_.input]:px-3 [&_.input]:py-2 [&_.input]:text-sm">{children}</span></label>; }
function Select({ value, values, onChange }: { value: string; values: string[]; onChange: (value: string) => void }) { return <select value={value} onChange={(event) => onChange(event.target.value)} className="input capitalize">{values.map((entry) => <option key={entry} value={entry}>{entry.replace("_", " ")}</option>)}</select>; }
