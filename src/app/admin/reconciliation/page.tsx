"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { formatCurrency } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// Variance thresholds
const VARIANCE_PCT_THRESHOLD = 5;   // flag if >5% apart
const VARIANCE_ABS_THRESHOLD = 500; // flag if >$500 apart

interface ReconciliationRow {
  project_id: string;
  name: string;
  status: string;
  contract_amount: number | null;
  // Tracker side
  tracker_expenses: number;
  tracker_labor: number;
  tracker_total_cost: number;
  tracker_gp: number | null;
  // QBO side
  qbo_income: number | null;
  qbo_expenses: number | null;
  qbo_net_income: number | null;
  qbo_synced_at: string | null;
  // Computed
  delta: number | null;
  delta_pct: number | null;
  flagged: boolean;
}

export default function ReconciliationPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null); // projectId or "all"
  const [statusFilter, setStatusFilter] = useState<"all" | "flagged">("all");
  const [projectFilter, setProjectFilter] = useState<"all" | "Active" | "Completed">("all");

  const checkAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) { router.replace("/login"); return; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
    if (data?.role !== "admin") { router.replace("/"); return; }
    setIsAdmin(true);
  }, [router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [projectsRes, pnlRes] = await Promise.all([
      supabase.from("project_summary").select("id, name, status, contract_amount, total_spent, qbo_labor_cost, qbo_project_id"),
      supabase.from("qbo_project_pnl").select("*"),
    ]);

    const pnlMap = new Map<string, { qbo_income: number; qbo_expenses: number; qbo_net_income: number; synced_at: string }>();
    for (const p of pnlRes.data ?? []) {
      pnlMap.set(p.project_id, p);
    }

    const built: ReconciliationRow[] = (projectsRes.data ?? [])
      .filter((p) => p.qbo_project_id) // only projects with QBO link
      .map((p) => {
        const pnl = pnlMap.get(p.id) ?? pnlMap.get(String(p.qbo_project_id));
        const trackerExpenses = p.total_spent ?? 0;
        const trackerLabor = p.qbo_labor_cost ?? 0;
        const trackerTotalCost = trackerExpenses + trackerLabor;
        const trackerGP = p.contract_amount != null ? p.contract_amount - trackerTotalCost : null;
        const qboNetIncome = pnl?.qbo_net_income ?? null;

        let delta: number | null = null;
        let deltaPct: number | null = null;
        let flagged = false;

        if (trackerGP != null && qboNetIncome != null) {
          delta = qboNetIncome - trackerGP;
          deltaPct = trackerGP !== 0 ? (Math.abs(delta) / Math.abs(trackerGP)) * 100 : null;
          flagged = Math.abs(delta) > VARIANCE_ABS_THRESHOLD || (deltaPct != null && deltaPct > VARIANCE_PCT_THRESHOLD);
        }

        return {
          project_id: p.id,
          name: p.name,
          status: p.status,
          contract_amount: p.contract_amount,
          tracker_expenses: trackerExpenses,
          tracker_labor: trackerLabor,
          tracker_total_cost: trackerTotalCost,
          tracker_gp: trackerGP,
          qbo_income: pnl?.qbo_income ?? null,
          qbo_expenses: pnl?.qbo_expenses ?? null,
          qbo_net_income: qboNetIncome,
          qbo_synced_at: pnl?.synced_at ?? null,
          delta,
          delta_pct: deltaPct,
          flagged,
        };
      });

    // Sort: flagged first, then by abs delta desc
    built.sort((a, b) => {
      if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
      return Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0);
    });

    setRows(built);
    setLoading(false);
  }, []);

  useEffect(() => {
    checkAdmin().then(() => fetchData());
  }, [checkAdmin, fetchData]);

  async function syncProject(projectId: string | "all") {
    setSyncing(projectId);
    try {
      const body = projectId === "all" ? {} : { projectId };
      const res = await fetch("/api/qbo/project-pnl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json() as { synced?: number; error?: string };
      if (!res.ok || result.error) {
        toast.error("Sync failed: " + (result.error ?? "unknown error"));
      } else {
        toast.success(`Synced ${result.synced} project(s) from QBO`);
        await fetchData();
      }
    } catch (err) {
      toast.error("Sync request failed: " + String(err));
    }
    setSyncing(null);
  }

  if (!isAdmin) return null;

  const filtered = rows.filter((r) => {
    if (statusFilter === "flagged" && !r.flagged) return false;
    if (projectFilter !== "all" && r.status !== projectFilter) return false;
    return true;
  });

  const flaggedCount = rows.filter((r) => r.flagged).length;
  const unsyncedCount = rows.filter((r) => !r.qbo_synced_at).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">QBO Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Compare tracker P&amp;L vs QuickBooks actuals
          </p>
        </div>
        <Button
          onClick={() => syncProject("all")}
          disabled={syncing !== null}
          size="sm"
        >
          {syncing === "all" ? "Syncing all…" : "Sync All from QBO"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Projects with QBO link</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{rows.length}</p></CardContent>
        </Card>
        <Card className={flaggedCount > 0 ? "border-yellow-300" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Flagged variances</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${flaggedCount > 0 ? "text-yellow-600" : "text-green-600"}`}>{flaggedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">&gt;{VARIANCE_PCT_THRESHOLD}% or &gt;${VARIANCE_ABS_THRESHOLD} diff</p>
          </CardContent>
        </Card>
        <Card className={unsyncedCount > 0 ? "border-orange-200" : ""}>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Not yet synced</CardTitle></CardHeader>
          <CardContent><p className={`text-3xl font-bold ${unsyncedCount > 0 ? "text-orange-600" : "text-green-600"}`}>{unsyncedCount}</p></CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="flex rounded-md border overflow-hidden">
          {(["flagged", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 text-sm transition-colors ${statusFilter === f ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              {f === "flagged" ? `⚠️ Flagged (${flaggedCount})` : "All"}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border overflow-hidden">
          {(["all", "Active", "Completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setProjectFilter(f)}
              className={`px-3 py-1.5 text-sm transition-colors ${projectFilter === f ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-accent"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-muted-foreground py-12 text-center text-sm">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-12 text-center text-sm">
              {statusFilter === "flagged" ? "No flagged variances 🎉" : "No projects with QBO links found."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Project</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tracker GP</TableHead>
                  <TableHead className="text-right">QBO Net Income</TableHead>
                  <TableHead className="text-right">Delta</TableHead>
                  <TableHead className="text-right">Delta %</TableHead>
                  <TableHead className="text-center">Flag</TableHead>
                  <TableHead>Last Synced</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.project_id} className={row.flagged ? "bg-yellow-50/50 dark:bg-yellow-950/20" : ""}>
                    <TableCell className="font-medium">
                      <Link href={`/projects/${row.project_id}`} className="text-blue-600 hover:underline">
                        {row.name}
                      </Link>
                      {row.contract_amount && (
                        <div className="text-xs text-muted-foreground">{formatCurrency(row.contract_amount)}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "Active" ? "default" : "secondary"}>{row.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.tracker_gp != null ? (
                        <span className={row.tracker_gp >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(row.tracker_gp)}
                        </span>
                      ) : "—"}
                      {row.tracker_gp != null && (
                        <div className="text-xs text-muted-foreground">
                          {formatCurrency(row.tracker_expenses)} exp + {formatCurrency(row.tracker_labor)} labor
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.qbo_net_income != null ? (
                        <span className={row.qbo_net_income >= 0 ? "text-green-600" : "text-red-600"}>
                          {formatCurrency(row.qbo_net_income)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic text-xs">not synced</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.delta != null ? (
                        <span className={Math.abs(row.delta) > VARIANCE_ABS_THRESHOLD ? "text-yellow-600 font-semibold" : "text-muted-foreground"}>
                          {row.delta >= 0 ? "+" : ""}{formatCurrency(row.delta)}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {row.delta_pct != null ? (
                        <span className={row.delta_pct > VARIANCE_PCT_THRESHOLD ? "text-yellow-600 font-semibold" : "text-muted-foreground"}>
                          {row.delta_pct.toFixed(1)}%
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {row.flagged ? (
                        <span title="Variance exceeds threshold">⚠️</span>
                      ) : row.qbo_synced_at ? (
                        <span className="text-green-500" title="Within tolerance">✓</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {row.qbo_synced_at
                        ? new Date(row.qbo_synced_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={syncing !== null}
                        onClick={() => syncProject(row.project_id)}
                      >
                        {syncing === row.project_id ? "…" : "Sync"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Flags when delta exceeds {VARIANCE_PCT_THRESHOLD}% or ${VARIANCE_ABS_THRESHOLD}. Tracker GP = contract − (expenses + labor). QBO Net Income = income − all expenses per job in QuickBooks.
      </p>
    </div>
  );
}
