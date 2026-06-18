"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  ProjectSummary,
  Expense,
  LaborEntry,
  QboLaborEntry,
  CogsCategory,
  getPMName,
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Pencil, Trash2, Flag, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
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
import { ProjectLinkIcons } from "@/components/project-link-icons";
import { CountdownClock } from "@/components/countdown-clock";
import { MondayButton } from "@/components/monday-button";
import { QboLaborTable } from "@/components/qbo-labor-table";
import { useAdminView } from "@/components/admin-view-provider";
import { todayCentral, formatDateCentral, formatDateTimeCentral } from "@/lib/date-utils";
import { getBillcomExpenseDisplayDetails } from "@/lib/billcom-expense-display";
import {
  buildBudgetBreakdownTotal,
  getSkuChipClassName,
  stripUnsupportedProjectFields,
  type QuoteLineBudgetAllocationRow,
} from "@/lib/project-rebaseline";
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

// Map budget field keys to expense/COGS category names
// Based on HubSpot SKUs and COGS codes — confirmed with Paul & Emily 2026-03-27
const BUDGET_TO_CATEGORY_MAP: Record<string, string[]> = {
  // Labor: internal production labor (tracked via labor_entries, but also COGS 500100)
  budget_hrs: ["Production Labor"],
  // Materials: fabrication and fab supplies only (crating is separate)
  budget_materials: [
    "Fabrication",                       // HubSpot 400100 / COGS 500200
    "Fab Supplies and Small Equipment",  // COGS 501200
  ],
  // Design: design work only (graphics = flooring substrate per Paul)
  budget_design: [
    "Design",                            // HubSpot 400700 / COGS 501300
    "Design, Engineering, CAD",          // HubSpot 400701
    "Design Labor",                      // COGS 500700
  ],
  // Project Management: PM, admin, show prep, site services
  budget_pm: [
    "Project Management",                // HubSpot 409001
    "Admin",                             // HubSpot 409000
    "Show Prep",                         // HubSpot 400600 / COGS 501000
    "Receiving Client Items",            // HubSpot 400607
    "AV - Programming",                  // HubSpot 400608
    "AV Programming",
    "Assemble/Build Client Items",       // HubSpot 400609
    "Prep, Pack, Crate or Palletize",    // HubSpot 400610
    "Disposal",                          // HubSpot 400611
  ],
  // Shipping: freight, trucks, storage
  budget_shipping: [
    "Shipping",                          // HubSpot 400400 / COGS 500400
    "Shipping/Delivery - 53' Truck",     // HubSpot 400402
    "Shipping/Delivery - 30' Truck",     // HubSpot 400403
    "Shipping/Trucking",                 // COGS 500400
    "Fuel Costs",                        // COGS 500450
    "Storage",                           // HubSpot 400500/400501 / COGS 500500
  ],
  // Crating: separate from materials and shipping
  budget_crating: [
    "Custom Crating",                    // HubSpot 400404
  ],
  // I&D Labor: third-party install/dismantle labor only
  budget_id_labor: [
    "Install/Strike",                    // HubSpot 400300 / COGS 501400
    "Installation - Labor (Standard Time)", // HubSpot 400303
    "Lead Installer - Install",          // HubSpot 400306
    "Lead Installer - Dismantle",        // HubSpot 400305
    "Dismantle - Labor (Standard time)", // HubSpot 400311
    "I&D Labor",                         // COGS 500150
  ],
  // Travel: all travel variants + meals
  budget_travel: [
    "Travel",                            // HubSpot 400900 / COGS 505000
    "Travel - Project Manager",          // HubSpot 400901
    "Travel - Project Manager - Install",// HubSpot 400902
    "Travel - Project Manager - Dismantle", // HubSpot 400903
    "Travel - Lead Installer - Dismantle",  // HubSpot 400908
    "Travel - Lead Installer - Install",    // HubSpot 400909
    "Travel-Hotels",                     // COGS 500510
    "Travel-Per Diem",                   // COGS 500520
    "Travel-Airfare & Baggage Fees",     // COGS 500530
    "Production Meals",                  // COGS 501500
  ],
  // Equipment: on-site services (non-labor), rentals, machinery
  budget_equipment: [
    "On-site Show Services",             // HubSpot 400200 / COGS 500300
    "Rental",                            // HubSpot 408000 — wait, Rental → Props per Joe
    "Forklifts and Trucks",              // COGS 500900
    "Machinery Repairs & Maintenance",   // COGS 501700
  ],
  // Props/Decor: props and decor items
  budget_props: [
    "Props/Decor",                       // COGS 505001
  ],
  // Rental: equipment and item rentals
  budget_rental: [
    "Rental",                            // HubSpot 408000 / COGS 500800
  ],
  // Flooring: custom printed marley/carpet = goes under Graphics per Paul
  budget_flooring: [
    "Graphics",                          // HubSpot 400800 / COGS 500600
  ],
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

function getBillBudgetStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "created":
      return "Created";
    case "created_with_member_warning":
      return "Created with member warning";
    case "already_seeded":
      return "Already seeded";
    case "no_bill_managed_budget_default":
      return "Skipped: no travel/props budget";
    case "error":
      return "Create failed";
    default:
      return status ?? "Not started";
  }
}

