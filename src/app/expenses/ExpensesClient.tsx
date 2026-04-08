"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { PM_NAMES } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

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

  async function handleAddExpense() {
    if (!addForm.project_id || !addForm.date || !addForm.category || !addForm.amount) {
      toast.error("Please fill in project, date, category, and amount");
      return;
    }
    setAddSubmitting(true);
    const { error } = await supabase.from("expenses").insert({
      id: "",
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
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger>
              <Button size="sm">+ Add Expense</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Expense</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1">
                  <Label>Project *</Label>
                  <Select value={addForm.project_id} onValueChange={(v) => setAddForm((f) => ({ ...f, project_id: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select project…" /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.job_number ? `${p.job_number} · ` : ""}{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <Select value={addForm.category} onValueChange={(v) => setAddForm((f) => ({ ...f, category: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select category…" /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      {categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Vendor</Label>
                  <Select value={addForm.vendor} onValueChange={(v) => setAddForm((f) => ({ ...f, vendor: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select vendor…" /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      {vendorOptions.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Purchaser</Label>
                  <Select value={addForm.purchaser} onValueChange={(v) => setAddForm((f) => ({ ...f, purchaser: v ?? "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select purchaser…" /></SelectTrigger>
                    <SelectContent className="max-h-56">
                      {purchaserOptions.map((p) => <SelectItem key={p.initials} value={p.initials}>{p.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
                        <TableCell className="text-sm">{expense.vendor || "—"}</TableCell>
                        <TableCell className="text-sm">{expense.category || "—"}</TableCell>
                        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                          {expense.purchaser || "—"}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium">
                          {formatCurrency(expense.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

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
