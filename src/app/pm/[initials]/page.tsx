"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ProjectSummary, getPMName, PM_NAMES } from "@/lib/types";
import { canSeeTeamBonuses } from "@/lib/bonus-access";
import { buildPmBonusRows, type BonusRow } from "@/lib/pm-bonus";
import { formatCurrency } from "@/lib/constants";
import { nowCentral, formatDateCentral } from "@/lib/date-utils";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

type TimePeriod = "by-project" | "this-month" | "this-quarter" | "this-half" | "this-year" | "all-time";

function getDateRange(period: TimePeriod): { start: Date; end: Date } | null {
  if (period === "by-project" || period === "all-time") return null;

  const now = nowCentral();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed

  switch (period) {
    case "this-month":
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month + 1, 0, 23, 59, 59),
      };
    case "this-quarter": {
      const qStart = Math.floor(month / 3) * 3;
      return {
        start: new Date(year, qStart, 1),
        end: new Date(year, qStart + 3, 0, 23, 59, 59),
      };
    }
    case "this-half": {
      const hStart = month < 6 ? 0 : 6;
      const hEnd = month < 6 ? 5 : 11;
      return {
        start: new Date(year, hStart, 1),
        end: new Date(year, hEnd + 1, 0, 23, 59, 59),
      };
    }
    case "this-year":
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31, 23, 59, 59),
      };
  }
}

function getPeriodLabel(period: TimePeriod): string {
  const now = nowCentral();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (period) {
    case "by-project":
      return "All Completed Projects";
    case "this-month":
      return now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    case "this-quarter": {
      const q = Math.floor(month / 3) + 1;
      return `Q${q} ${year}`;
    }
    case "this-half":
      return month < 6 ? `H1 ${year}` : `H2 ${year}`;
    case "this-year":
      return `${year}`;
    case "all-time":
      return "All Time";
  }
}

interface ProjectPnlRow {
  project_id: string;
  qbo_income: number | null;
  qbo_expenses: number | null;
  qbo_net_income: number | null;
  synced_at: string | null;
}

function filterByPeriod(projects: ProjectSummary[], period: TimePeriod): ProjectSummary[] {
  const range = getDateRange(period);
  if (!range) return projects;

  return projects.filter((p) => {
    if (!p.close_date) return false;
    const d = new Date(p.close_date + "T00:00:00");
    return d >= range.start && d <= range.end;
  });
}

