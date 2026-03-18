"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  ProjectSummary,
  Expense,
  LaborEntry,
  CogsCategory,
  LABOR_TYPES,
} from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  getBudgetHealthColor,
  LABOR_RATE,
  BUDGET_FIELDS,
} from "@/lib/constants";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Map budget field keys to expense category names (best-effort matching)
const BUDGET_TO_CATEGORY_MAP: Record<string, string[]> = {
  budget_design: ["Design", "design"],
  budget_pm: ["Project Management", "PM", "pm"],
  budget_shipping: ["Shipping", "shipping", "Freight"],
  budget_id_labor: ["I&D Labor", "I&D", "id_labor", "Install", "Dismantle"],
  budget_travel: ["Travel", "travel"],
  budget_props: ["Props", "props"],
  budget_equipment: ["Equipment", "equipment", "AV", "Rental"],
  budget_flooring: ["Flooring", "flooring"],
};

function getStatusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "Active":
      return "default";
    case "Completed":
      return "secondary";
    case "On Hold":
      return "outline";
    default:
      return "default";
  }
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [cogsCategories, setCogsCategories] = useState<CogsCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetEdits, setBudgetEdits] = useState<Record<string, string>>({});
  const [manualActuals, setManualActuals] = useState<Record<string, string>>({});
  const [savedActuals, setSavedActuals] = useState<Record<string, number>>({});
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [activeExpenseTab, setActiveExpenseTab] = useState<"expenses" | "labor">("expenses");
  const [showCharts, setShowCharts] = useState(false);

  // Expense form state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split("T")[0],
    category: "",
    vendor: "",
    amount: "",
    amount_pending: false,
    purchaser: "",
    notes: "",
  });
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);

  // Labor form state
  const [laborDialogOpen, setLaborDialogOpen] = useState(false);
  const [laborForm, setLaborForm] = useState({
    date: new Date().toISOString().split("T")[0],
    person: "",
    hours: "",
    labor_type: "",
    notes: "",
  });
  const [laborSubmitting, setLaborSubmitting] = useState(false);

  // Vendor/purchaser options for comboboxes
  const [vendorOptions, setVendorOptions] = useState<string[]>([]);
  const [purchaserOptions, setPurchaserOptions] = useState<{ initials: string; full_name: string }[]>([]);

  const fetchVendors = useCallback(async () => {
    const { data } = await supabase
      .from("vendors")
      .select("name")
      .eq("active", true)
      .order("name");
    if (data) setVendorOptions(data.map((v: { name: string }) => v.name));
  }, []);

  const fetchPurchasers = useCallback(async () => {
    const { data } = await supabase
      .from("purchasers")
      .select("initials, full_name")
      .eq("active", true)
      .order("full_name");
    if (data) setPurchaserOptions(data as { initials: string; full_name: string }[]);
  }, []);

  const fetchProject = useCallback(async () => {
    const { data, error } = await supabase
      .from("project_summary")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      toast.error("Failed to load project");
      return;
    }
    setProject(data as ProjectSummary);
  }, [projectId]);

  const fetchExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("project_id", projectId)
      .order("date", { ascending: false });

    if (error) {
      toast.error("Failed to load expenses");
      return;
    }
    setExpenses(data as Expense[]);
  }, [projectId]);

  const fetchLaborEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from("labor_entries")
      .select("*")
      .eq("project_id", projectId)
      .order("date", { ascending: false });

    if (error) {
      toast.error("Failed to load labor entries");
      return;
    }
    setLaborEntries(data as LaborEntry[]);
  }, [projectId]);

  const fetchCogsCategories = useCallback(async () => {
    const { data, error } = await supabase
      .from("cogs_categories")
      .select("*");

    if (error) {
      toast.error("Failed to load COGS categories");
      return;
    }
    setCogsCategories(data as CogsCategory[]);
  }, []);

  const fetchActuals = useCallback(async () => {
    if (!projectId) return;
    const { data } = await supabase
      .from("project_actuals")
      .select("category, manual_amount")
      .eq("project_id", projectId);
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((r: { category: string; manual_amount: number | null }) => {
        if (r.manual_amount != null) map[r.category] = r.manual_amount;
      });
      setSavedActuals(map);
    }
  }, [projectId]);

  const checkAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) return;
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", session.user.email)
      .single();
    setIsAdmin(data?.role === "admin");
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchProject(),
      fetchExpenses(),
      fetchLaborEntries(),
      fetchCogsCategories(),
      fetchActuals(),
      checkAdmin(),
      fetchVendors(),
      fetchPurchasers(),
    ]);
    setLoading(false);
  }, [fetchProject, fetchExpenses, fetchLaborEntries, fetchCogsCategories, fetchActuals, checkAdmin, fetchVendors, fetchPurchasers]);

  useEffect(() => {
    if (projectId) {
      fetchAll();
    }
  }, [projectId, fetchAll]);

  // Compute actual spend per budget category from expenses
  function getActualForBudgetField(key: string): number {
    if (key === "budget_hrs") {
      // Labor hours actual comes from labor entries
      return laborEntries.reduce((sum, entry) => sum + entry.hours, 0);
    }
    const categoryMatches = BUDGET_TO_CATEGORY_MAP[key];
    if (!categoryMatches) return 0;
    return expenses
      .filter((exp) =>
        categoryMatches.some(
          (cat) => exp.category?.toLowerCase() === cat.toLowerCase()
        )
      )
      .reduce((sum, exp) => sum + exp.amount, 0);
  }

  async function handleAddExpense() {
    if (!expenseForm.date || !expenseForm.category || !expenseForm.amount) {
      toast.error("Please fill in date, category, and amount");
      return;
    }

    setExpenseSubmitting(true);
    const { error } = await supabase.from("expenses").insert({
      id: "",
      project_id: projectId,
      date: expenseForm.date,
      category: expenseForm.category,
      vendor: expenseForm.vendor || null,
      amount: parseFloat(expenseForm.amount),
      amount_pending: expenseForm.amount_pending,
      purchaser: expenseForm.purchaser || null,
      notes: expenseForm.notes || null,
    });
    setExpenseSubmitting(false);

    if (error) {
      toast.error("Failed to add expense: " + error.message);
      return;
    }

    toast.success("Expense added");
    setExpenseDialogOpen(false);
    setExpenseForm({
      date: new Date().toISOString().split("T")[0],
      category: "",
      vendor: "",
      amount: "",
      amount_pending: false,
      purchaser: "",
      notes: "",
    });
    await Promise.all([fetchExpenses(), fetchProject()]);
  }

  async function handleAddLabor() {
    if (!laborForm.date || !laborForm.person || !laborForm.hours) {
      toast.error("Please fill in date, person, and hours");
      return;
    }

    setLaborSubmitting(true);
    const { error } = await supabase.from("labor_entries").insert({
      project_id: projectId,
      date: laborForm.date,
      person: laborForm.person,
      hours: parseFloat(laborForm.hours),
      labor_type: laborForm.labor_type || null,
      notes: laborForm.notes || null,
    });
    setLaborSubmitting(false);

    if (error) {
      toast.error("Failed to log hours: " + error.message);
      return;
    }

    toast.success("Hours logged");
    setLaborDialogOpen(false);
    setLaborForm({
      date: new Date().toISOString().split("T")[0],
      person: "",
      hours: "",
      labor_type: "",
      notes: "",
    });
    await Promise.all([fetchLaborEntries(), fetchProject()]);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading project...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-muted-foreground">Project not found</p>
        <Link href="/projects">
          <Button variant="outline">Back to Projects</Button>
        </Link>
      </div>
    );
  }

  const pctHrs = project.pct_hrs_used ?? 0;
  const pctBudget = project.pct_budget_used ?? 0;

  async function handleSaveBudget() {
    if (!project) return;
    setBudgetSaving(true);
    // Update budget fields on the project
    const updates: Record<string, number | null> = {};
    for (const field of BUDGET_FIELDS) {
      const val = budgetEdits[field.key];
      if (val !== undefined) updates[field.key] = val === "" ? null : Number(val);
    }
    if (Object.keys(updates).length > 0) {
      await supabase.from("projects").update(updates).eq("id", project.id);
    }
    // Upsert manual actuals
    for (const [category, amountStr] of Object.entries(manualActuals)) {
      const amount = amountStr === "" ? null : Number(amountStr);
      await supabase.from("project_actuals").upsert(
        { project_id: project.id, category, manual_amount: amount, updated_at: new Date().toISOString() },
        { onConflict: "project_id,category" }
      );
    }
    await Promise.all([fetchProject(), fetchActuals()]);
    setEditingBudget(false);
    setBudgetEdits({});
    setManualActuals({});
    setBudgetSaving(false);
    toast.success("Budget updated.");
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <Badge variant={getStatusVariant(project.status)}>
              {project.status}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {project.client && <span>Client: {project.client}</span>}
            {project.pm && <span>PM: {project.pm}</span>}
            {project.close_date && (
              <span>Close: {project.close_date}</span>
            )}
            {project.contract_amount != null && (
              <span>
                Contract: {formatCurrency(project.contract_amount)}
              </span>
            )}
          </div>
        </div>
        <Link href={`/projects/${projectId}/edit`}>
          <Button variant="outline" size="sm">Edit Project</Button>
        </Link>
      </div>

      <Separator />

      {/* Budget Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Budget Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Hours */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Hours Used</span>
                <span className={getBudgetHealthColor(pctHrs)}>
                  {formatNumber(project.total_hrs_used)} /{" "}
                  {formatNumber(project.budget_hrs)} hrs ({pctHrs.toFixed(0)}%)
                </span>
              </div>
              <Progress value={Math.min(pctHrs, 100)} />
            </div>

            {/* Budget Dollars */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">Budget Spent</span>
                <span className={getBudgetHealthColor(pctBudget)}>
                  {formatCurrency(project.total_spent)} /{" "}
                  {formatCurrency(project.total_budget)} ({pctBudget.toFixed(0)}
                  %)
                </span>
              </div>
              <Progress value={Math.min(pctBudget, 100)} />
            </div>
          </div>

          {project.pending_amount > 0 && (
            <p className="text-sm text-muted-foreground">
              Pending expenses: {formatCurrency(project.pending_amount)}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Budget Breakdown Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Budget Breakdown</CardTitle>
          <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCharts(!showCharts)}>
            {showCharts ? "Hide Charts" : "Charts"}
          </Button>
          {isAdmin && !editingBudget && (
            <Button variant="outline" size="sm" onClick={() => {
              // Pre-fill edits with current values
              const fills: Record<string, string> = {};
              for (const field of BUDGET_FIELDS) {
                const val = project[field.key as keyof ProjectSummary] as number | null;
                fills[field.key] = val != null ? String(val) : "";
              }
              setBudgetEdits(fills);
              setManualActuals({});
              setEditingBudget(true);
            }}>
              Edit Budget
            </Button>
          )}
          {editingBudget && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditingBudget(false); setBudgetEdits({}); setManualActuals({}); }}>Cancel</Button>
              <Button size="sm" onClick={handleSaveBudget} disabled={budgetSaving}>{budgetSaving ? "Saving..." : "Save"}</Button>
            </div>
          )}
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Budgeted</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                {editingBudget && <TableHead className="text-right">Manual Override</TableHead>}
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUDGET_FIELDS.map((field) => {
                const budgeted = editingBudget && budgetEdits[field.key] !== undefined
                  ? (budgetEdits[field.key] === "" ? 0 : Number(budgetEdits[field.key]))
                  : ((project[field.key as keyof ProjectSummary] as number) ?? 0);
                const expenseActual = getActualForBudgetField(field.key);
                const manualOverride = savedActuals[field.label] ?? 0;
                const actual = expenseActual + manualOverride;
                const variance = budgeted - actual;
                const varianceColor = variance < 0 ? "text-red-600" : "text-green-600";

                return (
                  <TableRow key={field.key}>
                    <TableCell className="font-medium">
                      {field.label}
                      {field.isHours && (
                        <span className="text-muted-foreground text-xs ml-1">
                          (at ${LABOR_RATE}/hr = {formatCurrency(budgeted * LABOR_RATE)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingBudget ? (
                        <Input
                          type="number"
                          step={field.isHours ? "0.5" : "1"}
                          className="w-28 text-right ml-auto h-7 text-sm"
                          value={budgetEdits[field.key] ?? ""}
                          onChange={(e) => setBudgetEdits((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      ) : (
                        field.isHours ? `${formatNumber(budgeted)} hrs` : formatCurrency(budgeted)
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {field.isHours ? `${formatNumber(actual)} hrs` : formatCurrency(actual)}
                    </TableCell>
                    {editingBudget && (
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="1"
                          placeholder="Manual $"
                          className="w-28 text-right ml-auto h-7 text-sm"
                          value={manualActuals[field.label] ?? (savedActuals[field.label] != null ? String(savedActuals[field.label]) : "")}
                          onChange={(e) => setManualActuals((prev) => ({ ...prev, [field.label]: e.target.value }))}
                        />
                      </TableCell>
                    )}
                    <TableCell className={`text-right ${varianceColor}`}>
                      {field.isHours
                        ? `${variance >= 0 ? "+" : ""}${formatNumber(variance)} hrs`
                        : `${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Budget Charts */}
          {showCharts && (() => {
            const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#6366f1"];

            const barData = BUDGET_FIELDS.map((field) => {
              const budgeted = (project[field.key as keyof ProjectSummary] as number) ?? 0;
              const expenseActual = getActualForBudgetField(field.key);
              const manualOverride = savedActuals[field.label] ?? 0;
              const actual = expenseActual + manualOverride;
              const budgetedDollars = field.isHours ? budgeted * LABOR_RATE : budgeted;
              const actualDollars = field.isHours ? actual * LABOR_RATE : actual;
              return {
                name: field.label.replace("Labor Hours", "Labor Hrs"),
                Budgeted: budgetedDollars,
                Actual: actualDollars,
              };
            });

            const pieData = BUDGET_FIELDS
              .map((field, i) => {
                const expenseActual = getActualForBudgetField(field.key);
                const manualOverride = savedActuals[field.label] ?? 0;
                const actual = expenseActual + manualOverride;
                const dollars = field.isHours ? actual * LABOR_RATE : actual;
                return { name: field.label.replace("Labor Hours", "Labor Hrs"), value: dollars, color: PIE_COLORS[i % PIE_COLORS.length] };
              })
              .filter((d) => d.value > 0);

            const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

            const healthData = BUDGET_FIELDS.map((field) => {
              const budgeted = (project[field.key as keyof ProjectSummary] as number) ?? 0;
              const expenseActual = getActualForBudgetField(field.key);
              const manualOverride = savedActuals[field.label] ?? 0;
              const actual = expenseActual + manualOverride;
              const budgetedVal = field.isHours ? budgeted * LABOR_RATE : budgeted;
              const actualVal = field.isHours ? actual * LABOR_RATE : actual;
              const pct = budgetedVal > 0 ? (actualVal / budgetedVal) * 100 : 0;
              return {
                name: field.label.replace("Labor Hours", "Labor Hrs"),
                pct,
                actual: actualVal,
                budgeted: budgetedVal,
              };
            });

            return (
              <div className="border-t border-border px-6 py-6 space-y-8">
                {/* Chart 1: Budget vs Actual */}
                <div>
                  <h3 className="text-sm font-semibold mb-4">Budget vs Actual</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Legend />
                      <Bar dataKey="Budgeted" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                      <Bar dataKey="Actual" fill="#10b981" radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart 2: Spend Breakdown Pie */}
                <div>
                  <h3 className="text-sm font-semibold mb-4">Spend Breakdown</h3>
                  {pieData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No spend recorded yet</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={110}
                          dataKey="value"
                          label={({ name, value }) => `${name} ${((value / pieTotal) * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {pieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Chart 3: Budget Health Progress Bars */}
                <div>
                  <h3 className="text-sm font-semibold mb-4">Budget Health</h3>
                  <div className="space-y-3">
                    {healthData.map((item) => {
                      const pct = Math.min(item.pct, 150);
                      const barColor =
                        item.pct >= 100 ? "bg-red-500" : item.pct >= 80 ? "bg-yellow-500" : "bg-green-500";
                      return (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className="text-xs w-28 text-right shrink-0 text-muted-foreground">{item.name}</span>
                          <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${Math.min((pct / 150) * 100, 100)}%` }}
                            />
                          </div>
                          <span className={`text-xs w-14 text-right font-mono ${item.pct >= 100 ? "text-red-600" : item.pct >= 80 ? "text-yellow-600" : "text-green-600"}`}>
                            {item.budgeted > 0 ? `${item.pct.toFixed(0)}%` : "--"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Expenses & Labor Card */}
      <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-0">
            <div className="flex gap-0 -mb-px">
              <button
                onClick={() => setActiveExpenseTab("expenses")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeExpenseTab === "expenses" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Expenses
              </button>
              <button
                onClick={() => setActiveExpenseTab("labor")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeExpenseTab === "labor" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                Labor
              </button>
            </div>
            <div className="pb-2">
              {activeExpenseTab === "expenses" ? (
                  <Dialog
                    open={expenseDialogOpen}
                    onOpenChange={setExpenseDialogOpen}
                  >
                    <DialogTrigger
                      render={<Button size="sm" />}
                    >
                      + Add Expense
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Expense</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="expense-date">Date</Label>
                          <Input
                            id="expense-date"
                            type="date"
                            value={expenseForm.date}
                            onChange={(e) =>
                              setExpenseForm({
                                ...expenseForm,
                                date: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Category</Label>
                          <Select
                            value={expenseForm.category}
                            onValueChange={(val) =>
                              setExpenseForm({
                                ...expenseForm,
                                category: val as string,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {cogsCategories.map((cat) => (
                                <SelectItem key={cat.code} value={cat.name}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label>Vendor</Label>
                          <Combobox
                            options={vendorOptions}
                            value={expenseForm.vendor}
                            onChange={(val) =>
                              setExpenseForm({
                                ...expenseForm,
                                vendor: val,
                              })
                            }
                            placeholder="Vendor name"
                            allowCustom
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-amount">Amount</Label>
                          <Input
                            id="expense-amount"
                            type="number"
                            step="0.01"
                            value={expenseForm.amount}
                            onChange={(e) =>
                              setExpenseForm({
                                ...expenseForm,
                                amount: e.target.value,
                              })
                            }
                            placeholder="0.00"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="expense-pending"
                            type="checkbox"
                            checked={expenseForm.amount_pending}
                            onChange={(e) =>
                              setExpenseForm({
                                ...expenseForm,
                                amount_pending: e.target.checked,
                              })
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <Label htmlFor="expense-pending">Pending</Label>
                        </div>
                        <div className="grid gap-2">
                          <Label>Purchaser</Label>
                          <Combobox
                            options={purchaserOptions.map(
                              (p) => `${p.initials} - ${p.full_name}`
                            )}
                            value={expenseForm.purchaser}
                            onChange={(val) =>
                              setExpenseForm({
                                ...expenseForm,
                                purchaser: val.split(" - ")[0],
                              })
                            }
                            placeholder="Who made the purchase"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="expense-notes">Notes</Label>
                          <Textarea
                            id="expense-notes"
                            value={expenseForm.notes}
                            onChange={(e) =>
                              setExpenseForm({
                                ...expenseForm,
                                notes: e.target.value,
                              })
                            }
                            placeholder="Optional notes"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setExpenseDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddExpense}
                          disabled={expenseSubmitting}
                        >
                          {expenseSubmitting ? "Adding..." : "Add Expense"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
              ) : (
                <Dialog open={laborDialogOpen} onOpenChange={setLaborDialogOpen}>
                  <DialogTrigger render={<Button size="sm" />}>+ Log Hours</DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Log Hours</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="labor-date">Date</Label>
                        <Input id="labor-date" type="date" value={laborForm.date} onChange={(e) => setLaborForm({ ...laborForm, date: e.target.value })} />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="labor-person">Person</Label>
                        <Input id="labor-person" value={laborForm.person} onChange={(e) => setLaborForm({ ...laborForm, person: e.target.value })} placeholder="Name" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="labor-hours">Hours</Label>
                        <Input id="labor-hours" type="number" step="0.25" value={laborForm.hours} onChange={(e) => setLaborForm({ ...laborForm, hours: e.target.value })} placeholder="0" />
                      </div>
                      <div className="grid gap-2">
                        <Label>Type</Label>
                        <Select value={laborForm.labor_type} onValueChange={(val) => setLaborForm({ ...laborForm, labor_type: val ?? "" })}>
                          <SelectTrigger className="w-full"><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>{LABOR_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="labor-notes">Notes</Label>
                        <Textarea id="labor-notes" value={laborForm.notes} onChange={(e) => setLaborForm({ ...laborForm, notes: e.target.value })} placeholder="Optional notes" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setLaborDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleAddLabor} disabled={laborSubmitting}>{laborSubmitting ? "Logging..." : "Log Hours"}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {activeExpenseTab === "expenses" ? (
              expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>
                  <p className="text-sm">No expenses recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Purchaser</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell className="whitespace-nowrap">{new Date(expense.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell>{expense.vendor ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(expense.amount)}</TableCell>
                        <TableCell>{expense.amount_pending ? <Badge variant="outline">Pending</Badge> : <Badge variant="secondary">Confirmed</Badge>}</TableCell>
                        <TableCell>{expense.purchaser ?? "-"}</TableCell>
                        <TableCell className="max-w-48 truncate text-muted-foreground">{expense.notes ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              laborEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <p className="text-sm">No labor entries recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Person</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {laborEntries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap">{new Date(entry.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</TableCell>
                        <TableCell>{entry.person}</TableCell>
                        <TableCell className="text-right">{formatNumber(entry.hours)}</TableCell>
                        <TableCell>{entry.labor_type ?? "-"}</TableCell>
                        <TableCell className="max-w-48 truncate text-muted-foreground">{entry.notes ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            )}
          </CardContent>
        </Card>
    </div>
  );
}
