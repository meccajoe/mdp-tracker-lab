"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { fetchProjectLookup, type ProjectLookupResult } from "@/lib/project-lookups";
import { Project } from "@/lib/types";
import { useUserRoles, resolvePMName } from "@/hooks/useUserRoles";
import { formatCurrency } from "@/lib/constants";
import { BUDGET_CATEGORIES, HARDCODED_DEFAULT_PCTS, calcBudget, calcLaborHrs, calcMaterialsBudget, LABOR_RATE_PER_HR } from "@/lib/budget-formula";
import { formatNumber } from "@/lib/constants";
import { ProjectLookupStatus } from "@/components/project-lookup-status";
import { Button } from "@/components/ui/button";
import { BUDGET_FIELDS } from "@/lib/constants";
import { todayCentral } from "@/lib/date-utils";

type EditableProject = Project & { _isNew?: boolean };

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  Completed: "bg-red-500/15 text-red-700 dark:text-red-400",
  "On Hold": "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400",
  Pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status] ?? STATUS_COLORS["On Hold"]}`}>
      {status}
    </span>
  );
}

function FormField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 transition-colors";
const selectClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 cursor-pointer transition-colors";
const smallInputClass = "rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40 transition-colors";

// ─── Budget Formula Section ────────────────────────────────────────────────

interface BudgetFormulaSectionProps {
  contractAmount: number | null;
  fabricationAmount: number | null;
  globalPcts: Record<string, number>;
  projectPcts: Record<string, string>;
  setProjectPcts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  budgetOverrides: Record<string, string>;
  setBudgetOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  quotes: Record<string, string>;
  setQuotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

function OverrideRow({
  label,
  catKey,
  formulaValue,
  formulaDisplay,
  globalPcts,
  projectPcts,
  setProjectPcts,
  budgetOverrides,
  setBudgetOverrides,
  hideQuote = false,
  quoteLabel,
}: {
  label: string;
  catKey: string;
  formulaValue: number | null;
  formulaDisplay: React.ReactNode;
  globalPcts: Record<string, number>;
  projectPcts: Record<string, string>;
  setProjectPcts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  budgetOverrides: Record<string, string>;
  setBudgetOverrides: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  hideQuote?: boolean;
  quoteLabel?: string;
}) {
  const isProjectPctOverridden = projectPcts[catKey] !== undefined && projectPcts[catKey] !== "";
  const effectivePct = isProjectPctOverridden
    ? Number(projectPcts[catKey])
    : (globalPcts[catKey] ?? HARDCODED_DEFAULT_PCTS[catKey]);
  const isBudgetOverridden = budgetOverrides[catKey] !== undefined && budgetOverrides[catKey] !== "";

  return (
    <div className="grid grid-cols-[160px_80px_24px_1fr] gap-3 items-center px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
      <span className="text-sm font-medium">{label}</span>

      {/* % input */}
      <div className="flex items-center gap-1">
        <input
          type="number" step="1" min="1" max="100"
          className={smallInputClass + " w-14 text-center"}
          value={projectPcts[catKey] ?? effectivePct}
          onChange={(e) => setProjectPcts((prev) => ({ ...prev, [catKey]: e.target.value }))}
        />
        <span className="text-xs text-muted-foreground">%</span>
      </div>

      {/* Reset % */}
      <div className="flex items-center justify-center">
        {isProjectPctOverridden && (
          <button
            onClick={() => setProjectPcts((prev) => { const n = { ...prev }; delete n[catKey]; return n; })}
            title="Reset to global default"
            className="text-muted-foreground hover:text-foreground text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors"
          >↺</button>
        )}
      </div>

      {/* Formula result + override */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isBudgetOverridden && (
          <span className={`text-sm font-medium min-w-[90px] ${formulaValue ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
            {formulaDisplay}
          </span>
        )}
        {isBudgetOverridden ? (
          <>
            <input
              type="number" step="1" min="0"
              className={smallInputClass + " w-28"}
              value={budgetOverrides[catKey] ?? ""}
              onChange={(e) => setBudgetOverrides((prev) => ({ ...prev, [catKey]: e.target.value }))}
            />
            <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded font-medium whitespace-nowrap">✏ manual</span>
            <button onClick={() => setBudgetOverrides((prev) => { const n = { ...prev }; delete n[catKey]; return n; })} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
            {formulaValue && <span className="text-xs text-muted-foreground whitespace-nowrap">(formula: {typeof formulaDisplay === "string" ? formulaDisplay : formulaValue})</span>}
          </>
        ) : (
          <button
            onClick={() => setBudgetOverrides((prev) => ({ ...prev, [catKey]: formulaValue ? String(formulaValue) : "" }))}
            className="text-xs text-muted-foreground hover:text-foreground underline decoration-dashed"
          >override</button>
        )}
      </div>
    </div>
  );
}

