"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { PM_NAMES, Expense as LibExpense } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditExpenseDialog } from "@/components/EditExpenseDialog";
import { Pencil, Trash2, Flag } from "lucide-react";

interface Expense {
  id: string;
  project_id: string;
  date: string;
  category: string;
  cogs_code: string;
  vendor: string;
  amount: number;
  amount_pending: number;
  purchaser: string;
  notes: string;
  flagged?: boolean;
  flag_note?: string | null;
  flagged_by?: string | null;
  flagged_at?: string | null;
  source?: string | null;
}

interface Project {
  id: string;
  name: string;
  pm: string;
  job_number: string;
}

const PAGE_SIZE = 50;

function formatCurrency(val: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val ?? 0);
}

type SortField = "date" | "amount" | "vendor" | "category" | "project";
type SortDir = "asc" | "desc";

export default function ExpensesClient({
  expenses: initialExpenses,
  projects,
  activePMs,
}: {
  expenses: Expense[];
  projects: Project[];
  activePMs: string[];
}) {
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [editingExpense, setEditingExpense] = useState<LibExpense | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [flaggingExpense, setFlaggingExpense] = useState<Expense | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [search, setSearch] = useState("");
  const [pmFilter, setPmFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);

  // Add Expense modal state
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [purchaserOptions, setPurchaserOptions] = useState<{ initials: string; full_name: string }[]>([]);
  const [addForm, setAddForm] = useState({
    project_id: "",
    date: new Date().toISOString().split("T")[0],
    category: "",
    vendor: "",
    amount: "",
    amount_pending: false,
    purchaser: "",
    notes: "",
  });

  const fetchDropdownData = useCallback(async () => {
    const [vendorsRes, catsRes, purchasersRes] = await Promise.all([
      supabase.from("vendors").select("name").eq("active", true).order("name"),
      supabase.from("cogs_categories").select("name").order("name"),
      supabase.from("purchasers").select("initials, full_name").eq("active", true).order("full_name"),
    ]);
    if (vendorsRes.data) setVendorOptions(vendorsRes.data.map((v: { name: string }) => v.name));
    if (catsRes.data) setCategoryOptions(catsRes.data.map((c: { name: string }) => c.name));
    if (purchasersRes.data) setPurchaserOptions(purchasersRes.data as { initials: string; full_name: string }[]);
  }, []);

  useEffect(() => { fetchDropdownData(); }, [fetchDropdownData]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setCurrentUserEmail(session.user.email);
    });
  }, []);

  async function handleAddExpense() {
    if (!addForm.project_id || !addForm.date || !addForm.category || !addForm.amount) {
      toast.error("Please fill in project, date, category, and amount");
      return;
    }
    setAddSubmitting(true);
    const { error } = await supabase.from("expenses").insert({
      id: crypto.randomUUID(),
      project_id: addForm.project_id,
      date: addForm.date,
      category: addForm.category,
      vendor: addForm.vendor || null,
      amount: parseFloat(addForm.amount),
      amount_pending: addForm.amount_pending,
      purchaser: addForm.purchaser || null,
      notes: addForm.notes || null,
    });
    setAddSubmitting(false);
    if (error) { toast.error("Failed to add expense: " + error.message); return; }
    toast.success("Expense added");
    setAddOpen(false);
    setAddForm({ project_id: "", date: new Date().toISOString().split("T")[0], category: "", vendor: "", amount: "", amount_pending: false, purchaser: "", notes: "" });
    // Refresh expenses list
    const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false });
    if (data) setExpenses(data as Expense[]);
  }

  async function handleDeleteExpense() {
    if (!deletingExpenseId) return;
    setDeleteSubmitting(true);
    const { error } = await supabase.from("expenses").delete().eq("id", deletingExpenseId);
    setDeleteSubmitting(false);
    if (error) { toast.error("Failed to delete expense: " + error.message); return; }
    toast.success("Expense deleted");
    setExpenses((prev) => prev.filter((e) => e.id !== deletingExpenseId));
    setDeletingExpenseId(null);
  }

  async function handleFlagExpense() {
    if (!flaggingExpense) return;
    setFlagSubmitting(true);
    const { error } = await supabase.from("expenses").update({
      flagged: true,
      flag_note: flagNote || null,
      flagged_by: currentUserEmail,
      flagged_at: new Date().toISOString(),
    }).eq("id", flaggingExpense.id);
    setFlagSubmitting(false);
    if (error) { toast.error("Failed to flag expense: " + error.message); return; }
    toast.success("Expense flagged");
    setExpenses((prev) => prev.map((e) => e.id === flaggingExpense.id ? { ...e, flagged: true, flag_note: flagNote || null, flagged_by: currentUserEmail, flagged_at: new Date().toISOString() } : e));
    setFlaggingExpense(null);
    setFlagNote("");
  }

  async function handleUnflagExpense(id: string) {
    const { error } = await supabase.from("expenses").update({
      flagged: false,
      flag_note: null,
      flagged_by: null,
      flagged_at: null,
    }).eq("id", id);
    if (error) { toast.error("Failed to remove flag: " + error.message); return; }
    toast.success("Flag removed");
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, flagged: false, flag_note: null, flagged_by: null, flagged_at: null } : e));
    setFlaggingExpense(null);
    setFlagNote("");
  }

  // Bulk expense state
  const EMPTY_ROW = () => ({ project_id: "", date: new Date().toISOString().split("T")[0], category: "", vendor: "", amount: "", purchaser: "", notes: "" });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRows, setBulkRows] = useState(() => Array.from({ length: 5 }, EMPTY_ROW));
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  function updateBulkRow(idx: number, field: string, value: string) {
    setBulkRows((rows) => rows.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  async function handleBulkSubmit() {
    const valid = bulkRows.filter((r) => r.project_id && r.date && r.category && r.amount);
    if (!valid.length) { toast.error("Fill in at least one complete row (project, date, category, amount)"); return; }
    setBulkSubmitting(true);
    const { error } = await supabase.from("expenses").insert(
      valid.map((r) => ({
        id: crypto.randomUUID(),
        project_id: r.project_id,
        date: r.date,
        category: r.category,
        vendor: r.vendor || null,
        amount: parseFloat(r.amount),
        amount_pending: false,
        purchaser: r.purchaser || null,
        notes: r.notes || null,
      }))
    );
    setBulkSubmitting(false);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success(`${valid.length} expense${valid.length !== 1 ? "s" : ""} added`);
    setBulkOpen(false);
    setBulkRows(Array.from({ length: 5 }, EMPTY_ROW));
    const { data } = await supabase.from("expenses").select("*").order("date", { ascending: false });
    if (data) setExpenses(data as Expense[]);
  }

  // Searchable project options for comboboxes
  const projectOptions = useMemo(() =>
    [...projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (p.job_number ? `${p.job_number} · ${p.name}` : p.name)),
    [projects]
  );
  const projectLabelToId = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => { m[p.job_number ? `${p.job_number} · ${p.name}` : p.name] = p.id; });
    return m;
  }, [projects]);
  const projectIdToLabel = useMemo(() => {
    const m: Record<string, string> = {};
    projects.forEach((p) => { m[p.id] = p.job_number ? `${p.job_number} · ${p.name}` : p.name; });
    return m;
  }, [projects]);

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>();
    projects.forEach((p) => m.set(p.id, p));
    return m;
  }, [projects]);

  const pms = useMemo(() => {
    const activeSet = new Set(activePMs);
    const s = new Set(projects.map((p) => p.pm).filter((pm) => pm && activeSet.has(pm)));
    return Array.from(s).sort();
  }, [projects, activePMs]);

  const categories = useMemo(() => {
    const s = new Set(expenses.map((e) => e.category).filter(Boolean));
    return Array.from(s).sort();
  }, [expenses]);

  const filtered = useMemo(() => {
    let rows = expenses;

    if (pmFilter !== "all") {
      const pmProjects = new Set(projects.filter((p) => p.pm === pmFilter).map((p) => p.id));
      rows = rows.filter((e) => pmProjects.has(e.project_id));
    }
    if (categoryFilter !== "all") {
      rows = rows.filter((e) => e.category === categoryFilter);
    }
    if (dateFrom) rows = rows.filter((e) => e.date >= dateFrom);
    if (dateTo) rows = rows.filter((e) => e.date <= dateTo);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (e) =>
          e.vendor?.toLowerCase().includes(q) ||
          e.category?.toLowerCase().includes(q) ||
          e.notes?.toLowerCase().includes(q) ||
          projectMap.get(e.project_id)?.name?.toLowerCase().includes(q) ||
          projectMap.get(e.project_id)?.job_number?.toLowerCase().includes(q)
      );
    }

    rows = [...rows].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "date") { av = a.date ?? ""; bv = b.date ?? ""; }
      else if (sortField === "amount") { av = a.amount ?? 0; bv = b.amount ?? 0; }
      else if (sortField === "vendor") { av = a.vendor ?? ""; bv = b.vendor ?? ""; }
      else if (sortField === "category") { av = a.category ?? ""; bv = b.category ?? ""; }
      else if (sortField === "project") {
        av = projectMap.get(a.project_id)?.name ?? "";
        bv = projectMap.get(b.project_id)?.name ?? "";
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return rows;
  }, [expenses, pmFilter, categoryFilter, dateFrom, dateTo, search, sortField, sortDir, projects, projectMap]);

  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + (e.amount ?? 0), 0), [filtered]);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "amount" ? "desc" : "asc");
    }
    setPage(0);
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="ml-1 opacity-30">↕</span>;
    return <span className="ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  function resetFilters() {
    setSearch("");
    setPmFilter("all");
    setCategoryFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  }

  const hasFilters = search || pmFilter !== "all" || categoryFilter !== "all" || dateFrom || dateTo;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">All Expenses</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {filtered.length} expense{filtered.length !== 1 ? "s" : ""} · {formatCurrency(totalAmount)} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Single expense */}
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger>
              <Button size="sm" variant="outline">+ Add Expense</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label>Project *</Label>
                  <Combobox
                    options={projectOptions}
                    value={projectIdToLabel[addForm.project_id] ?? ""}
                    onChange={(v) => setAddForm((f) => ({ ...f, project_id: projectLabelToId[v] ?? "" }))}
                    placeholder="Search project…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Date *</Label>
                    <Input type="date" value={addForm.date} onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Amount *</Label>
                    <Input type="number" step="0.01" placeholder="0.00" value={addForm.amount} onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Category *</Label>
                  <Combobox options={categoryOptions} value={addForm.category} onChange={(v) => setAddForm((f) => ({ ...f, category: v }))} placeholder="Search category…" />
                </div>
                <div className="space-y-1">
                  <Label>Vendor</Label>
                  <Combobox options={vendorOptions} value={addForm.vendor} onChange={(v) => setAddForm((f) => ({ ...f, vendor: v }))} placeholder="Search vendor…" allowCustom />
                </div>
                <div className="space-y-1">
                  <Label>Purchaser</Label>
                  <Combobox
                    options={purchaserOptions.map((p) => p.full_name)}
                    value={purchaserOptions.find((p) => p.initials === addForm.purchaser)?.full_name ?? ""}
                    onChange={(v) => setAddForm((f) => ({ ...f, purchaser: purchaserOptions.find((p) => p.full_name === v)?.initials ?? v }))}
                    placeholder="Search purchaser…"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="pending" checked={addForm.amount_pending} onChange={(e) => setAddForm((f) => ({ ...f, amount_pending: e.target.checked }))} className="h-4 w-4" />
                  <Label htmlFor="pending" className="font-normal cursor-pointer">Amount pending (estimate)</Label>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={2} value={addForm.notes} onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional notes…" />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddExpense} disabled={addSubmitting}>{addSubmitting ? "Saving…" : "Add Expense"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Bulk expense */}
          <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
            <DialogTrigger>
              <Button size="sm">+ Add Bulk</Button>
            </DialogTrigger>
            <DialogContent className="!max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Add Multiple Expenses</DialogTitle></DialogHeader>
              <div className="pt-2 space-y-3">
                <p className="text-sm text-muted-foreground">Fill in each row. Leave blank rows empty — only complete rows (project + date + category + amount) will be saved.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left font-medium pb-2 pr-2 min-w-[200px]">Project *</th>
                        <th className="text-left font-medium pb-2 pr-2 w-32">Date *</th>
                        <th className="text-left font-medium pb-2 pr-2 min-w-[160px]">Category *</th>
                        <th className="text-left font-medium pb-2 pr-2 min-w-[140px]">Vendor</th>
                        <th className="text-left font-medium pb-2 pr-2 w-24">Amount *</th>
                        <th className="text-left font-medium pb-2 pr-2 min-w-[120px]">Purchaser</th>
                        <th className="text-left font-medium pb-2">Notes</th>
                        <th className="w-6"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="py-1.5 pr-2">
                            <Combobox
                              options={projectOptions}
                              value={projectIdToLabel[row.project_id] ?? ""}
                              onChange={(v) => updateBulkRow(idx, "project_id", projectLabelToId[v] ?? "")}
                              placeholder="Project…"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="date" className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-ring" value={row.date} onChange={(e) => updateBulkRow(idx, "date", e.target.value)} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Combobox options={categoryOptions} value={row.category} onChange={(v) => updateBulkRow(idx, "category", v)} placeholder="Category…" />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Combobox options={vendorOptions} value={row.vendor} onChange={(v) => updateBulkRow(idx, "vendor", v)} placeholder="Vendor…" allowCustom />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="number" step="0.01" placeholder="0.00" className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-ring" value={row.amount} onChange={(e) => updateBulkRow(idx, "amount", e.target.value)} />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Combobox
                              options={purchaserOptions.map((p) => p.full_name)}
                              value={purchaserOptions.find((p) => p.initials === row.purchaser)?.full_name ?? ""}
                              onChange={(v) => updateBulkRow(idx, "purchaser", purchaserOptions.find((p) => p.full_name === v)?.initials ?? v)}
                              placeholder="Purchaser…"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <input type="text" placeholder="Notes…" className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus:border-ring" value={row.notes} onChange={(e) => updateBulkRow(idx, "notes", e.target.value)} />
                          </td>
                          <td className="py-1.5">
                            <button type="button" onClick={() => setBulkRows((rows) => rows.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive text-xs px-1" title="Remove row">×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setBulkRows((r) => [...r, EMPTY_ROW()])}>+ Add Row</Button>
                <div className="flex items-center justify-between pt-2 border-t">
                  <p className="text-xs text-muted-foreground">{bulkRows.filter((r) => r.project_id && r.date && r.category && r.amount).length} complete row(s) ready to save</p>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setBulkOpen(false); setBulkRows(Array.from({ length: 5 }, EMPTY_ROW)); }}>Cancel</Button>
                    <Button onClick={handleBulkSubmit} disabled={bulkSubmitting}>{bulkSubmitting ? "Saving…" : "Save All"}</Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Link href="/">
            <Button variant="outline" size="sm">← Dashboard</Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search</label>
              <Input
                placeholder="Project, vendor, notes…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-64"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PM</label>
              <Select value={pmFilter} onValueChange={(v) => { setPmFilter(v ?? "all"); setPage(0); }}>
                <SelectTrigger className="w-36">
                  <SelectValue>{pmFilter === "all" ? "All PMs" : (PM_NAMES[pmFilter] ?? pmFilter)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All PMs</SelectItem>
                  {pms.map((pm) => (
                    <SelectItem key={pm} value={pm}>{PM_NAMES[pm] ?? pm}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Category</label>
              <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v ?? "all"); setPage(0); }}>
                <SelectTrigger className="w-44">
                  <SelectValue>{categoryFilter === "all" ? "All categories" : (categoryFilter.charAt(0).toUpperCase() + categoryFilter.slice(1).toLowerCase())}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1).toLowerCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</label>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  className="w-36"
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  className="w-36"
                />
              </div>
            </div>
            {hasFilters && (
              <div className="flex flex-col gap-1">
                <label className="text-xs invisible">x</label>
                <Button variant="ghost" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">No expenses match your filters.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("date")}>
                      Date <SortIcon field="date" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("project")}>
                      Project <SortIcon field="project" />
                    </TableHead>
                    <TableHead className="hidden md:table-cell">PM</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("vendor")}>
                      Vendor <SortIcon field="vendor" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("category")}>
                      Category <SortIcon field="category" />
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">Purchaser</TableHead>
                    <TableHead className="text-right cursor-pointer select-none" onClick={() => toggleSort("amount")}>
                      Amount <SortIcon field="amount" />
                    </TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((expense) => {
                    const project = projectMap.get(expense.project_id);
                    return (
                      <TableRow key={expense.id} className="hover:bg-muted/40">
                        <TableCell className="text-sm whitespace-nowrap">{expense.date}</TableCell>
                        <TableCell className="text-sm">
                          {project ? (
                            <Link
                              href={`/projects/${project.id}`}
                              className="hover:underline text-blue-600 dark:text-blue-400"
                            >
                              {project.job_number} · {project.name}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">{expense.project_id}</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {project?.pm ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          <span className="flex items-center gap-1.5">
                            {expense.vendor || "—"}
                            {expense.source === "billcom" && (
                              <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">BILL</span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm">{expense.category || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {expense.purchaser || "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(expense.amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {expense.source !== "billcom" && (
                              <>
                                <button
                                  onClick={() => setEditingExpense(expense as unknown as LibExpense)}
                                  className="p-1 text-muted-foreground hover:text-foreground rounded"
                                  title="Edit expense"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setDeletingExpenseId(expense.id)}
                                  className="p-1 text-muted-foreground hover:text-destructive rounded"
                                  title="Delete expense"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => { setFlaggingExpense(expense); setFlagNote(expense.flag_note ?? ""); }}
                              className="p-1 rounded"
                              title={expense.flagged ? "Remove flag" : "Flag this expense"}
                            >
                              <Flag className={`w-3.5 h-3.5 ${expense.flagged ? "text-red-500 fill-red-500" : "text-muted-foreground"}`} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {editingExpense && (
                <EditExpenseDialog
                  expense={editingExpense}
                  projects={projects}
                  showProjectField
                  onSave={(updated) => setExpenses((prev) => prev.map((e) => e.id === updated.id ? updated as unknown as Expense : e))}
                  onClose={() => setEditingExpense(null)}
                />
              )}
              <AlertDialog open={deletingExpenseId !== null} onOpenChange={(open) => { if (!open) setDeletingExpenseId(null); }}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this expense?</AlertDialogTitle>
                    <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeletingExpenseId(null)}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteExpense} disabled={deleteSubmitting} className="bg-destructive text-white hover:bg-destructive/90">
                      {deleteSubmitting ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={flaggingExpense !== null} onOpenChange={(open) => { if (!open) { setFlaggingExpense(null); setFlagNote(""); } }}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Flag Expense</DialogTitle>
                  </DialogHeader>
                  {flaggingExpense && (
                    <div className="space-y-4 pt-2">
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{flaggingExpense.vendor || flaggingExpense.category}</span>
                        {" · "}
                        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(flaggingExpense.amount)}
                      </div>
                      {flaggingExpense.flagged ? (
                        <>
                          {flaggingExpense.flag_note && (
                            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                              {flaggingExpense.flag_note}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">Flagged by {flaggingExpense.flagged_by}</p>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => { setFlaggingExpense(null); setFlagNote(""); }}>Cancel</Button>
                            <Button variant="destructive" onClick={() => handleUnflagExpense(flaggingExpense.id)}>Remove Flag</Button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-sm font-medium">Note</label>
                            <Textarea
                              rows={3}
                              placeholder="What went wrong?"
                              value={flagNote}
                              onChange={(e) => setFlagNote(e.target.value)}
                            />
                          </div>
                          <div className="flex justify-end gap-2 pt-2">
                            <Button variant="outline" onClick={() => { setFlaggingExpense(null); setFlagNote(""); }}>Cancel</Button>
                            <Button variant="destructive" onClick={handleFlagExpense} disabled={flagSubmitting}>
                              {flagSubmitting ? "Flagging…" : "Flag It"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </DialogContent>
              </Dialog>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
                  <span>
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                      ← Prev
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>
                      Next →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