export default function PMBonusPage() {
  const params = useParams();
  const router = useRouter();
  const initials = (params.initials as string).toUpperCase();
  const pmName = getPMName(initials);
  const isValidPM = initials in PM_NAMES;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectPnlById, setProjectPnlById] = useState<Map<string, ProjectPnlRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessGranted, setAccessGranted] = useState(false);
  const [activeTab, setActiveTab] = useState<TimePeriod>("by-project");

  // Access control
  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }

      const email = session.user.email?.toLowerCase() ?? "";

      // Check user_roles table
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, pm_initials")
        .eq("email", email)
        .single();

      if (canSeeTeamBonuses(roleData?.role)) {
        setAccessGranted(true);
        setAccessChecked(true);
        return;
      }

      // No match — redirect home
      router.replace("/");
    }
    checkAccess();
  }, [initials, router]);

  // Fetch bonus data after access is confirmed
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: projectData } = await supabase
        .from("project_summary")
        .select("*")
        .eq("pm", initials)
        .eq("status", "Completed")
        .not("contract_amount", "is", null)
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
    if (accessChecked && accessGranted && isValidPM) fetchData();
    else if (accessChecked) setLoading(false);
  }, [initials, isValidPM, accessChecked, accessGranted]);

  if (!accessChecked) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-lg">Checking permissions...</p>
      </div>
    );
  }

  if (!isValidPM) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-lg">Unknown PM: {initials}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-lg">Loading bonus data...</p>
      </div>
    );
  }

  // All-time bonus for the header card
  const allTimeBonusRows = buildPmBonusRows(projects, projectPnlById);
  const allTimeBonus = allTimeBonusRows.reduce((sum: number, r: BonusRow) => sum + r.bonus, 0);
  const allTimeSyncedCount = allTimeBonusRows.filter((row) => row.bonus_source === "qbo").length;

  const periodProjects = filterByPeriod(projects, activeTab);
  const bonusRows = buildPmBonusRows(periodProjects, projectPnlById);
  bonusRows.sort((a: BonusRow, b: BonusRow) => {
    if (!a.close_date && !b.close_date) return 0;
    if (!a.close_date) return 1;
    if (!b.close_date) return -1;
    return b.close_date.localeCompare(a.close_date);
  });

  const totals = bonusRows.reduce(
    (acc: { income: number; expenses: number; gp: number; bonus: number; synced: number }, r: BonusRow) => ({
      income: acc.income + (r.qbo_income ?? 0),
      expenses: acc.expenses + (r.qbo_expenses ?? 0),
      gp: acc.gp + (r.gross_profit ?? 0),
      bonus: acc.bonus + r.bonus,
      synced: acc.synced + (r.bonus_source === "qbo" ? 1 : 0),
    }),
    { income: 0, expenses: 0, gp: 0, bonus: 0, synced: 0 }
  );

  const tabs: { value: TimePeriod; label: string }[] = [
    { value: "by-project", label: "By Project" },
    { value: "this-month", label: "This Month" },
    { value: "this-quarter", label: "This Quarter" },
    { value: "this-half", label: "This Half" },
    { value: "this-year", label: "This Year" },
    { value: "all-time", label: "All Time" },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pmName}</h1>
          <p className="text-muted-foreground">PM Bonus Tracker</p>
        </div>
      </div>

      {/* All-time bonus hero card */}
      <Card className="border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Bonus Earned (All Time)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-green-600 dark:text-green-400">
            {formatCurrency(allTimeBonus)}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            1% of each project's QBO gross profit across {allTimeSyncedCount} synced completed project{allTimeSyncedCount !== 1 ? "s" : ""}
          </p>
          <p className="text-xs text-muted-foreground italic mt-1">QBO-backed projection — subject to change until books are finalized</p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TimePeriod)}
      >
        <Card>
          <CardHeader className="pb-0">
            <TabsList className="h-auto bg-transparent p-0 border-b w-full flex-wrap">
              {tabs.map((t) => (
                <TabsTrigger key={t.value} value={t.value} className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-4 py-2 -mb-px font-medium">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </CardHeader>
          <CardContent className="pt-6">
            {tabs.map((t) => (
              <TabsContent key={t.value} value={t.value} className="mt-0 space-y-6">
                {/* Period label */}
                <p className="text-sm text-muted-foreground font-medium">
                  {getPeriodLabel(t.value)}
                </p>

                {/* Summary stats for this period */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">Total Projects</p>
                    <p className="text-2xl font-bold mt-1">{bonusRows.length}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{totals.synced} synced to QBO</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">QBO Income</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(totals.income)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">QBO Expenses</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(totals.expenses)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-medium text-muted-foreground">QBO Gross Profit</p>
                    <p className={`text-2xl font-bold mt-1 ${totals.gp >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                      {formatCurrency(totals.gp)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-green-200 dark:border-green-900 p-3">
                    <p className="text-xs font-medium text-muted-foreground">Bonus Earned</p>
                    <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">
                      {formatCurrency(totals.bonus)}
                    </p>
                    <p className="text-xs text-muted-foreground italic mt-0.5">QBO-based bonus projection</p>
                  </div>
                </div>

                {/* Bonus breakdown table */}
                {bonusRows.length === 0 ? (
                  <p className="text-muted-foreground py-8 text-center">
                    No completed projects in this period.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Project ID</TableHead>
                        <TableHead>Project Name</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Close Date</TableHead>
                        <TableHead className="text-right">QBO Income</TableHead>
                        <TableHead className="text-right">QBO Expenses</TableHead>
                        <TableHead className="text-right">QBO Gross Profit</TableHead>
                        <TableHead className="text-right">Bonus (1%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bonusRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-mono text-sm">
                            <Link
                              href={`/projects/${row.id}`}
                              className="hover:underline"
                            >
                              {row.id}
                            </Link>
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link
                              href={`/projects/${row.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {row.name}
                            </Link>
                          </TableCell>
                          <TableCell>{row.client}</TableCell>
                          <TableCell>
                            {row.close_date
                              ? formatDateCentral(row.close_date + "T00:00:00")
                              : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.qbo_income != null ? formatCurrency(row.qbo_income) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.qbo_expenses != null ? formatCurrency(row.qbo_expenses) : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              (row.gross_profit ?? 0) < 0
                                ? "text-red-600 dark:text-red-400"
                                : ""
                            }`}
                          >
                            {row.gross_profit != null ? formatCurrency(row.gross_profit) : <span className="text-muted-foreground">Awaiting QBO sync</span>}
                          </TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              row.bonus > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-muted-foreground"
                            }`}
                          >
                            {row.bonus > 0 ? formatCurrency(row.bonus) : "$0"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="font-semibold">
                        <TableCell colSpan={4}>Totals</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totals.income)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totals.expenses)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${
                            totals.gp < 0
                              ? "text-red-600 dark:text-red-400"
                              : ""
                          }`}
                        >
                          {formatCurrency(totals.gp)}
                        </TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          {formatCurrency(totals.bonus)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                )}
              </TabsContent>
            ))}
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