function getBillBudgetStatusVariant(
  status: string | null | undefined
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "created":
    case "already_seeded":
      return "secondary";
    case "created_with_member_warning":
      return "outline";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const { effectiveIsAdmin, setActualIsAdmin } = useAdminView();

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
  const [expandedBudgetRow, setExpandedBudgetRow] = useState<string | null>(null);
  const [showQuoteAllocation, setShowQuoteAllocation] = useState(false);
  const [rebaselineSaving, setRebaselineSaving] = useState(false);
  const [billBudgetCreating, setBillBudgetCreating] = useState(false);
  const [quoteAllocationRows, setQuoteAllocationRows] = useState<QuoteLineBudgetAllocationRow[]>([]);
  const [quoteAllocationTotals, setQuoteAllocationTotals] = useState({
    line_total: 0,
    labor_budget: 0,
    material_budget: 0,
    non_lm_budget: 0,
  });
  const [quoteAllocationLoading, setQuoteAllocationLoading] = useState(false);
  const [quoteAllocationError, setQuoteAllocationError] = useState<string | null>(null);

  // Expense form state
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    date: todayCentral(),
    category: "",
    vendor: "",
    amount: "",
    amount_pending: false,
    purchaser: "",
    notes: "",
  });
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [flaggingExpense, setFlaggingExpense] = useState<Expense | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [expandedBillcomExpenseRows, setExpandedBillcomExpenseRows] = useState<Set<string>>(new Set());

  // QBO Labor state
  const [qboLaborEntries, setQboLaborEntries] = useState<QboLaborEntry[]>([]);
  const [laborSyncing, setLaborSyncing] = useState(false);
  const [laborView, setLaborView] = useState<"employee" | "date">("employee");
  const [laborDateFilter, setLaborDateFilter] = useState<"all" | "week" | "month" | "custom">("all");
  const [laborCustomStart, setLaborCustomStart] = useState("");
  const [laborCustomEnd, setLaborCustomEnd] = useState("");
  const [expandedLaborRows, setExpandedLaborRows] = useState<Set<string>>(new Set());

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

  const fetchQuoteAllocation = useCallback(async () => {
    if (!projectId) return;

    setQuoteAllocationLoading(true);
    setQuoteAllocationError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/quote-allocation`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Failed to load quote allocation");
      }

      setQuoteAllocationRows((result.rows as QuoteLineBudgetAllocationRow[]) ?? []);
      setQuoteAllocationTotals(result.totals ?? {
        line_total: 0,
        labor_budget: 0,
        material_budget: 0,
        non_lm_budget: 0,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load quote allocation";
      setQuoteAllocationRows([]);
      setQuoteAllocationTotals({
        line_total: 0,
        labor_budget: 0,
        material_budget: 0,
        non_lm_budget: 0,
      });
      setQuoteAllocationError(message);
    } finally {
      setQuoteAllocationLoading(false);
    }
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

  const fetchQboLabor = useCallback(async () => {
    const { data, error } = await supabase
      .from("qbo_labor_entries")
      .select("*")
      .eq("project_id", projectId)
      .order("date", { ascending: false });

    if (error) {
      console.error("Failed to load QBO labor entries:", error);
      return;
    }
    setQboLaborEntries((data as QboLaborEntry[]) ?? []);
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
    setCurrentUserEmail(session.user.email);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", session.user.email)
      .single();
    const admin = data?.role === "admin";
    setIsAdmin(admin);
    setActualIsAdmin(admin);
  }, [setActualIsAdmin]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchProject(),
      fetchExpenses(),
      fetchLaborEntries(),
      fetchQboLabor(),
      fetchCogsCategories(),
      fetchActuals(),
      checkAdmin(),
      fetchVendors(),
      fetchPurchasers(),
      fetchQuoteAllocation(),
    ]);
    setLoading(false);
  }, [fetchProject, fetchExpenses, fetchLaborEntries, fetchQboLabor, fetchCogsCategories, fetchActuals, checkAdmin, fetchVendors, fetchPurchasers, fetchQuoteAllocation]);

  useEffect(() => {
    if (projectId) {
      fetchAll();
    }
  }, [projectId, fetchAll]);

  // Compute actual spend per budget category from expenses
  function getActualForBudgetField(key: string): number {
    if (key === "budget_hrs") {
      // Labor hours: QBO labor entries (reg + OT) + manual labor entries
      const qboHrs = qboLaborEntries.reduce((sum, e) => sum + e.reg_hours + e.ot_hours, 0);
      const manualHrs = laborEntries.reduce((sum, entry) => sum + entry.hours, 0);
      return qboHrs + manualHrs;
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

  async function handleRebaselineFromQuote() {
    if (!project) return;
    if (!isAdmin) {
      toast.error("Only admins can rebaseline projects.");
      return;
    }
    setRebaselineSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/rebaseline`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to rebaseline budgets");
      }
      await Promise.all([fetchProject(), fetchQuoteAllocation()]);
      toast.success("Budgets rebaselined from stored quote values.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rebaseline budgets";
      toast.error(message);
    } finally {
      setRebaselineSaving(false);
    }
  }

  async function handleCreateBillBudget() {
    if (!project) return;
    if (!isAdmin) {
      toast.error("Only admins can create BILL budgets.");
      return;
    }
    if (project.bill_budget_uuid) {
      toast.error("This project already has a BILL budget.");
      return;
    }

    setBillBudgetCreating(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/bill-budget`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Failed to create BILL budget");
      }
      await fetchProject();
      if (result?.result?.status === "created_with_member_warning") {
        toast.success("BILL budget created. PM assignment needs attention.");
      } else {
        toast.success("BILL budget created.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create BILL budget";
      toast.error(message);
      await fetchProject();
    } finally {
      setBillBudgetCreating(false);
    }
  }

  async function handleAddExpense() {
    if (!expenseForm.date || !expenseForm.category || !expenseForm.amount) {
      toast.error("Please fill in date, category, and amount");
      return;
    }

    setExpenseSubmitting(true);
    const { error } = await supabase.from("expenses").insert({
      id: crypto.randomUUID(),
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
      date: todayCentral(),
      category: "",
      vendor: "",
      amount: "",
      amount_pending: false,
      purchaser: "",
      notes: "",
    });
    await Promise.all([fetchExpenses(), fetchProject()]);
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
    fetchProject();
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

  function toggleBillcomExpenseDetails(id: string) {
    setExpandedBillcomExpenseRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSyncLabor() {
    setLaborSyncing(true);
    try {
      const response = await fetch("/api/qbo/sync-labor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error("Sync failed: " + (result.error ?? "Unknown error"));
      } else {
        toast.success(`Synced ${result.synced} time entries from QBO`);
        await Promise.all([fetchQboLabor(), fetchProject()]);
      }
    } catch {
      toast.error("Sync request failed");
    }
    setLaborSyncing(false);
  }

  function toggleLaborRow(key: string) {
    setExpandedLaborRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Filter QBO labor entries by date range
  function getFilteredQboLabor(): QboLaborEntry[] {
    const now = new Date();
    return qboLaborEntries.filter((e) => {
      if (laborDateFilter === "all") return true;
      const d = new Date(e.date);
      if (laborDateFilter === "week") {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        return d >= weekAgo;
      }
      if (laborDateFilter === "month") {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      if (laborDateFilter === "custom") {
        if (laborCustomStart && d < new Date(laborCustomStart)) return false;
        if (laborCustomEnd && d > new Date(laborCustomEnd)) return false;
        return true;
      }
      return true;
    });
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
    if (!isAdmin) {
      toast.error("Only admins can edit project budgets.");
      return;
    }
    setBudgetSaving(true);
    // Update budget fields on the project
    const updates: Record<string, number | null> = {};
    for (const field of BUDGET_FIELDS) {
      const val = budgetEdits[field.key];
      if (val !== undefined) updates[field.key] = val === "" ? null : Number(val);
    }
    if (Object.keys(updates).length > 0) {
      const payload = stripUnsupportedProjectFields(updates);
      await supabase.from("projects").update(payload).eq("id", project.id);
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
            <ProjectLinkIcons
              hubspotUrl={project.hubspot_deal_url}
              qboUrl={project.qbo_project_url}
            />
            {project.job_number && (
              <MondayButton
                jobNumber={project.job_number}
                projectId={project.id}
                cachedBoardUrl={(project as unknown as Record<string, string>).monday_board_url}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {project.job_number && <span className="font-medium text-foreground">Job #{project.job_number}</span>}
            {project.client && <span>Client: {project.client}</span>}
            {project.pm && <span>PM: {getPMName(project.pm)}</span>}
            {project.contract_amount != null && (
              <span>Contract: {formatCurrency(project.contract_amount)}</span>
            )}
            {project.close_date && (
              <span>Closed: {project.close_date}</span>
            )}
          </div>
          {(project as unknown as Record<string, string>).due_date && (
            <CountdownClock
              dueDate={(project as unknown as Record<string, string>).due_date}
              closeDate={project.close_date ?? undefined}
            />
          )}
          {project.notes && (
            <details className="mt-1 group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1 select-none">
                <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium">Notes</span>
              </summary>
              <div className="mt-1.5 px-3 py-2 bg-muted/50 rounded-md text-sm text-muted-foreground border border-border">
                {project.notes}
              </div>
            </details>
          )}
        </div>
        {effectiveIsAdmin && (
          <Link href={`/projects/${projectId}/edit`}>
            <Button variant="outline" size="sm">Edit Project</Button>
          </Link>
        )}
      </div>

      <Separator />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>BILL Budget</CardTitle>
            <p className="text-sm text-muted-foreground">
              Paul owns the budget by default. The project PM is assigned after create when a BILL user match is available.
            </p>
          </div>
          {effectiveIsAdmin && !project.bill_budget_uuid && (
            <Button size="sm" onClick={handleCreateBillBudget} disabled={billBudgetCreating}>
              {billBudgetCreating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create BILL Budget"
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={getBillBudgetStatusVariant(project.bill_budget_last_sync_status)}>
              {getBillBudgetStatusLabel(project.bill_budget_last_sync_status)}
            </Badge>
            {project.bill_budget_uuid && (
              <span className="text-muted-foreground">UUID: {project.bill_budget_uuid}</span>
            )}
            <span className="text-muted-foreground">
              BILL-managed total: {formatCurrency(project.bill_budget_total_snapshot ?? 0)}
            </span>
            {project.bill_budget_seed_source && (
              <span className="text-muted-foreground">Source: {project.bill_budget_seed_source}</span>
            )}
          </div>
          {project.bill_budget_name && (
            <p className="text-muted-foreground">Budget name: {project.bill_budget_name}</p>
          )}
          {project.bill_budget_seeded_at && (
            <p className="text-muted-foreground">
              Created: {formatDateTimeCentral(project.bill_budget_seeded_at)}
            </p>
          )}
          {project.bill_budget_last_sync_error && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
              {project.bill_budget_last_sync_error}
            </div>
          )}
          {!project.bill_budget_uuid && project.bill_budget_last_sync_status === "no_bill_managed_budget_default" && (
            <p className="text-muted-foreground">
              No BILL budget was auto-created because travel + props currently total {formatCurrency(project.bill_budget_total_snapshot ?? 0)}.
              Update those project budgets, then use Create BILL Budget.
            </p>
          )}
        </CardContent>
      </Card>

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

      {/* Projected P&L Card */}
      {project.contract_amount != null && (() => {
        const laborCost = project.qbo_labor_cost ?? 0;
        // Expense cost = sum of all non-labor actuals from Budget Breakdown (expense + manual overrides)
        // Design and PM default to 100% of budget unless manually overridden
        const AUTO_FULL_FIELDS_PNL = ["budget_design", "budget_pm"];
        const expenseCost = BUDGET_FIELDS
          .filter((f) => !f.isHours)
          .reduce((sum, f) => {
            const budgeted = (project[f.key as keyof ProjectSummary] as number) ?? 0;
            const expenseActual = getActualForBudgetField(f.key);
            const manualOverride = savedActuals[f.label] ?? 0;
            const hasManualOverride = savedActuals[f.label] != null;
            const actual = AUTO_FULL_FIELDS_PNL.includes(f.key) && !hasManualOverride
              ? budgeted
              : expenseActual + manualOverride;
            return sum + actual;
          }, 0);
        const totalCost = laborCost + expenseCost;
        const pnl = project.contract_amount - totalCost;
        const marginPct = project.contract_amount > 0 ? (pnl / project.contract_amount) * 100 : 0;
        const isProfitable = pnl >= 0;
        return (
          <Card className={isProfitable ? "border-emerald-200" : "border-red-200"}>
            <CardHeader>
              <CardTitle>P&amp;L to Date</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Contract Value</p>
                  <p className="text-xl font-bold">{formatCurrency(project.contract_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Labor Cost</p>
                  <p className="text-xl font-bold">{formatCurrency(laborCost)}</p>
                  <p className="text-xs text-muted-foreground">{(project.qbo_total_hours ?? 0).toFixed(1)} hrs @ ${LABOR_RATE}/hr</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Expense Cost</p>
                  <p className="text-xl font-bold">{formatCurrency(expenseCost)}</p>
                  <p className="text-xs text-muted-foreground">Materials &amp; other</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">P&amp;L to Date</p>
                  <p className={`text-2xl font-bold ${isProfitable ? "text-emerald-600" : "text-red-600"}`}>
                    {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                  </p>
                  <p className={`text-sm font-medium ${isProfitable ? "text-emerald-600" : "text-red-600"}`}>
                    {marginPct.toFixed(1)}% margin
                  </p>
                </div>
              </div>
              {!isProfitable && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400 font-medium">
                    ⚠️ This project is currently in the red by {formatCurrency(Math.abs(pnl))}.
                    Total cost to date ({formatCurrency(totalCost)}) exceeds contract value ({formatCurrency(project.contract_amount)}).
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Flagged Costs Card */}
      {expenses.filter((e) => e.flagged).length > 0 && (() => {
        const flagged = expenses.filter((e) => e.flagged);
        const flaggedTotal = flagged.reduce((s, e) => s + e.amount, 0);
        return (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
            <CardContent className="py-4 px-6 flex items-center gap-4">
              <span className="text-lg">🚩</span>
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-400">Flagged Costs</p>
                <p className="text-xs text-red-600 dark:text-red-500">{flagged.length} item{flagged.length !== 1 ? "s" : ""}</p>
              </div>
              <p className="ml-auto text-xl font-bold text-red-700 dark:text-red-400">{formatCurrency(flaggedTotal)}</p>
            </CardContent>
          </Card>
        );
      })()}

      {/* Budget Breakdown Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Budget Breakdown</CardTitle>
          <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowCharts(!showCharts)}>
            {showCharts ? "Hide Charts" : "Charts"}
          </Button>
          {effectiveIsAdmin && !editingBudget && (
            <>
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
              <Button variant="outline" size="sm" onClick={handleRebaselineFromQuote} disabled={rebaselineSaving}>
                {rebaselineSaving ? "Rebaselining..." : "Rebaseline from Quote"}
              </Button>
            </>
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
                {effectiveIsAdmin && <TableHead className="text-right">Quote Total</TableHead>}
                <TableHead className="text-right">Budgeted</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                {editingBudget && <TableHead className="text-right">Manual Override</TableHead>}
                <TableHead className="text-right">Variance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUDGET_FIELDS.map((field) => {
                // Use stored value; if null, fall back to derived value from contract amount (for legacy spreadsheet-synced projects)
                const storedVal = project[field.key as keyof ProjectSummary] as number | null;
                const fallbackVal = (() => {
                  if (storedVal != null) return storedVal;
                  if (!project.contract_amount) return 0;
                  if (field.key === "budget_materials") return Math.round(project.contract_amount * 0.25);
                  if (field.key === "budget_hrs") return Math.round(project.contract_amount * 0.25 / LABOR_RATE);
                  return 0;
                })();
                const budgeted = editingBudget && budgetEdits[field.key] !== undefined
                  ? (budgetEdits[field.key] === "" ? 0 : Number(budgetEdits[field.key]))
                  : fallbackVal;
                const expenseActual = getActualForBudgetField(field.key);
                const manualOverride = savedActuals[field.label] ?? 0;
                // Design and PM always default to 100% of budget unless manually overridden
                const AUTO_FULL_FIELDS = ["budget_design", "budget_pm"];
                const hasManualOverride = savedActuals[field.label] != null;
                const actual = AUTO_FULL_FIELDS.includes(field.key) && !hasManualOverride
                  ? budgeted
                  : expenseActual + manualOverride;
                const total = buildBudgetBreakdownTotal(project, field.key);
                const variance = budgeted - actual;
                const varianceColor = variance < 0 ? "text-red-600" : "text-green-600";

                // Build drill-down items for this row
                const isExpanded = expandedBudgetRow === field.key;
                const isAutoFull = AUTO_FULL_FIELDS.includes(field.key) && !hasManualOverride;

                // Line items shown in the accordion
                const drillExpenses = field.isHours
                  ? [] // labor handled separately
                  : (() => {
                      const cats = BUDGET_TO_CATEGORY_MAP[field.key];
                      if (!cats) return [];
                      return expenses.filter((exp) =>
                        cats.some((cat) => exp.category?.toLowerCase() === cat.toLowerCase())
                      );
                    })();

                // Actual labor cost using per-entry rates (QBO) or $30/hr fallback (manual)
                const actualLaborDollars = field.isHours
                  ? qboLaborEntries.reduce((sum, e) => sum + (e.reg_hours + e.ot_hours) * e.hourly_rate, 0)
                    + laborEntries.reduce((sum, e) => sum + e.hours * LABOR_RATE, 0)
                  : 0;

                const drillLaborEntries = field.isHours
                  ? [...qboLaborEntries.map((e) => ({
                      date: e.date,
                      description: e.employee_name,
                      amount: (e.reg_hours + e.ot_hours) * e.hourly_rate,
                      detail: `${(e.reg_hours + e.ot_hours).toFixed(1)} hrs @ $${e.hourly_rate}/hr`,
                    })),
                    ...laborEntries.map((e) => ({
                      date: e.date,
                      description: e.person ?? "Manual",
                      amount: e.hours * LABOR_RATE,
                      detail: `${e.hours} hrs (manual @ $${LABOR_RATE}/hr)`,
                    }))]
                  : [];

                const hasDrillItems = field.isHours
                  ? drillLaborEntries.length > 0
                  : drillExpenses.length > 0 || isAutoFull;

                return (
                  <>
                    <TableRow
                      key={field.key}
                      className={hasDrillItems ? "cursor-pointer hover:bg-muted/50" : ""}
                      onClick={() => {
                        if (!hasDrillItems) return;
                        setExpandedBudgetRow(isExpanded ? null : field.key);
                      }}
                    >
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-1">
                          {hasDrillItems ? (
                            isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          ) : (
                            <span className="w-3.5 shrink-0" />
                          )}
                          {field.label}
                          {field.isHours && (
                            <span className="text-muted-foreground text-xs ml-1">
                              @ ${LABOR_RATE}/hr
                            </span>
                          )}
                        </span>
                      </TableCell>
                      {effectiveIsAdmin && (
                        <TableCell className="text-right">
                          {field.isHours ? (
                            <span className="font-mono">{formatCurrency(total)}</span>
                          ) : formatCurrency(total)}
                        </TableCell>
                      )}
                      <TableCell className="text-right">
                        {editingBudget ? (
                          <Input
                            type="number"
                            step={field.isHours ? "0.5" : "1"}
                            className="w-28 text-right ml-auto h-7 text-sm"
                            value={budgetEdits[field.key] ?? ""}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setBudgetEdits((prev) => ({ ...prev, [field.key]: e.target.value }))}
                          />
                        ) : field.isHours ? (
                          <span>
                            <span className="font-mono">{formatNumber(budgeted)} hrs</span>
                            <span className="text-muted-foreground text-xs ml-1">({formatCurrency(budgeted * LABOR_RATE)})</span>
                          </span>
                        ) : formatCurrency(budgeted)}
                      </TableCell>
                      <TableCell className="text-right">
                        {field.isHours ? (
                          <span>
                            <span className="font-mono">{formatNumber(actual)} hrs</span>
                            <span className="text-muted-foreground text-xs ml-1">({formatCurrency(actualLaborDollars)})</span>
                          </span>
                        ) : formatCurrency(actual)}
                      </TableCell>
                      {editingBudget && (
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="1"
                            placeholder="Manual $"
                            className="w-28 text-right ml-auto h-7 text-sm"
                            value={manualActuals[field.label] ?? (savedActuals[field.label] != null ? String(savedActuals[field.label]) : "")}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setManualActuals((prev) => ({ ...prev, [field.label]: e.target.value }))}
                          />
                        </TableCell>
                      )}
                      <TableCell className={`text-right ${varianceColor}`}>
                        {field.isHours ? (
                          <span>
                            <span>{variance >= 0 ? "+" : ""}{formatNumber(variance)} hrs</span>
                            <span className="text-xs ml-1">({variance >= 0 ? "+" : ""}{formatCurrency(budgeted * LABOR_RATE - actualLaborDollars)})</span>
                          </span>
                        ) : `${variance >= 0 ? "+" : ""}${formatCurrency(variance)}`}
                      </TableCell>
                    </TableRow>

                    {/* Accordion drill-down */}
                    {isExpanded && (
                      <TableRow key={`${field.key}-detail`}>
                        <TableCell colSpan={(effectiveIsAdmin ? 5 : 4) + (editingBudget ? 1 : 0)} className="p-0">
                          <div className="bg-muted/30 border-t border-b px-4 py-2">
                            {field.isHours ? (
                              drillLaborEntries.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-1">No labor entries recorded.</p>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left py-1 pr-4 font-medium">Date</th>
                                      <th className="text-left py-1 pr-4 font-medium">Employee</th>
                                      <th className="text-left py-1 pr-4 font-medium">Hours</th>
                                      <th className="text-right py-1 font-medium">Cost</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {drillLaborEntries
                                      .sort((a, b) => a.date > b.date ? -1 : 1)
                                      .map((e, i) => (
                                        <tr key={i} className="border-t border-muted">
                                          <td className="py-1 pr-4">{formatDateCentral(e.date + "T00:00:00", { month: "short", day: "numeric" })}</td>
                                          <td className="py-1 pr-4">{e.description}</td>
                                          <td className="py-1 pr-4 text-muted-foreground">{e.detail}</td>
                                          <td className="py-1 text-right">{formatCurrency(e.amount)}</td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              )
                            ) : isAutoFull && drillExpenses.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">Auto-filled to budget — no expense line items logged. Use manual override to adjust.</p>
                            ) : drillExpenses.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">No expenses in this category.</p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-muted-foreground">
                                    <th className="text-left py-1 pr-4 font-medium">Date</th>
                                    <th className="text-left py-1 pr-4 font-medium">Vendor</th>
                                    <th className="text-left py-1 pr-4 font-medium">Category</th>
                                    <th className="text-right py-1 font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {drillExpenses
                                    .sort((a, b) => a.date > b.date ? -1 : 1)
                                    .map((exp) => (
                                      <tr key={exp.id} className="border-t border-muted">
                                        <td className="py-1 pr-4">{formatDateCentral(exp.date + "T00:00:00", { month: "short", day: "numeric" })}</td>
                                        <td className="py-1 pr-4">{exp.vendor ?? <span className="text-muted-foreground">—</span>}</td>
                                        <td className="py-1 pr-4 text-muted-foreground">{exp.category}</td>
                                        <td className="py-1 text-right font-mono">{formatCurrency(exp.amount)}</td>
                                      </tr>
                                    ))}
                                  {(savedActuals[field.label] ?? 0) > 0 && (
                                    <tr className="border-t border-muted">
                                      <td className="py-1 pr-4 text-muted-foreground">—</td>
                                      <td className="py-1 pr-4 text-muted-foreground italic" colSpan={2}>Manual override</td>
                                      <td className="py-1 text-right font-mono">{formatCurrency(savedActuals[field.label])}</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>

          {/* Budget Charts */}
          {showCharts && (() => {
            const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#6366f1"];

            const AUTO_FULL_FIELDS_CHART = ["budget_design", "budget_pm"];
            // Actual labor dollars using per-entry rates for charts
            const chartLaborDollars = qboLaborEntries.reduce((sum, e) => sum + (e.reg_hours + e.ot_hours) * e.hourly_rate, 0)
              + laborEntries.reduce((sum, e) => sum + e.hours * LABOR_RATE, 0);
            const barData = BUDGET_FIELDS.map((field) => {
              const budgeted = (project[field.key as keyof ProjectSummary] as number) ?? 0;
              const expenseActual = getActualForBudgetField(field.key);
              const manualOverride = savedActuals[field.label] ?? 0;
              const hasManualOverride = savedActuals[field.label] != null;
              const actual = AUTO_FULL_FIELDS_CHART.includes(field.key) && !hasManualOverride
                ? budgeted
                : expenseActual + manualOverride;
              const budgetedDollars = field.isHours ? budgeted * LABOR_RATE : budgeted;
              const actualDollars = field.isHours ? chartLaborDollars : actual;
              return {
                name: field.label.replace("Labor Hours", "Labor Hrs"),
                Budgeted: budgetedDollars,
                Actual: actualDollars,
              };
            });

            const pieData = BUDGET_FIELDS
              .map((field, i) => {
                const budgeted = (project[field.key as keyof ProjectSummary] as number) ?? 0;
                const expenseActual = getActualForBudgetField(field.key);
                const manualOverride = savedActuals[field.label] ?? 0;
                const hasManualOverride = savedActuals[field.label] != null;
                const actual = AUTO_FULL_FIELDS_CHART.includes(field.key) && !hasManualOverride
                  ? budgeted
                  : expenseActual + manualOverride;
                const dollars = field.isHours ? chartLaborDollars : actual;
                return { name: field.label.replace("Labor Hours", "Labor Hrs"), value: dollars, color: PIE_COLORS[i % PIE_COLORS.length] };
              })
              .filter((d) => d.value > 0);

            const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

            const healthData = BUDGET_FIELDS.map((field) => {
              const budgeted = (project[field.key as keyof ProjectSummary] as number) ?? 0;
              const expenseActual = getActualForBudgetField(field.key);
              const manualOverride = savedActuals[field.label] ?? 0;
              const hasManualOverride = savedActuals[field.label] != null;
              const actual = AUTO_FULL_FIELDS_CHART.includes(field.key) && !hasManualOverride
                ? budgeted
                : expenseActual + manualOverride;
              const budgetedVal = field.isHours ? budgeted * LABOR_RATE : budgeted;
              const actualVal = field.isHours ? chartLaborDollars : actual;
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

      {/* Budget Allocation by Quote Line */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Budget Allocation by Quote Line</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Line-level view of how quote items roll into Labor Budget, Material Budget, and Non L&amp;M.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {quoteAllocationLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowQuoteAllocation((state) => !state)}>
              {showQuoteAllocation ? "Hide Allocation" : "Show Allocation"}
            </Button>
          </div>
        </CardHeader>
        {showQuoteAllocation && (
          <CardContent>
            {quoteAllocationError ? (
              <p className="text-sm text-muted-foreground">{quoteAllocationError}</p>
            ) : quoteAllocationRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quote line items available for allocation yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product/Service</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Description</TableHead>
                    {effectiveIsAdmin && <TableHead className="text-right">Total</TableHead>}
                    <TableHead className="text-right">Labor Budget</TableHead>
                    <TableHead className="text-right">Material Budget</TableHead>
                    <TableHead className="text-right">Non L&amp;M</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteAllocationRows.map((row) => (
                    <TableRow key={row.source_line_item_id}>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getSkuChipClassName(row.sku)}
                        >
                          {row.sku || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>{row.item || "—"}</span>
                          <span className="text-xs text-muted-foreground">{row.budget_category_label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[320px] whitespace-normal text-sm text-muted-foreground">
                        {row.description || "—"}
                      </TableCell>
                      {effectiveIsAdmin && <TableCell className="text-right">{formatCurrency(row.line_total)}</TableCell>}
                      <TableCell className="text-right">{formatCurrency(row.labor_budget)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.material_budget)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.non_lm_budget)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="font-semibold">Totals</TableCell>
                    {effectiveIsAdmin && <TableCell className="text-right font-semibold">{formatCurrency(quoteAllocationTotals.line_total)}</TableCell>}
                    <TableCell className="text-right font-semibold">{formatCurrency(quoteAllocationTotals.labor_budget)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(quoteAllocationTotals.material_budget)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(quoteAllocationTotals.non_lm_budget)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </CardContent>
        )}
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
              {activeExpenseTab === "expenses" && (
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
                <>
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
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenses.map((expense) => {
                      const billcomDetails = getBillcomExpenseDisplayDetails(expense);
                      const billcomDetailsOpen = expandedBillcomExpenseRows.has(expense.id);
                      return (
                        <Fragment key={expense.id}>
                          <TableRow>
                            <TableCell className="whitespace-nowrap">{formatDateCentral(expense.date + "T00:00:00")}</TableCell>
                            <TableCell>{expense.category}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-1.5">
                                {expense.vendor ?? "-"}
                                {expense.source === "billcom" && (
                                  <span className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">BILL</span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(expense.amount)}</TableCell>
                            <TableCell>{expense.amount_pending ? <Badge variant="outline">Pending</Badge> : <Badge variant="secondary">Confirmed</Badge>}</TableCell>
                            <TableCell>{expense.purchaser ?? "-"}</TableCell>
                            <TableCell className="max-w-48 truncate text-muted-foreground" title={expense.notes ?? undefined}>{expense.notes ?? "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {billcomDetails.isBillcom && billcomDetails.hasDiscreetDetails && (
                                  <button
                                    onClick={() => toggleBillcomExpenseDetails(expense.id)}
                                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                                    title={billcomDetailsOpen ? "Hide Bill.com details" : "Show Bill.com details"}
                                    aria-label={billcomDetailsOpen ? "Hide Bill.com details" : "Show Bill.com details"}
                                  >
                                    {billcomDetailsOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                  </button>
                                )}
                                {expense.source !== "billcom" && (
                                  <button
                                    onClick={() => setEditingExpense(expense)}
                                    className="p-1 text-muted-foreground hover:text-foreground rounded"
                                    title="Edit expense"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  onClick={() => setDeletingExpenseId(expense.id)}
                                  className="p-1 text-muted-foreground hover:text-destructive rounded"
                                  title="Delete expense"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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
                          {billcomDetails.isBillcom && billcomDetailsOpen && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={8}>
                                <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
                                  <div className="mb-2 font-medium text-foreground">Bill.com details</div>
                                  <div className="grid gap-2 sm:grid-cols-3">
                                    <div>
                                      <div className="uppercase tracking-wide text-[10px] text-muted-foreground">Cardholder</div>
                                      <div>{billcomDetails.cardholder ?? "—"}</div>
                                    </div>
                                    <div>
                                      <div className="uppercase tracking-wide text-[10px] text-muted-foreground">Transaction ID</div>
                                      <div className="font-mono" title={billcomDetails.transactionId ?? undefined}>
                                        {billcomDetails.transactionIdShort ? `…${billcomDetails.transactionIdShort}` : "—"}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="uppercase tracking-wide text-[10px] text-muted-foreground">Synced</div>
                                      <div>{billcomDetails.syncedAt ? formatDateTimeCentral(billcomDetails.syncedAt) : "—"}</div>
                                    </div>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
                {editingExpense && (
                  <EditExpenseDialog
                    expense={editingExpense}
                    onSave={(updated) => setExpenses((prev) => prev.map((e) => e.id === updated.id ? updated : e))}
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
                          {formatCurrency(flaggingExpense.amount)}
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
                </>
              )
            ) : (() => {
              const filtered = getFilteredQboLabor();
              const totalReg = filtered.reduce((s, e) => s + e.reg_hours, 0);
              const totalOt = filtered.reduce((s, e) => s + e.ot_hours, 0);
              const totalHrs = totalReg + totalOt;
              const totalCost = filtered.reduce((s, e) => s + (e.reg_hours + e.ot_hours) * e.hourly_rate, 0);
              const lastSynced = qboLaborEntries.length > 0
                ? qboLaborEntries.reduce((latest, e) => e.synced_at > latest ? e.synced_at : latest, qboLaborEntries[0].synced_at)
                : null;

              return (
                <div>
                  {/* Summary bar */}
                  <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b bg-muted/30">
                    <div className="text-sm"><span className="text-muted-foreground">Reg Hrs:</span> <span className="font-mono font-medium">{totalReg.toFixed(1)}</span></div>
                    <div className="text-sm"><span className="text-muted-foreground">OT Hrs:</span> <span className="font-mono font-medium">{totalOt.toFixed(1)}</span></div>
                    <div className="text-sm"><span className="text-muted-foreground">Total Hrs:</span> <span className="font-mono font-medium">{totalHrs.toFixed(1)}</span></div>
                    <div className="text-sm"><span className="text-muted-foreground">Total Cost:</span> <span className="font-mono font-medium">{formatCurrency(totalCost)}</span></div>
                    <div className="ml-auto flex items-center gap-2">
                      {lastSynced && (
                        <span className="text-xs text-muted-foreground">
                          Last synced: {formatDateTimeCentral(lastSynced, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </span>
                      )}
                      <Button size="sm" variant="outline" onClick={handleSyncLabor} disabled={laborSyncing}>
                        {laborSyncing ? "Syncing..." : "Sync"}
                      </Button>
                    </div>
                  </div>

                  {/* Date filter + View toggle */}
                  <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b">
                    <div className="flex gap-1">
                      {(["all", "week", "month", "custom"] as const).map((f) => (
                        <Button
                          key={f}
                          size="sm"
                          variant={laborDateFilter === f ? "default" : "ghost"}
                          onClick={() => setLaborDateFilter(f)}
                          className="text-xs h-7"
                        >
                          {f === "all" ? "All Time" : f === "week" ? "This Week" : f === "month" ? "This Month" : "Custom"}
                        </Button>
                      ))}
                    </div>
                    {laborDateFilter === "custom" && (
                      <div className="flex items-center gap-2">
                        <Input type="date" className="h-7 text-xs w-36" value={laborCustomStart} onChange={(e) => setLaborCustomStart(e.target.value)} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input type="date" className="h-7 text-xs w-36" value={laborCustomEnd} onChange={(e) => setLaborCustomEnd(e.target.value)} />
                      </div>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button size="sm" variant={laborView === "employee" ? "default" : "ghost"} onClick={() => { setLaborView("employee"); setExpandedLaborRows(new Set()); }} className="text-xs h-7">By Employee</Button>
                      <Button size="sm" variant={laborView === "date" ? "default" : "ghost"} onClick={() => { setLaborView("date"); setExpandedLaborRows(new Set()); }} className="text-xs h-7">By Date</Button>
                    </div>
                  </div>

                  <QboLaborTable
                    entries={filtered}
                    view={laborView}
                    expandedRows={expandedLaborRows}
                    onToggleRow={toggleLaborRow}
                  />
                </div>
              );
            })()}
          </CardContent>
        </Card>
    </div>
  );
}
