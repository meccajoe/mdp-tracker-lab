"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { Expense } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  job_number: string;
}

interface EditExpenseDialogProps {
  expense: Expense;
  projects?: Project[];
  showProjectField?: boolean;
  onSave: (updated: Expense) => void;
  onClose: () => void;
}

export function EditExpenseDialog({
  expense,
  projects = [],
  showProjectField = false,
  onSave,
  onClose,
}: EditExpenseDialogProps) {
  const [form, setForm] = useState({
    project_id: expense.project_id,
    date: expense.date,
    category: expense.category ?? "",
    vendor: expense.vendor ?? "",
    amount: String(expense.amount ?? ""),
    amount_pending: expense.amount_pending ?? false,
    purchaser: expense.purchaser ?? "",
    notes: expense.notes ?? "",
  });
  const [submitting, setSubmitting] = useState(false);

  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [purchaserOptions, setPurchaserOptions] = useState<{ initials: string; full_name: string }[]>([]);

  const fetchDropdowns = useCallback(async () => {
    const [vendorsRes, catsRes, purchasersRes] = await Promise.all([
      supabase.from("vendors").select("name").eq("active", true).order("name"),
      supabase.from("cogs_categories").select("name").order("name"),
      supabase.from("purchasers").select("initials, full_name").eq("active", true).order("full_name"),
    ]);
    if (vendorsRes.data) setVendorOptions(vendorsRes.data.map((v: { name: string }) => v.name));
    if (catsRes.data) setCategoryOptions(catsRes.data.map((c: { name: string }) => c.name));
    if (purchasersRes.data) setPurchaserOptions(purchasersRes.data as { initials: string; full_name: string }[]);
  }, []);

  useEffect(() => { fetchDropdowns(); }, [fetchDropdowns]);

  const projectOptions = projects
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => (p.job_number ? `${p.job_number} · ${p.name}` : p.name));

  const projectLabelToId: Record<string, string> = {};
  const projectIdToLabel: Record<string, string> = {};
  projects.forEach((p) => {
    const label = p.job_number ? `${p.job_number} · ${p.name}` : p.name;
    projectLabelToId[label] = p.id;
    projectIdToLabel[p.id] = label;
  });

  async function handleSave() {
    if (!form.date || !form.category || !form.amount) {
      toast.error("Please fill in date, category, and amount");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase
      .from("expenses")
      .update({
        project_id: form.project_id,
        date: form.date,
        category: form.category,
        vendor: form.vendor || null,
        amount: parseFloat(form.amount),
        amount_pending: form.amount_pending,
        purchaser: form.purchaser || null,
        notes: form.notes || null,
      })
      .eq("id", expense.id)
      .select()
      .single();
    setSubmitting(false);
    if (error) {
      toast.error("Failed to update expense: " + error.message);
      return;
    }
    toast.success("Expense updated");
    onSave(data as Expense);
    onClose();
  }

  const purchaserDisplayValue =
    purchaserOptions.find((p) => p.initials === form.purchaser)?.full_name ?? form.purchaser;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Expense</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {showProjectField && (
            <div className="space-y-1">
              <Label>Project *</Label>
              <Combobox
                options={projectOptions}
                value={projectIdToLabel[form.project_id] ?? ""}
                onChange={(v) => setForm((f) => ({ ...f, project_id: projectLabelToId[v] ?? f.project_id }))}
                placeholder="Search project…"
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Amount *</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Category *</Label>
            <Combobox
              options={categoryOptions}
              value={form.category}
              onChange={(v) => setForm((f) => ({ ...f, category: v }))}
              placeholder="Search category…"
            />
          </div>
          <div className="space-y-1">
            <Label>Vendor</Label>
            <Combobox
              options={vendorOptions}
              value={form.vendor}
              onChange={(v) => setForm((f) => ({ ...f, vendor: v }))}
              placeholder="Search vendor…"
              allowCustom
            />
          </div>
          <div className="space-y-1">
            <Label>Purchaser</Label>
            <Combobox
              options={purchaserOptions.map((p) => p.full_name)}
              value={purchaserDisplayValue}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  purchaser: purchaserOptions.find((p) => p.full_name === v)?.initials ?? v,
                }))
              }
              placeholder="Search purchaser…"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit-pending"
              type="checkbox"
              checked={form.amount_pending}
              onChange={(e) => setForm((f) => ({ ...f, amount_pending: e.target.checked }))}
              className="h-4 w-4"
            />
            <Label htmlFor="edit-pending" className="font-normal cursor-pointer">Amount pending (estimate)</Label>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes…"
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
