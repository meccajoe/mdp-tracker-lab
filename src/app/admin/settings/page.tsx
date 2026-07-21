"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { HARDCODED_DEFAULT_PCTS, LABOR_RATE_PER_HR } from "@/lib/budget-formula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/constants";
import { formatDateCentral, formatDateTimeCentral } from "@/lib/date-utils";

interface SettingRow {
  category: string;
  label: string;
  default_pct: number;
  editing: boolean;
  editValue: string;
}

interface FlaggedExpense {
  id: string;
  date: string;
  vendor: string | null;
  category: string;
  amount: number;
  flag_note: string | null;
  flagged_by: string | null;
  flagged_at: string | null;
  projects: { name: string } | null;
}

const LM_CATEGORIES = ["labor", "materials"];

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"settings" | "flags" | "billcom">("settings");
  const [flaggedExpenses, setFlaggedExpenses] = useState<FlaggedExpense[]>([]);
  const [flagsLoading, setFlagsLoading] = useState(false);
  const [billcomSyncState, setBillcomSyncState] = useState<{ last_sync_at: string | null; billcom_expense_count: number; last_sync_errors: number; last_sync_skipped: number; last_sync_error_msgs: string[] } | null>(null);
  const [billcomSyncing, setBillcomSyncing] = useState(false);
  const [billcomResult, setBillcomResult] = useState<{ synced: number; skipped: number; errors: string[] } | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { setLoading(false); return; }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
      setIsAdmin(roleData?.role === "admin");

      const { data, error } = await supabase.from("budget_formula_settings").select("*");
      if (error) {
        setTableExists(false);
        const rows: SettingRow[] = Object.entries(HARDCODED_DEFAULT_PCTS).map(([cat, pct]) => ({
          category: cat,
          label: cat.charAt(0).toUpperCase() + cat.slice(1).replace("_", " "),
          default_pct: pct,
          editing: false,
          editValue: String(pct),
        }));
        setSettings(rows);
      } else {
        // Sort: labor + materials first, then rest alphabetically by label
        const sorted = [...(data || [])].sort((a, b) => {
          const aIsLM = LM_CATEGORIES.includes(a.category);
          const bIsLM = LM_CATEGORIES.includes(b.category);
          if (aIsLM && !bIsLM) return -1;
          if (!aIsLM && bIsLM) return 1;
          // labor before materials
          if (a.category === "labor") return -1;
          if (b.category === "labor") return 1;
          return a.label.localeCompare(b.label);
        });
        setSettings(sorted.map((r: { category: string; label: string; default_pct: number }) => ({
          ...r,
          editing: false,
          editValue: String(r.default_pct),
        })));
      }
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (activeTab === "flags" && isAdmin) {
      loadFlaggedExpenses();
    }
    if (activeTab === "billcom" && isAdmin) {
      loadBillcomState();
    }
  }, [activeTab, isAdmin]);

  async function loadBillcomState() {
    const res = await fetch("/api/billcom/sync");
    if (res.ok) {
      const data = await res.json() as { last_sync_at: string | null; billcom_expense_count: number; last_sync_errors: number; last_sync_skipped: number; last_sync_error_msgs: string[] };
      setBillcomSyncState(data);
    }
  }

  async function runBillcomSync() {
    setBillcomSyncing(true);
    setBillcomResult(null);
    try {
      const res = await fetch("/api/billcom/sync", { method: "POST" });
      const data = await res.json() as { synced: number; skipped: number; errors: string[]; error?: string };
      if (!res.ok) {
        toast.error("Sync failed: " + (data.error ?? "Unknown error"));
      } else {
        setBillcomResult(data);
        toast.success(`Synced ${data.synced} expense${data.synced !== 1 ? "s" : ""} from Bill.com`);
        await loadBillcomState();
      }
    } catch {
      toast.error("Sync request failed");
    }
    setBillcomSyncing(false);
  }

  async function loadFlaggedExpenses() {
    setFlagsLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("*, projects(name)")
      .eq("flagged", true)
      .order("flagged_at", { ascending: false });
    if (error) {
      toast.error("Failed to load flagged expenses: " + error.message);
    } else {
      setFlaggedExpenses((data ?? []) as FlaggedExpense[]);
    }
    setFlagsLoading(false);
  }

  function startEdit(category: string) {
    setSettings((prev) => prev.map((r) => r.category === category ? { ...r, editing: true } : r));
  }

  function cancelEdit(category: string) {
    setSettings((prev) => prev.map((r) => r.category === category ? { ...r, editing: false, editValue: String(r.default_pct) } : r));
  }

  async function saveSetting(row: SettingRow) {
    const newPct = Number(row.editValue);
    if (isNaN(newPct) || newPct <= 0 || newPct > 100) {
      toast.error("Percentage must be between 1 and 100");
      return;
    }
    setSaving(row.category);
    const { error } = await supabase.from("budget_formula_settings").upsert({
      category: row.category,
      label: row.label,
      default_pct: newPct,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      toast.error("Failed to save: " + error.message);
    } else {
      toast.success(`Updated ${row.label} to ${newPct}%`);
      setSettings((prev) => prev.map((r) => r.category === row.category ? { ...r, default_pct: newPct, editing: false } : r));
    }
    setSaving(null);
  }

  const lmSettings = settings.filter((r) => LM_CATEGORIES.includes(r.category));
  const nonLMSettings = settings.filter((r) => !LM_CATEGORIES.includes(r.category));

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Loading...</p></div>;
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Admin access required</p></div>;

  function SettingsTable({ rows }: { rows: SettingRow[] }) {
    return (
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Category</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground w-36">Default %</th>
            <th className="text-center px-4 py-2.5 font-medium text-muted-foreground w-28">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.category} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-medium">{row.label}</td>
              <td className="px-4 py-3 text-center">
                {row.editing ? (
                  <div className="flex items-center justify-center gap-1">
                    <input
                      type="number" min="1" max="100" step="1"
                      className="w-16 text-center rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      value={row.editValue}
                      onChange={(e) => setSettings((prev) => prev.map((r) => r.category === row.category ? { ...r, editValue: e.target.value } : r))}
                      onKeyDown={(e) => { if (e.key === "Enter") saveSetting(row); if (e.key === "Escape") cancelEdit(row.category); }}
                      autoFocus
                    />
                    <span className="text-muted-foreground">%</span>
                  </div>
                ) : (
                  <span className="font-mono font-medium text-foreground">{row.default_pct}%</span>
                )}
              </td>
              <td className="px-4 py-3 text-center">
                {row.editing ? (
                  <div className="flex items-center justify-center gap-2">
                    <Button size="sm" className="h-7 px-3 text-xs" onClick={() => saveSetting(row)} disabled={saving === row.category}>
                      {saving === row.category ? "..." : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => cancelEdit(row.category)}>Cancel</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => startEdit(row.category)}>Edit</Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  // Group flagged expenses by flagged_by
  const flagGroups: Record<string, FlaggedExpense[]> = {};
  for (const exp of flaggedExpenses) {
    const key = exp.flagged_by ?? "Unknown";
    if (!flagGroups[key]) flagGroups[key] = [];
    flagGroups[key].push(exp);
  }
  const grandTotal = flaggedExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin Settings</h1>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 border-b border-border -mb-6">
        <button
          onClick={() => setActiveTab("settings")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "settings" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Budget Formula
        </button>
        <button
          onClick={() => setActiveTab("flags")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "flags" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Flags
        </button>
        <button
          onClick={() => setActiveTab("billcom")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "billcom" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          Bill.com Sync
        </button>
      </div>

      {activeTab === "settings" && (
        <div className="space-y-6 pt-2">
          <p className="text-muted-foreground text-sm">
            Global default percentages used to calculate budgets. Can be overridden per-project in the Data Entry Hub.
          </p>

          {!tableExists && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              ⚠ Using hardcoded defaults — changes won&apos;t persist until the migration is applied.
            </div>
          )}

          {/* Labor & Materials — first */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Labor &amp; Materials</CardTitle>
              <p className="text-xs text-muted-foreground">
                Calculated as a % of the total contract amount. Labor budget ÷ ${LABOR_RATE_PER_HR}/hr = budget hours.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <SettingsTable rows={lmSettings} />
            </CardContent>
          </Card>

          {/* Non-L&M */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Non-Labor &amp; Materials</CardTitle>
              <p className="text-xs text-muted-foreground">
                Budget = Quote Amount × Default %. Emily can override the % per project when needed.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <SettingsTable rows={nonLMSettings} />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "billcom" && (
        <div className="space-y-6 pt-2">
          <p className="text-muted-foreground text-sm">
            Pull bills from Bill.com and sync matching line items as expenses on MDP projects. Line items are matched by job number.
          </p>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sync Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last Synced</p>
                  <p className="font-medium">
                    {billcomSyncState?.last_sync_at
                      ? formatDateTimeCentral(billcomSyncState.last_sync_at, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
                      : "Never"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Synced Expenses</p>
                  <p className="font-medium">{billcomSyncState?.billcom_expense_count ?? 0}</p>
                </div>
                {(billcomSyncState?.last_sync_errors ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last Sync Errors</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-900/30 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-400">
                      ⚠ {billcomSyncState?.last_sync_errors} error{(billcomSyncState?.last_sync_errors ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                )}
                {(billcomSyncState?.last_sync_skipped ?? 0) > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Last Sync Skipped</p>
                    <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      {billcomSyncState?.last_sync_skipped} skipped
                    </span>
                  </div>
                )}
              </div>
              {(billcomSyncState?.last_sync_error_msgs?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-3 py-2 text-xs space-y-1">
                  <p className="font-semibold text-red-700 dark:text-red-400">Errors from last sync:</p>
                  {billcomSyncState?.last_sync_error_msgs?.map((msg, i) => (
                    <p key={i} className="text-muted-foreground">{msg}</p>
                  ))}
                </div>
              )}

              <Button onClick={runBillcomSync} disabled={billcomSyncing}>
                {billcomSyncing ? "Syncing…" : "Sync Now"}
              </Button>

              {billcomResult && (
                <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-1">
                  <p><span className="font-medium text-green-700 dark:text-green-400">{billcomResult.synced}</span> expenses synced</p>
                  <p><span className="font-medium">{billcomResult.skipped}</span> line items skipped</p>
                  {billcomResult.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{billcomResult.errors.length} error(s):</p>
                      {billcomResult.errors.slice(0, 5).map((e, i) => (
                        <p key={i} className="text-xs text-muted-foreground">{e}</p>
                      ))}
                      {billcomResult.errors.length > 5 && (
                        <p className="text-xs text-muted-foreground">…and {billcomResult.errors.length - 5} more</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "flags" && (
        <div className="space-y-6 pt-2">
          <p className="text-muted-foreground text-sm">
            All flagged expenses across all projects.
          </p>

          {flagsLoading ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : flaggedExpenses.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                No flagged expenses.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div data-slot="settings-flags-table" className="max-w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date Flagged</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Project</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Expense Date</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Vendor</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Note</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Flagged By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(flagGroups).map(([person, exps]) => {
                      const subtotal = exps.reduce((s, e) => s + e.amount, 0);
                      return (
                        <>
                          {exps.map((exp) => (
                            <tr key={exp.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                                {exp.flagged_at ? formatDateCentral(exp.flagged_at) : "—"}
                              </td>
                              <td className="px-4 py-2.5">{exp.projects?.name ?? "—"}</td>
                              <td className="px-4 py-2.5 whitespace-nowrap">{exp.date}</td>
                              <td className="px-4 py-2.5">{exp.vendor || exp.category}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(exp.amount)}</td>
                              <td className="px-4 py-2.5 text-muted-foreground max-w-xs truncate">{exp.flag_note ?? "—"}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{exp.flagged_by ?? "—"}</td>
                            </tr>
                          ))}
                          <tr className="border-b border-border bg-muted/30">
                            <td colSpan={4} className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                              Subtotal — {person}
                            </td>
                            <td className="px-4 py-2 text-right text-xs font-semibold font-mono">{formatCurrency(subtotal)}</td>
                            <td colSpan={2}></td>
                          </tr>
                        </>
                      );
                    })}
                    <tr className="bg-muted/50">
                      <td colSpan={4} className="px-4 py-3 text-sm font-bold">Grand Total</td>
                      <td className="px-4 py-3 text-right text-sm font-bold font-mono">{formatCurrency(grandTotal)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
