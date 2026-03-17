"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ProjectSummary, getPMName, PM_NAMES } from "@/lib/types";
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

const BONUS_RATE = 0.01;

type TimePeriod = "by-project" | "this-month" | "this-quarter" | "this-half" | "this-year" | "all-time";

function getDateRange(period: TimePeriod): { start: Date; end: Date } | null {
  if (period === "by-project" || period === "all-time") return null;

  const now = new Date();
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
  const now = new Date();
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

interface BonusRow {
  id: string;
  name: string;
  client: string;
  close_date: string | null;
  contract_amount: number | null;
  total_spent: number;
  gross_profit: number;
  bonus: number;
}

function computeBonusRows(projects: ProjectSummary[]): BonusRow[] {
  return projects.map((p) => {
    const contract = p.contract_amount ?? 0;
    const grossProfit = contract - p.total_spent;
    const bonus = Math.max(0, grossProfit) * BONUS_RATE;
    return {
      id: p.id,
      name: p.name,
      client: p.client,
      close_date: p.close_date,
      contract_amount: p.contract_amount,
      total_spent: p.total_spent,
      gross_profit: grossProfit,
      bonus,
    };
  });
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

// Map first names (from PM_NAMES) to initials for email-based fallback
const FIRST_NAME_TO_INITIALS: Record<string, string> = {};
for (const [init, fullName] of Object.entries(PM_NAMES)) {
  const firstName = fullName.split(" ")[0].toLowerCase();
  FIRST_NAME_TO_INITIALS[firstName] = init;
}

export default function PMBonusPage() {
  const params = useParams();
  const router = useRouter();
  const initials = (params.initials as string).toUpperCase();
  const pmName = getPMName(initials);
  const isValidPM = initials in PM_NAMES;

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
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

      if (roleData?.role === "admin") {
        setAccessGranted(true);
        setAccessChecked(true);
        return;
      }

      if (roleData?.role === "pm") {
        if (roleData.pm_initials?.toUpperCase() === initials) {
          setAccessGranted(true);
        } else {
          router.replace(`/pm/${roleData.pm_initials}`);
          return;
        }
        setAccessChecked(true);
        return;
      }

      // Fallback: email-based mapping
      const emailPrefix = email.split("@")[0];
      const matchedInitials = FIRST_NAME_TO_INITIALS[emailPrefix];
      if (matchedInitials) {
        if (matchedInitials.toUpperCase() === initials) {
          setAccessGranted(true);
        } else {
          router.replace(`/pm/${matchedInitials}`);
          return;
        }
        setAccessChecked(true);
        return;
      }

      // Admin fallback for paul@ or admin@
      if (emailPrefix === "paul" || emailPrefix === "admin") {
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
      const { data } = await supabase
        .from("project_summary")
        .select("*")
        .eq("pm", initials)
        .eq("status", "Completed")
        .not("contract_amount", "is", null)
        .order("close_date", { ascending: false });

      if (data) setProjects(data as ProjectSummary[]);
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
  const allTimeBonusRows = computeBonusRows(projects);
  const allTimeBonus = allTimeBonusRows.reduce((sum, r) => sum + r.bonus, 0);

  const periodProjects = filterByPeriod(projects, activeTab);
  const bonusRows = computeBonusRows(periodProjects);
  bonusRows.sort((a, b) => {
    if (!a.close_date && !b.close_date) return 0;
    if (!a.close_date) return 1;
    if (!b.close_date) return -1;
    return b.close_date.localeCompare(a.close_date);
  });

  const totals = bonusRows.reduce(
    (acc, r) => ({
      contract: acc.contract + (r.contract_amount ?? 0),
      spent: acc.spent + r.total_spent,
      gp: acc.gp + r.gross_profit,
      bonus: acc.bonus + r.bonus,
    }),
    { contract: 0, spent: 0, gp: 0, bonus: 0 }
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
            1% of gross profit across {projects.length} completed project{projects.length !== 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TimePeriod)}
      >
        <TabsList className="flex-wrap">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="space-y-6">
            {/* Period label */}
            <p className="text-sm text-muted-foreground font-medium">
              {getPeriodLabel(t.value)}
            </p>

            {/* Summary card for this period */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Total Projects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{bonusRows.length}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Contract Value
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(totals.contract)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Total Spent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatCurrency(totals.spent)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Gross Profit
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-2xl font-bold ${totals.gp >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {formatCurrency(totals.gp)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-green-200 dark:border-green-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-muted-foreground">
                    Bonus Earned
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatCurrency(totals.bonus)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Bonus breakdown table */}
            <Card>
              <CardContent className="p-0">
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
                        <TableHead className="text-right">Contract</TableHead>
                        <TableHead className="text-right">Total Spent</TableHead>
                        <TableHead className="text-right">Gross Profit</TableHead>
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
                              ? new Date(row.close_date + "T00:00:00").toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "N/A"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.contract_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.total_spent)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium ${
                              row.gross_profit < 0
                                ? "text-red-600 dark:text-red-400"
                                : ""
                            }`}
                          >
                            {formatCurrency(row.gross_profit)}
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
                          {formatCurrency(totals.contract)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(totals.spent)}
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
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