function BudgetFormulaSection({
  contractAmount,
  fabricationAmount,
  globalPcts,
  projectPcts,
  setProjectPcts,
  budgetOverrides,
  setBudgetOverrides,
  quotes,
  setQuotes,
}: BudgetFormulaSectionProps) {
  const laborPct = projectPcts["labor"] !== undefined && projectPcts["labor"] !== ""
    ? Number(projectPcts["labor"])
    : (globalPcts["labor"] ?? HARDCODED_DEFAULT_PCTS["labor"]);
  const materialsPct = projectPcts["materials"] !== undefined && projectPcts["materials"] !== ""
    ? Number(projectPcts["materials"])
    : (globalPcts["materials"] ?? HARDCODED_DEFAULT_PCTS["materials"]);

  const autoLaborHrs = calcLaborHrs(fabricationAmount, laborPct);
  const autoLaborDollars = autoLaborHrs != null ? autoLaborHrs * LABOR_RATE_PER_HR : null;
  const autoMaterials = calcMaterialsBudget(fabricationAmount, materialsPct);

  const rowProps = { globalPcts, projectPcts, setProjectPcts, budgetOverrides, setBudgetOverrides };

  return (
    <div className="space-y-4">
      {/* Labor & Materials — first */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Labor &amp; Materials <span className="normal-case font-normal">(% of contract amount)</span>
        </h4>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[160px_80px_24px_1fr] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
            <span>Category</span>
            <span>% of Contract</span>
            <span />
            <span>Budget</span>
          </div>

          {/* Labor */}
          <OverrideRow
            label="Labor"
            catKey="labor"
            formulaValue={autoLaborHrs}
            formulaDisplay={contractAmount ? (
              <span>
                <span className="font-medium">{autoLaborHrs ?? "—"} hrs</span>
                <span className="text-xs text-muted-foreground ml-1">({formatCurrency(autoLaborDollars)})</span>
              </span>
            ) : <span className="text-muted-foreground/60 text-xs">Enter contract amount</span>}
            {...rowProps}
          />

          {/* Materials */}
          <OverrideRow
            label="Materials"
            catKey="materials"
            formulaValue={autoMaterials}
            formulaDisplay={contractAmount
              ? <span className="font-medium">{formatCurrency(autoMaterials)}</span>
              : <span className="text-muted-foreground/60 text-xs">Enter contract amount</span>}
            {...rowProps}
          />
        </div>
      </div>

      {/* Non-L&M Categories */}
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Non-Labor &amp; Materials Budget
        </h4>
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[160px_1fr_80px_24px_1fr] gap-3 px-4 py-2 bg-muted/40 border-b border-border text-xs font-medium text-muted-foreground">
            <span>Category</span>
            <span>Quote Amount</span>
            <span>% Rate</span>
            <span className="w-6" />
            <span>Budget</span>
          </div>
          {BUDGET_CATEGORIES.map((cat) => {
            const effectivePct = projectPcts[cat.key] !== undefined && projectPcts[cat.key] !== ""
              ? Number(projectPcts[cat.key])
              : (globalPcts[cat.key] ?? HARDCODED_DEFAULT_PCTS[cat.key]);
            const isProjectPctOverridden = projectPcts[cat.key] !== undefined && projectPcts[cat.key] !== "";
            const quoteVal = quotes[cat.key] ? Number(quotes[cat.key]) : null;
            const formulaResult = calcBudget(quoteVal, effectivePct);
            const isBudgetOverridden = budgetOverrides[cat.key] !== undefined && budgetOverrides[cat.key] !== "";

            return (
              <div key={cat.key} className="grid grid-cols-[160px_1fr_80px_24px_1fr] gap-3 items-center px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                <span className="text-sm font-medium">{cat.label}</span>
                <input
                  type="number" step="1" min="0"
                  className={smallInputClass + " w-full"}
                  value={quotes[cat.key] ?? ""}
                  onChange={(e) => setQuotes((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                  placeholder="Quote $"
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number" step="1" min="1" max="100"
                    className={smallInputClass + " w-14 text-center"}
                    value={projectPcts[cat.key] ?? effectivePct}
                    onChange={(e) => setProjectPcts((prev) => ({ ...prev, [cat.key]: e.target.value }))}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
                <div className="flex items-center justify-center">
                  {isProjectPctOverridden && (
                    <button onClick={() => setProjectPcts((prev) => { const n = { ...prev }; delete n[cat.key]; return n; })} title="Reset to global default" className="text-muted-foreground hover:text-foreground text-xs w-5 h-5 flex items-center justify-center rounded hover:bg-muted transition-colors">↺</button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isBudgetOverridden && (
                    <span className={`text-sm font-medium min-w-[80px] ${formulaResult ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                      {formulaResult ? formatCurrency(formulaResult) : "—"}
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 flex-1">
                    {isBudgetOverridden ? (
                      <>
                        <input type="number" step="1" min="0" className={smallInputClass + " w-28"} value={budgetOverrides[cat.key] ?? ""} onChange={(e) => setBudgetOverrides((prev) => ({ ...prev, [cat.key]: e.target.value }))} />
                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded font-medium whitespace-nowrap">✏ manual</span>
                        <button onClick={() => setBudgetOverrides((prev) => { const n = { ...prev }; delete n[cat.key]; return n; })} className="text-muted-foreground hover:text-foreground text-xs">✕</button>
                        {formulaResult && <span className="text-xs text-muted-foreground whitespace-nowrap">(formula: {formatCurrency(formulaResult)})</span>}
                      </>
                    ) : (
                      <button onClick={() => setBudgetOverrides((prev) => ({ ...prev, [cat.key]: formulaResult ? String(formulaResult) : "" }))} className="text-xs text-muted-foreground hover:text-foreground underline decoration-dashed">override</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function DataEntryPage() {
  const { users: dbUsers, allPMs } = useUserRoles();
  const [projects, setProjects] = useState<EditableProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [syncingQboUrls, setSyncingQboUrls] = useState(false);
  const [qboSyncResult, setQboSyncResult] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterPM, setFilterPM] = useState("All");
  const [filterStatus, setFilterStatus] = useState("All");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<ProjectLookupResult | null>(null);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [actualsLoading, setActualsLoading] = useState(false);

  // Budget formula state
  const [globalPcts, setGlobalPcts] = useState<Record<string, number>>(HARDCODED_DEFAULT_PCTS);
  const [quotes, setQuotes] = useState<Record<string, string>>({});
  const [projectPcts, setProjectPcts] = useState<Record<string, string>>({});
  const [budgetOverrides, setBudgetOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) return;
      const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
      setIsAdmin(data?.role === "admin");
    }
    checkAccess();
  }, []);

  // Load global default percentages
  useEffect(() => {
    supabase.from("budget_formula_settings").select("*").then(({ data }) => {
      if (data && data.length > 0) {
        const pcts: Record<string, number> = { ...HARDCODED_DEFAULT_PCTS };
        data.forEach((r: { category: string; default_pct: number }) => { pcts[r.category] = r.default_pct; });
        setGlobalPcts(pcts);
      }
    });
  }, []);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("projects").select("*").order("id", { ascending: false });
    if (error) toast.error("Failed to load projects");
    else setProjects(data as EditableProject[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

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
      due_date: (project as unknown as Record<string, unknown>).due_date as string ?? "",
      contract_amount: project.contract_amount ?? "",
      hubspot_deal_id: project.hubspot_deal_id ?? null,
      hubspot_deal_url: project.hubspot_deal_url ?? null,
      qbo_project_id: project.qbo_project_id ?? null,
      qbo_project_url: project.qbo_project_url ?? null,
      notes: project.notes ?? "",
      _isNew: false,
    });

    // Populate quote fields
    const newQuotes: Record<string, string> = {};
    const newProjectPcts: Record<string, string> = {};
    const newBudgetOverrides: Record<string, string> = {};

    for (const cat of BUDGET_CATEGORIES) {
      const quoteVal = (project as unknown as Record<string, unknown>)[cat.quoteKey];
      if (quoteVal != null) newQuotes[cat.key] = String(quoteVal);

      const pctVal = (project as unknown as Record<string, unknown>)[cat.pctKey];
      if (pctVal != null) newProjectPcts[cat.key] = String(pctVal);

      // If there's a budget value but no quote, treat it as a manual override
      const budgetVal = (project as unknown as Record<string, unknown>)[cat.budgetKey];
      if (budgetVal != null && quoteVal == null) {
        newBudgetOverrides[cat.key] = String(budgetVal);
      }
    }

    // L&M pct overrides
    if ((project as unknown as Record<string, unknown>)["pct_labor"] != null)
      newProjectPcts["labor"] = String((project as unknown as Record<string, unknown>)["pct_labor"]);
    if ((project as unknown as Record<string, unknown>)["pct_materials"] != null)
      newProjectPcts["materials"] = String((project as unknown as Record<string, unknown>)["pct_materials"]);

    // If budget_hrs or budget_materials exist with no contract to derive them, treat as overrides
    if (project.budget_hrs != null) newBudgetOverrides["labor"] = String(project.budget_hrs);
    if ((project as unknown as Record<string, unknown>)["budget_materials"] != null)
      newBudgetOverrides["materials"] = String((project as unknown as Record<string, unknown>)["budget_materials"]);

    setQuotes(newQuotes);
    setProjectPcts(newProjectPcts);
    setBudgetOverrides(newBudgetOverrides);

    setLookupResult(null);
    setActuals({});

    if (!project._isNew) {
      setActualsLoading(true);
      const { data } = await supabase.from("project_actuals").select("category, manual_amount").eq("project_id", project.id);
      const map: Record<string, string> = {};
      if (data) data.forEach((r: { category: string; manual_amount: number | null }) => { if (r.manual_amount != null) map[r.category] = String(r.manual_amount); });
      const { data: laborData } = await supabase.from("labor_entries").select("hours").eq("project_id", project.id);
      const totalHrs = laborData?.reduce((sum: number, e: { hours: number }) => sum + (e.hours || 0), 0) ?? 0;
      if (totalHrs > 0) map["labor_hours_used"] = String(totalHrs);
      setActuals(map);
      setActualsLoading(false);
    }
  }

  async function handleSyncQboUrls() {
    setSyncingQboUrls(true);
    setQboSyncResult(null);
    try {
      const res = await fetch("/api/qbo/sync-project-urls", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQboSyncResult(`✅ Updated ${data.updated} project QBO links`);
      await fetchProjects();
    } catch (err) {
      setQboSyncResult(`❌ ${err instanceof Error ? err.message : "Sync failed"}`);
    } finally {
      setSyncingQboUrls(false);
      setTimeout(() => setQboSyncResult(null), 4000);
    }
  }

  function openNewProject() {
    setProjects((prev) => prev.filter((p) => !p._isNew));
    const blank: EditableProject = {
      id: "__NEW__", name: "", client: "", pm: "", status: "Active",
      job_number: null, close_date: null, due_date: null, contract_amount: null,
      hubspot_deal_id: null, hubspot_deal_url: null, qbo_project_id: null, qbo_project_url: null,
      budget_hrs: null, budget_design: null, budget_pm: null, budget_shipping: null,
      budget_crating: null, budget_id_labor: null, budget_travel: null, budget_props: null, budget_equipment: null,
      budget_rental: null, budget_flooring: null, notes: null, project_type: null, created_at: "", updated_at: "",
      budget_materials: null, quote_rental: null, quote_crating: null, pct_rental: null, pct_crating: null,
      quote_labor: null, quote_materials: null,
      pct_labor: null, pct_materials: null,
      quote_design: null, quote_pm: null, quote_shipping: null, quote_id_labor: null,
      quote_travel: null, quote_props: null, quote_equipment: null, quote_flooring: null,
      pct_design: null, pct_pm: null, pct_shipping: null, pct_id_labor: null,
      pct_travel: null, pct_props: null, pct_equipment: null, pct_flooring: null,
      _isNew: true,
    };
    setProjects((prev) => [blank, ...prev]);
    setExpandedId("__NEW__");
    setDeleting(null);
    setFormData({ id: "", name: "", client: "", pm: "", status: "Active", job_number: "", close_date: "", due_date: "", contract_amount: "", hubspot_deal_id: null, hubspot_deal_url: null, qbo_project_id: null, qbo_project_url: null, notes: "", _isNew: true });
    setLookupResult(null);
    setActuals({});
    setActualsLoading(false);
    setQuotes({});
    setProjectPcts({});
    setBudgetOverrides({});
  }

  function cancelEdit() {
    setProjects((prev) => prev.filter((p) => !p._isNew));
    setExpandedId(null);
    setFormData({});
    setDeleting(null);
    setLookupResult(null);
    setActuals({});
    setQuotes({});
    setProjectPcts({});
    setBudgetOverrides({});
  }

  function updateForm(field: string, value: unknown) {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }

  function handleJobNumberChange(value: string) {
    setLookupResult(null);
    setFormData((prev) => ({ ...prev, job_number: value, hubspot_deal_id: null, hubspot_deal_url: null, qbo_project_id: null, qbo_project_url: null }));
  }

  async function handleJobNumberBlur() {
    const trimmed = String(formData.id ?? formData.job_number ?? "").trim();
    if (!trimmed) { setLookupResult(null); return; }
    setLookupLoading(true);
    try {
      const result = await fetchProjectLookup(trimmed);
      setLookupResult(result);
      setFormData((prev) => ({ ...prev, job_number: trimmed, hubspot_deal_id: result.hubspot_deal_id, hubspot_deal_url: result.hubspot_deal_url, qbo_project_id: result.qbo_project_id, qbo_project_url: result.qbo_project_url }));
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

  // Compute effective budget values from formula state
  function getEffectiveBudgets(contractAmount: number | null) {
    const budgets: Record<string, number | null> = {};
    for (const cat of BUDGET_CATEGORIES) {
      if (budgetOverrides[cat.key] !== undefined && budgetOverrides[cat.key] !== "") {
        budgets[cat.budgetKey] = Number(budgetOverrides[cat.key]);
      } else if (quotes[cat.key]) {
        const effectivePct = projectPcts[cat.key] !== undefined && projectPcts[cat.key] !== ""
          ? Number(projectPcts[cat.key])
          : (globalPcts[cat.key] ?? HARDCODED_DEFAULT_PCTS[cat.key]);
        budgets[cat.budgetKey] = calcBudget(Number(quotes[cat.key]), effectivePct);
      } else {
        budgets[cat.budgetKey] = null;
      }
    }
    // Labor/materials now derive from fabrication subtotal, not total contract amount
    const laborPct = projectPcts["labor"] !== undefined && projectPcts["labor"] !== ""
      ? Number(projectPcts["labor"])
      : (globalPcts["labor"] ?? HARDCODED_DEFAULT_PCTS["labor"]);
    const materialsPct = projectPcts["materials"] !== undefined && projectPcts["materials"] !== ""
      ? Number(projectPcts["materials"])
      : (globalPcts["materials"] ?? HARDCODED_DEFAULT_PCTS["materials"]);
    const fabricationAmount = numVal(quotes.fabrication);

    budgets["budget_hrs"] = budgetOverrides["labor"]
      ? Number(budgetOverrides["labor"])
      : calcLaborHrs(fabricationAmount, laborPct);
    budgets["budget_materials"] = budgetOverrides["materials"]
      ? Number(budgetOverrides["materials"])
      : calcMaterialsBudget(fabricationAmount, materialsPct);
    return budgets;
  }

  async function handleSave() {
    const isNew = formData._isNew as boolean;
    const projectId = isNew ? (formData.id as string).trim() : expandedId!;

    if (isNew && !projectId) { toast.error("Job # is required"); return; }
    if (!(formData.name as string).trim()) { toast.error("Project Name is required"); return; }

    setSaving(true);
    const contractAmount = numVal(formData.contract_amount);
    const budgets = getEffectiveBudgets(contractAmount);

    const payload: Record<string, unknown> = {
      id: projectId,
      name: (formData.name as string).trim(),
      client: (formData.client as string).trim(),
      pm: formData.pm as string,
      status: formData.status as string,
      job_number: (formData.job_number as string).trim() || null,
      close_date: (formData.close_date as string) || null,
      due_date: (formData.due_date as string) || null,
      contract_amount: contractAmount,
      hubspot_deal_id: formData.hubspot_deal_id ?? null,
      hubspot_deal_url: formData.hubspot_deal_url ?? null,
      qbo_project_id: formData.qbo_project_id ?? null,
      qbo_project_url: formData.qbo_project_url ?? null,
      notes: (formData.notes as string).trim() || null,
      // Computed budgets (includes budget_hrs, budget_materials, and all non-L&M)
      ...budgets,
      // Quote amounts
      quote_labor: null, // L&M uses contract %, no quote
      quote_materials: null,
      quote_design: numVal(quotes.design),
      quote_pm: numVal(quotes.pm),
      quote_shipping: numVal(quotes.shipping),
      quote_id_labor: numVal(quotes.id_labor),
      quote_travel: numVal(quotes.travel),
      quote_props: numVal(quotes.props),
      quote_equipment: numVal(quotes.equipment),
      quote_rental: numVal(quotes.rental),
      quote_flooring: numVal(quotes.flooring),
      quote_crating: numVal(quotes.crating),
      // Per-project % overrides
      pct_labor: projectPcts.labor ? Number(projectPcts.labor) : null,
      pct_materials: projectPcts.materials ? Number(projectPcts.materials) : null,
      pct_design: projectPcts.design ? Number(projectPcts.design) : null,
      pct_pm: projectPcts.pm ? Number(projectPcts.pm) : null,
      pct_shipping: projectPcts.shipping ? Number(projectPcts.shipping) : null,
      pct_id_labor: projectPcts.id_labor ? Number(projectPcts.id_labor) : null,
      pct_travel: projectPcts.travel ? Number(projectPcts.travel) : null,
      pct_props: projectPcts.props ? Number(projectPcts.props) : null,
      pct_equipment: projectPcts.equipment ? Number(projectPcts.equipment) : null,
      pct_rental: projectPcts.rental ? Number(projectPcts.rental) : null,
      pct_flooring: projectPcts.flooring ? Number(projectPcts.flooring) : null,
      pct_crating: projectPcts.crating ? Number(projectPcts.crating) : null,
    };

    if (isNew) {
      const { error } = await supabase.from("projects").insert(payload);
      if (error) { toast.error("Failed to create project: " + error.message); setSaving(false); return; }
      toast.success(`Created project ${projectId}`);
    } else {
      const { id: _id, ...updatePayload } = payload;
      const { error } = await supabase.from("projects").update(updatePayload).eq("id", projectId);
      if (error) { toast.error("Failed to save: " + error.message); setSaving(false); return; }
      toast.success(`Saved ${projectId}`);
    }

    // Save actuals
    for (const [category, amountStr] of Object.entries(actuals)) {
      if (category === "labor_hours_used") continue;
      const amount = amountStr === "" ? null : Number(amountStr);
      if (amount !== null) {
        await supabase.from("project_actuals").upsert({ project_id: projectId, category, manual_amount: amount, updated_at: new Date().toISOString() }, { onConflict: "project_id,category" });
      }
    }
    const laborHrsStr = actuals["labor_hours_used"];
    if (laborHrsStr && Number(laborHrsStr) > 0) {
      await supabase.from("labor_entries").delete().eq("project_id", projectId).eq("person", "Data Entry");
      await supabase.from("labor_entries").insert({ project_id: projectId, hours: Number(laborHrsStr), labor_type: "Production Labor", person: "Data Entry", notes: "Manual entry via data entry form", date: todayCentral() });
    }

    setExpandedId(null);
    setFormData({});
    setActuals({});
    setQuotes({});
    setProjectPcts({});
    setBudgetOverrides({});
    setSaving(false);
    await fetchProjects();
  }

  async function handleDelete(project: EditableProject) {
    setSaving(true);
    const { error } = await supabase.from("projects").delete().eq("id", project.id);
    if (error) { toast.error("Failed to delete: " + error.message); setSaving(false); return; }
    toast.success(`Deleted ${project.name || project.id}`);
    setExpandedId(null);
    setFormData({});
    setDeleting(null);
    setSaving(false);
    setProjects((prev) => prev.filter((p) => p.id !== project.id));
  }

  if (!isAdmin && !loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Admin access required</p></div>;
  }
  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Loading projects...</p></div>;
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Data Entry Hub</h1>
            <p className="text-sm text-muted-foreground">Manage projects, budgets, and details</p>
          </div>
          <div className="flex items-center gap-2">
            {qboSyncResult && <span className="text-xs text-muted-foreground">{qboSyncResult}</span>}
            <Button size="sm" variant="outline" onClick={handleSyncQboUrls} disabled={syncingQboUrls}>
              {syncingQboUrls ? "Syncing..." : "🔗 Sync QBO Links"}
            </Button>
            <Button size="sm" variant="outline" onClick={openNewProject}>+ New Project</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="relative flex-1 min-w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search job #, project, client, PM..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring" />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}
          </div>
          <select value={filterPM} onChange={(e) => setFilterPM(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="All">All PMs</option>
            {allPMs.map((pm) => <option key={pm.initials} value={pm.initials}>{pm.fullName}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="All">All Statuses</option>
            <option value="Active">Active</option>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
          </select>
          {(search || filterPM !== "All" || filterStatus !== "All") && (
            <button onClick={() => { setSearch(""); setFilterPM("All"); setFilterStatus("All"); }} className="text-sm text-muted-foreground hover:text-foreground px-2">Clear filters</button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="text-left px-4 py-3 font-semibold border-b border-border w-28">Job #</th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border">Project Name</th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border hidden sm:table-cell">Client</th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border hidden md:table-cell w-40">PM</th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border w-28">Status</th>
              <th className="text-right px-4 py-3 font-semibold border-b border-border hidden lg:table-cell w-32">Contract $</th>
              <th className="text-left px-4 py-3 font-semibold border-b border-border hidden lg:table-cell w-32">Close Date</th>
              <th className="text-center px-4 py-3 font-semibold border-b border-border w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.filter((project) => {
              const q = search.toLowerCase();
              if (q) {
                const pmName = resolvePMName(project.pm ?? "", dbUsers).toLowerCase();
                if (!project.id.toLowerCase().includes(q) && !(project.name ?? "").toLowerCase().includes(q) && !(project.client ?? "").toLowerCase().includes(q) && !pmName.includes(q)) return false;
              }
              if (filterPM !== "All" && project.pm !== filterPM) return false;
              if (filterStatus !== "All" && project.status !== filterStatus) return false;
              return true;
            }).map((project) => {
              const isExpanded = expandedId === project.id;
              const currentProject = project;
              const contractAmount = numVal(formData.contract_amount);

              return (
                <>
                  <tr key={project.id} className={`border-b border-border/50 hover:bg-muted/30 transition-colors ${project.status === "Completed" ? "text-muted-foreground" : ""} ${isExpanded ? "bg-muted/20" : ""}`}>
                    <td className="px-4 py-3 font-mono text-xs w-28">{project._isNew ? "NEW" : project.id}</td>
                    <td className="px-4 py-3 font-medium max-w-[200px] truncate">{project.name || <span className="text-muted-foreground italic">Untitled</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground truncate hidden sm:table-cell max-w-[160px]">{project.client}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{resolvePMName(project.pm ?? "", dbUsers)}</td>
                    <td className="px-4 py-3 w-28"><StatusBadge status={project.status} /></td>
                    <td className="px-4 py-3 text-right font-mono text-xs hidden lg:table-cell w-32">{project.contract_amount ? formatCurrency(project.contract_amount) : "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell w-32">{project.close_date ?? "—"}</td>
                    <td className="px-4 py-3 text-center w-24">
                      <Button size="sm" variant={isExpanded ? "secondary" : "ghost"} className="h-7 px-3 text-xs" onClick={() => isExpanded ? cancelEdit() : openEdit(project)}>
                        {isExpanded ? "Close" : "Edit"}
                      </Button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0 border-b border-border">
                        <div className="bg-muted/30 px-6 py-6">
                          <div className="max-w-5xl mx-auto space-y-6">

                            {/* Row 1 — Identifiers */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                              <FormField label="Job # (MDP Number)">
                                <div className="space-y-2">
                                  <input type="text" className={inputClass} value={(formData.id as string) ?? ""} readOnly={!formData._isNew}
                                    onChange={(e) => { updateForm("id", e.target.value); handleJobNumberChange(e.target.value); }}
                                    onBlur={() => handleJobNumberBlur()} placeholder="e.g. 26058" />
                                  <ProjectLookupStatus loading={lookupLoading} result={lookupResult} />
                                </div>
                              </FormField>
                              <FormField label="Project Name">
                                <input type="text" className={inputClass} value={(formData.name as string) ?? ""} onChange={(e) => updateForm("name", e.target.value)} placeholder="Project name" />
                              </FormField>
                              <FormField label="Client">
                                <input type="text" className={inputClass} value={(formData.client as string) ?? ""} onChange={(e) => updateForm("client", e.target.value)} placeholder="Client name" />
                              </FormField>
                            </div>

                            {/* Row 2 — PM / Status / Dates / Contract */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                              <FormField label="PM">
                                <select className={selectClass} value={(formData.pm as string) ?? ""} onChange={(e) => updateForm("pm", e.target.value)}>
                                  <option value="">Select PM</option>
                                  {allPMs.map((pm) => <option key={pm.initials} value={pm.initials}>{pm.fullName}</option>)}
                                </select>
                              </FormField>
                              <FormField label="Status">
                                <select className={selectClass} value={(formData.status as string) ?? "Active"} onChange={(e) => updateForm("status", e.target.value)}>
                                  <option value="Active">Active</option>
                                  <option value="Pending">Pending</option>
                                  <option value="Completed">Completed</option>
                                  <option value="On Hold">On Hold</option>
                                </select>
                              </FormField>
                              <FormField label="Close Date">
                                <input type="date" className={inputClass} value={(formData.close_date as string) ?? ""} onChange={(e) => updateForm("close_date", e.target.value)} />
                              </FormField>
                              <FormField label="Due Date">
                                <input type="date" className={inputClass} value={(formData.due_date as string) ?? ""} onChange={(e) => updateForm("due_date", e.target.value)} />
                              </FormField>
                              <FormField label="Contract Amount">
                                <input type="number" step="1" className={inputClass} value={formData.contract_amount as string ?? ""} onChange={(e) => updateForm("contract_amount", e.target.value)} placeholder="0" />
                              </FormField>
                            </div>

                            {/* Row 3 — QBO */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField label="QBO Project URL">
                                <input type="text" className={inputClass} value={(formData.qbo_project_url as string) ?? ""} onChange={(e) => updateForm("qbo_project_url", e.target.value)} placeholder="Paste from QuickBooks project page" />
                              </FormField>
                            </div>

                            {/* Budget Formula Section */}
                            <div className="border-t border-border pt-5">
                              <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold">Budget Setup</h3>
                                <a href="/admin/settings" className="text-xs text-blue-600 hover:underline">Edit global % defaults →</a>
                              </div>
                              <BudgetFormulaSection
                                contractAmount={contractAmount}
                                fabricationAmount={numVal(quotes.fabrication)}
                                globalPcts={globalPcts}
                                quotes={quotes}
                                setQuotes={setQuotes}
                                projectPcts={projectPcts}
                                setProjectPcts={setProjectPcts}
                                budgetOverrides={budgetOverrides}
                                setBudgetOverrides={setBudgetOverrides}
                              />
                            </div>

                            {/* Actual Spend */}
                            {!formData._isNew && (
                              <div className="border-t border-border pt-4">
                                <h4 className="text-sm font-semibold text-foreground mb-3">Actual Spend</h4>
                                {actualsLoading ? (
                                  <p className="text-sm text-muted-foreground">Loading actuals...</p>
                                ) : (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <FormField label="Labor Hours Used">
                                      <input type="number" step="0.5" className={inputClass} value={actuals["labor_hours_used"] ?? ""} onChange={(e) => setActuals((prev) => ({ ...prev, labor_hours_used: e.target.value }))} placeholder={`Budget: ${formData.budget_hrs || 0} hrs`} />
                                    </FormField>
                                    {BUDGET_FIELDS.filter((f) => !f.isHours).map((field) => (
                                      <FormField key={field.key} label={`${field.label} Actual $`}>
                                        <input type="number" step="1" className={inputClass} value={actuals[field.label] ?? ""} onChange={(e) => setActuals((prev) => ({ ...prev, [field.label]: e.target.value }))} placeholder={`Budget: $${(formData as Record<string, unknown>)[field.key] || 0}`} />
                                      </FormField>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Notes */}
                            <FormField label="Notes (visible to all team members)">
                              <textarea className={`${inputClass} min-h-[80px] resize-y`} value={(formData.notes as string) ?? ""} onChange={(e) => updateForm("notes", e.target.value)} placeholder="Notes visible on project page..." />
                            </FormField>

                            {/* Actions */}
                            <div className="flex items-center justify-between pt-2">
                              <div>
                                {!formData._isNew && (
                                  deleting === currentProject.id ? (
                                    <div className="flex items-center gap-3">
                                      <p className="text-sm text-destructive">Delete <strong>{currentProject.name || currentProject.id}</strong> and all expenses/labor? Cannot be undone.</p>
                                      <Button size="sm" variant="destructive" onClick={() => handleDelete(currentProject)} disabled={saving}>{saving ? "Deleting..." : "Yes, Delete"}</Button>
                                      <Button size="sm" variant="outline" onClick={() => setDeleting(null)}>No</Button>
                                    </div>
                                  ) : (
                                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleting(currentProject.id)}>Delete Project</Button>
                                  )
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                                <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : formData._isNew ? "Create Project" : "Save Changes"}</Button>
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
            <p className="text-muted-foreground">No projects found. Click &quot;+ New Project&quot; to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}
