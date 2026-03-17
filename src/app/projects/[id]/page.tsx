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

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchProject(),
      fetchExpenses(),
      fetchLaborEntries(),
      fetchCogsCategories(),
    ]);
    setLoading(false);
  }, [fetchProject, fetchExpenses, fetchLaborEntries, fetchCogsCategories]);

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
        <CardHeader>
          <CardTitle>Budget Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Budgeted</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUDGET_FIELDS.map((field) => {
                const budgeted =
                  (project[field.key as keyof ProjectSummary] as number) ?? 0;
                const actual = getActualForBudgetField(field.key);

                let budgetedDisplay: string;
                let actualDisplay: string;
                let variance: number;

                if (field.isHours) {
                  // Show hours, then dollar equivalent
                  budgetedDisplay = `${formatNumber(budgeted)} hrs`;
                  actualDisplay = `${formatNumber(actual)} hrs`;
                  variance = budgeted - actual;
                } else {
                  budgetedDisplay = formatCurrency(budgeted);
                  actualDisplay = formatCurrency(actual);
                  variance = budgeted - actual;
                }

                const varianceColor =
                  variance < 0 ? "text-red-600" : "text-green-600";

                return (
                  <TableRow key={field.key}>
                    <TableCell className="font-medium">
                      {field.label}
                      {field.isHours && (
                        <span className="text-muted-foreground text-xs ml-1">
                          (at ${LABOR_RATE}/hr ={" "}
                          {formatCurrency(budgeted * LABOR_RATE)})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {budgetedDisplay}
                    </TableCell>
                    <TableCell className="text-right">
                      {actualDisplay}
                    </TableCell>
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
        </CardContent>
      </Card>

      {/* Expenses & Labor Card */}
      <Tabs defaultValue="expenses">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-0">
            <TabsList className="h-auto bg-transparent p-0 border-b w-full">
              <TabsTrigger value="expenses" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 py-2 -mb-px font-medium">Expenses</TabsTrigger>
              <TabsTrigger value="labor" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 py-2 -mb-px font-medium">Labor</TabsTrigger>
              <div className="ml-auto flex items-center -mb-px pb-2">
                <TabsContent value="expenses" className="mt-0 p-0">
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
                          <Label htmlFor="expense-vendor">Vendor</Label>
                          <Input
                            id="expense-vendor"
                            value={expenseForm.vendor}
                            onChange={(e) =>
                              setExpenseForm({
                                ...expenseForm,
                                vendor: e.target.value,
                              })
                            }
                            placeholder="Vendor name"
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
                          <Label htmlFor="expense-purchaser">Purchaser</Label>
                          <Input
                            id="expense-purchaser"
                            value={expenseForm.purchaser}
                            onChange={(e) =>
                              setExpenseForm({
                                ...expenseForm,
                                purchaser: e.target.value,
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
                </TabsContent>
                <TabsContent value="labor" className="mt-0 p-0">
                  <Dialog
                    open={laborDialogOpen}
                    onOpenChange={setLaborDialogOpen}
                  >
                    <DialogTrigger
                      render={<Button size="sm" />}
                    >
                      + Log Hours
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Log Hours</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="labor-date">Date</Label>
                          <Input
                            id="labor-date"
                            type="date"
                            value={laborForm.date}
                            onChange={(e) =>
                              setLaborForm({
                                ...laborForm,
                                date: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="labor-person">Person</Label>
                          <Input
                            id="labor-person"
                            value={laborForm.person}
                            onChange={(e) =>
                              setLaborForm({
                                ...laborForm,
                                person: e.target.value,
                              })
                            }
                            placeholder="Name"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="labor-hours">Hours</Label>
                          <Input
                            id="labor-hours"
                            type="number"
                            step="0.25"
                            value={laborForm.hours}
                            onChange={(e) =>
                              setLaborForm({
                                ...laborForm,
                                hours: e.target.value,
                              })
                            }
                            placeholder="0"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label>Type</Label>
                          <Select
                            value={laborForm.labor_type}
                            onValueChange={(val) =>
                              setLaborForm({
                                ...laborForm,
                                labor_type: val as string,
                              })
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              {LABOR_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {type}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="labor-notes">Notes</Label>
                          <Textarea
                            id="labor-notes"
                            value={laborForm.notes}
                            onChange={(e) =>
                              setLaborForm({
                                ...laborForm,
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
                          onClick={() => setLaborDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          onClick={handleAddLabor}
                          disabled={laborSubmitting}
                        >
                          {laborSubmitting ? "Logging..." : "Log Hours"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </TabsContent>
              </div>
            </TabsList>
          </CardHeader>
          <CardContent>
            {/* Expenses Tab */}
            <TabsContent value="expenses" className="mt-0">
              {expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No expenses recorded yet
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Pending?</TableHead>
                      <TableHead>Purchaser</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => (
                      <TableRow key={expense.id}>
                        <TableCell>{expense.date}</TableCell>
                        <TableCell>{expense.category}</TableCell>
                        <TableCell>{expense.vendor ?? "-"}</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(expense.amount)}
                        </TableCell>
                        <TableCell>
                          {expense.amount_pending ? (
                            <Badge variant="outline">Pending</Badge>
                          ) : (
                            "No"
                          )}
                        </TableCell>
                        <TableCell>{expense.purchaser ?? "-"}</TableCell>
                        <TableCell className="max-w-48 truncate">
                          {expense.notes ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Labor Tab */}
            <TabsContent value="labor" className="mt-0">
              {laborEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No labor entries recorded yet
                </p>
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
                        <TableCell>{entry.date}</TableCell>
                        <TableCell>{entry.person}</TableCell>
                        <TableCell className="text-right">
                          {formatNumber(entry.hours)}
                        </TableCell>
                        <TableCell>{entry.labor_type ?? "-"}</TableCell>
                        <TableCell className="max-w-48 truncate">
                          {entry.notes ?? "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
