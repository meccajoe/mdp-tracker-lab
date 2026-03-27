"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { HARDCODED_DEFAULT_PCTS, LABOR_RATE_PER_HR } from "@/lib/budget-formula";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SettingRow {
  category: string;
  label: string;
  default_pct: number;
  editing: boolean;
  editValue: string;
}

const LM_CATEGORIES = ["labor", "materials"];

export default function SettingsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tableExists, setTableExists] = useState(true);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

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

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Budget Formula Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Global default percentages used to calculate budgets. Can be overridden per-project in the Data Entry Hub.
        </p>
      </div>

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
  );
}
