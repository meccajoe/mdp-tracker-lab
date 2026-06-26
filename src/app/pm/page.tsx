"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PM_NAMES, ProjectSummary } from "@/lib/types";
import { canSeeTeamBonuses } from "@/lib/bonus-access";
import { buildPmBonusRows } from "@/lib/pm-bonus";
import { buildPmBonusMonthlyRollup } from "@/lib/pm-bonus-rollup";
import { formatCurrency } from "@/lib/constants";
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
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

interface ProjectPnlRow {
  project_id: string;
  qbo_income: number | null;
  qbo_expenses: number | null;
  qbo_net_income: number | null;
  synced_at: string | null;
}

const CHART_COLORS = ["#2563eb", "#059669", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#ea580c", "#4f46e5", "#65a30d", "#db2777", "#475569"];

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", { month: "short" });
}

export default function PMBonusSummaryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectPnlById, setProjectPnlById] = useState<Map<string, ProjectPnlRow>>(new Map());

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const email = session.user.email?.toLowerCase() ?? "";
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("email", email)
        .single();

      if (canSeeTeamBonuses(roleData?.role)) {
        setAccessGranted(true);
        setAccessChecked(true);
        return;
      }

      router.replace("/");
    }

    checkAccess();
  }, [router]);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: projectData } = await supabase
        .from("project_summary")
        .select("*")
        .eq("status", "Completed")
        .not("contract_amount", "is", null)
        .not("pm", "is", null)
        .order("close_date", { ascending: false });

      const typedProjects = (projectData as ProjectSummary[] | null) ?? [];
      setProjects(typedProjects);

      if (typedProjects.length > 0) {
        const projectIds = typedProjects.map((project) => project.id);
        const { data: pnlData } = await supabase
          .from("qbo_project_pnl")
          .select("project_id, qbo_income, qbo_expenses, qbo_net_income, synced_at")
          .in("project_id", projectIds);

        const pnlMap = new Map<string, ProjectPnlRow>();
        for (const row of (pnlData as ProjectPnlRow[] | null) ?? []) {
          pnlMap.set(row.project_id, row);
        }
        setProjectPnlById(pnlMap);
      } else {
        setProjectPnlById(new Map());
      }

      setLoading(false);
    }

    if (accessChecked && accessGranted) fetchData();
    else if (accessChecked) setLoading(false);
  }, [accessChecked, accessGranted]);

  const currentYear = new Date().getFullYear();

  const summary = useMemo(() => {
    const projectsByPm = new Map<string, ReturnType<typeof buildPmBonusRows>>();
    for (const project of projects) {
      if (!project.pm) continue;
      const existing = projectsByPm.get(project.pm) ?? [];
      projectsByPm.set(project.pm, [...existing, project] as unknown as ReturnType<typeof buildPmBonusRows>);
    }

    const bonusRowsByPm = new Map<string, ReturnType<typeof buildPmBonusRows>>();
    for (const [pmInitials, pmProjects] of projectsByPm.entries()) {
      bonusRowsByPm.set(pmInitials, buildPmBonusRows(pmProjects as unknown as ProjectSummary[], projectPnlById));
    }

    const rollup = buildPmBonusMonthlyRollup(bonusRowsByPm, currentYear);
    const chartData = rollup.monthKeys.map((monthKey) => {
      const row = { monthKey, monthLabel: monthLabel(monthKey) } as Record<string, string | number>;
      for (const pmRow of rollup.pmRows) {
        row[pmRow.pmInitials] = pmRow.monthBonuses[monthKey] ?? 0;
      }
      row.total = rollup.monthTotals[monthKey] ?? 0;
      return row;
    });
    return { rollup, chartData, syncedProjects: [...bonusRowsByPm.values()].flat().filter((row) => row.bonus_source === "qbo").length };
  }, [projects, projectPnlById, currentYear]);

  if (!accessChecked) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground text-lg">Checking permissions...</p></div>;
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><p className="text-muted-foreground text-lg">Loading bonus summary...</p></div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Bonus Summary</h1>
        <p className="text-muted-foreground">Admin-only rolled-up PM bonuses by month with YTD totals.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">YTD Total</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold text-green-600 dark:text-green-400">{formatCurrency(summary.rollup.ytdTotal)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">PMs Included</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{summary.rollup.pmRows.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Synced Completed Projects</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{summary.syncedProjects}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Bonus Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={summary.chartData} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" />
              <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString()}`} />
              <Tooltip formatter={(value) => formatCurrency(Number(value ?? 0))} />
              <Legend />
              {summary.rollup.pmRows.map((row, index) => (
                <Bar key={row.pmInitials} dataKey={row.pmInitials} stackId="pm-bonuses" fill={CHART_COLORS[index % CHART_COLORS.length]} name={PM_NAMES[row.pmInitials] ?? row.pmInitials} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Bonus Rollup</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PM</TableHead>
                {summary.rollup.monthKeys.map((monthKey) => (
                  <TableHead key={monthKey} className="text-right">{monthLabel(monthKey)}</TableHead>
                ))}
                <TableHead className="text-right">YTD Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rollup.pmRows.map((row) => (
                <TableRow key={row.pmInitials}>
                  <TableCell className="font-medium">{PM_NAMES[row.pmInitials] ?? row.pmInitials}</TableCell>
                  {summary.rollup.monthKeys.map((monthKey) => (
                    <TableCell key={monthKey} className="text-right">{formatCurrency(row.monthBonuses[monthKey] ?? 0)}</TableCell>
                  ))}
                  <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">{formatCurrency(row.ytdBonus)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>YTD Total</TableCell>
                {summary.rollup.monthKeys.map((monthKey) => (
                  <TableCell key={monthKey} className="text-right">{formatCurrency(summary.rollup.monthTotals[monthKey] ?? 0)}</TableCell>
                ))}
                <TableCell className="text-right text-green-600 dark:text-green-400">{formatCurrency(summary.rollup.ytdTotal)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
