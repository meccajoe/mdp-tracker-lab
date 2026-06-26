"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { formatDateCentral } from "@/lib/date-utils";
import { formatCurrency } from "@/lib/constants";

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

export default function FlagsPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flaggedExpenses, setFlaggedExpenses] = useState<FlaggedExpense[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) { setLoading(false); return; }
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
      const admin = roleData?.role === "admin";
      setIsAdmin(admin);
      if (admin) await loadFlaggedExpenses();
      setLoading(false);
    }
    load();
  }, []);

  async function loadFlaggedExpenses() {
    const { data, error } = await supabase
      .from("expenses")
      .select("*, projects(name)")
      .eq("flagged", true)
      .order("flagged_at", { ascending: false });
    if (error) {
      toast.error("Failed to load flagged expenses: " + error.message);
      return;
    }
    setFlaggedExpenses((data ?? []) as FlaggedExpense[]);
  }

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!isAdmin) return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground">Admin access required</p></div>;

  // Group by flagged_by
  const flagGroups: Record<string, FlaggedExpense[]> = {};
  for (const exp of flaggedExpenses) {
    const key = exp.flagged_by ?? "Unknown";
    if (!flagGroups[key]) flagGroups[key] = [];
    flagGroups[key].push(exp);
  }
  const grandTotal = flaggedExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="p-6 xl:px-8 max-w-[1800px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">🚩 Flagged Expenses</h1>
        <p className="text-muted-foreground text-sm mt-1">Expenses flagged for review across all projects. Admin only.</p>
      </div>

      {flaggedExpenses.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-4xl mb-3">🚩</p>
          <p className="font-medium">No flagged expenses</p>
          <p className="text-sm mt-1">Flagged expenses will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(flagGroups).map(([person, expenses]) => {
            const personTotal = expenses.reduce((s, e) => s + e.amount, 0);
            return (
              <div key={person} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-3 flex items-center justify-between">
                  <span className="font-semibold">{person}</span>
                  <span className="text-sm font-medium text-red-600">{formatCurrency(personTotal)} total flagged</span>
                </div>
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/20">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Date Flagged</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Project</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Expense Date</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vendor</th>
                      <th className="text-right px-4 py-2 font-medium text-muted-foreground">Amount</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((exp) => (
                      <tr key={exp.id} className="border-b last:border-0 hover:bg-muted/10">
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                          {exp.flagged_at ? formatDateCentral(exp.flagged_at) : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-medium">{exp.projects?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{exp.date}</td>
                        <td className="px-4 py-2.5">{exp.vendor ?? exp.category}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-red-600">{formatCurrency(exp.amount)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground italic">{exp.flag_note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}

          <div className="flex justify-end pt-2 border-t">
            <span className="text-sm font-semibold text-red-600">
              Grand Total Flagged: {formatCurrency(grandTotal)} ({flaggedExpenses.length} expense{flaggedExpenses.length !== 1 ? "s" : ""})
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
