"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ProjectSummary, Expense, PM_OPTIONS, getPMName } from "@/lib/types";
import {
  formatCurrency,
  getBudgetHealthClasses,
} from "@/lib/constants";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMAIL_TO_PM: Record<string, string> = {
  "victoria@meccadesign.com": "VW",
  "greg@meccadesign.com": "GM",
  "matt@meccadesign.com": "MS",
  "ashley@meccadesign.com": "AS",
  "nicole@meccadesign.com": "NG",
  "paul@meccadesign.com": "PM",
  "kevin@meccadesign.com": "KM",
  "kyle@meccadesign.com": "KS",
  "chad@meccadesign.com": "CC",
  "mike@meccadesign.com": "MM",
};

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [activePMs, setActivePMs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [pmFilter, setPmFilter] = useState<string>("All");
  const [defaultPmSet, setDefaultPmSet] = useState(false);
  const [expensePage, setExpensePage] = useState(0);
  const [search, setSearch] = useState("");
  const EXPENSES_PER_PAGE = 10;

  // Determine user role and default PM filter
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        const email = session.user.email.toLowerCase();
        const pmInitials = EMAIL_TO_PM[email];
        const isAdmin = email === "paul@meccadesign.com" || !pmInitials;
        if (!isAdmin && pmInitials) {
          setPmFilter(pmInitials);
        }
      }
      setDefaultPmSet(true);
    });
  }, []);

  // Fetch data once default PM is determined
  useEffect(() => {
    if (!defaultPmSet) return;

    async function fetchData() {
      setLoading(true);

      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
      const sinceDate = fourteenDaysAgo.toISOString().split("T")[0];

      const [projectsRes, expensesRes, pmRes] = await Promise.all([
        supabase
          .from("project_summary")
          .select("*")
          .order("name", { ascending: true }),
        supabase
          .from("expenses")
          .select("*")
          .gte("date", sinceDate)
          .order("date", { ascending: false }),
        supabase
          .from("user_roles")
          .select("pm_initials")
          .eq("show_in_filters", true)
          .not("pm_initials", "is", null),
      ]);

      if (projectsRes.data) setProjects(projectsRes.data as ProjectSummary[]);
      if (expensesRes.data) setRecentExpenses(expensesRes.data as Expense[]);
      if (pmRes.data) setActivePMs(pmRes.data.map((r) => r.pm_initials as string).sort());
      setLoading(false);
    }

    fetchData();
  }, [defaultPmSet]);

  const filteredProjects =
    pmFilter === "All"
      ? projects.filter((p) => p.status === "Active")
      : projects.filter((p) => p.status === "Active" && p.pm === pmFilter);

  const searchFiltered = search
    ? filteredProjects.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.name?.toLowerCase().includes(q) ||
          p.client?.toLowerCase().includes(q) ||
          String(p.id).includes(q)
        );
      })
    : filteredProjects;

  type DashSortField = "name" | "pm" | "pct_budget_used" | "total_cost" | "close_date";
  const [dashSort, setDashSort] = useState<{ field: DashSortField; dir: "asc" | "desc" }>({ field: "close_date", dir: "asc" });

  function handleDashSort(field: DashSortField) {
    setDashSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
  }

  const displayedProjects = [...searchFiltered].sort((a, b) => {
    const dir = dashSort.dir === "asc" ? 1 : -1;
    if (dashSort.field === "name") return (a.name ?? "").localeCompare(b.name ?? "") * dir;
    if (dashSort.field === "pm") return (a.pm ?? "").localeCompare(b.pm ?? "") * dir;
    if (dashSort.field === "pct_budget_used") return ((a.pct_budget_used ?? 0) - (b.pct_budget_used ?? 0)) * dir;
    if (dashSort.field === "total_cost") {
      const ac = (a.total_spent ?? 0) + (a.qbo_labor_cost ?? 0);
      const bc = (b.total_spent ?? 0) + (b.qbo_labor_cost ?? 0);
      return (ac - bc) * dir;
    }
    if (dashSort.field === "close_date") {
      const ad = (a as unknown as Record<string, string>).due_date;
      const bd = (b as unknown as Record<string, string>).due_date;
      if (!ad && !bd) return 0;
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd) * dir;
    }
    return 0;
  });

  // Filter expenses to match the active PM filter
  const filteredExpenses = pmFilter === "All"
    ? recentExpenses
    : recentExpenses.filter((e) => {
        const proj = projects.find((p) => p.id === e.project_id);
        return proj?.pm === pmFilter;
      });

  const overBudgetProjects = filteredProjects.filter(
    (p) => p.total_spent > p.total_budget && p.total_budget > 0
  );

  const totalContractValue = filteredProjects.reduce(
    (sum, p) => sum + (p.contract_amount ?? 0),
    0
  );
  const totalCommittedSpend = filteredProjects.reduce(
    (sum, p) => sum + p.total_spent,
    0
  );
  const totalRemainingBudget = filteredProjects.reduce(
    (sum, p) => sum + Math.max(0, p.total_budget - p.total_spent),
    0
  );

  // P&L calculations
  // Total cost = expenses (total_spent) + labor (qbo_labor_cost)
  // Projected P&L = contract_amount - total_cost
  const totalLaborCost = filteredProjects.reduce(
    (sum, p) => sum + (p.qbo_labor_cost ?? 0),
    0
  );
  const totalProjectedCost = totalCommittedSpend + totalLaborCost;
  const totalProjectedPnL = totalContractValue - totalProjectedCost;
  const portfolioMarginPct = totalContractValue > 0
    ? (totalProjectedPnL / totalContractValue) * 100
    : 0;

  const filterLabel =
    pmFilter === "All"
      ? "All Projects"
      : `${getPMName(pmFilter)} projects`;

  const [chartOpen, setChartOpen] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-lg">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          {filteredProjects.length} active project{filteredProjects.length !== 1 ? "s" : ""}{pmFilter !== "All" ? ` · ${getPMName(pmFilter)}` : ""}
        </p>
      </div>



      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{filteredProjects.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contract Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(totalContractValue)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cost to Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCurrency(totalProjectedCost)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(totalCommittedSpend)} expenses + {formatCurrency(totalLaborCost)} labor
            </p>
          </CardContent>
        </Card>

        <Card className={totalProjectedPnL >= 0 ? "border-emerald-200" : "border-red-200"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">P&amp;L to Date</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${totalProjectedPnL >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {totalProjectedPnL >= 0 ? "+" : ""}{formatCurrency(totalProjectedPnL)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {portfolioMarginPct.toFixed(1)}% margin · {filteredProjects.filter(p => p.contract_amount).length} priced projects
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Over-Budget Alerts */}
      {overBudgetProjects.length > 0 && (
        <Card className="border-red-200 bg-red-50/50">
          <CardHeader>
            <CardTitle className="text-red-700 text-lg">
              Over-Budget Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overBudgetProjects.map((p) => {
                const overBy = p.total_spent - p.total_budget;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-md border border-red-200 bg-white px-4 py-3"
                  >
                    <div>
                      <Link
                        href={`/projects/${p.id}`}
                        className="font-medium text-red-700 hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="text-sm text-red-600">
                        {formatCurrency(overBy)} over budget (
                        {p.pct_budget_used.toFixed(0)}% used)
                      </p>
                    </div>
                    <span className="bg-red-100 text-red-700 border border-red-200 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      Over Budget
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Projects Table */}
      <Card>
        <CardHeader className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Active Projects</CardTitle>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={pmFilter} onValueChange={(v) => { setPmFilter(v ?? "All"); setExpensePage(0); }}>
              <SelectTrigger className="w-44">
                <SelectValue>{pmFilter === "All" ? "All PMs" : getPMName(pmFilter)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All PMs</SelectItem>
                {activePMs.map((initials) => (
                  <SelectItem key={initials} value={initials}>{getPMName(initials)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full sm:w-56"
            />
          </div>
        </CardHeader>
        <CardContent>
          {displayedProjects.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">
              No active projects found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px] text-xs px-2">ID</TableHead>
                  <TableHead className="cursor-pointer select-none text-xs px-2" onClick={() => handleDashSort("name")}>
                    Name {dashSort.field === "name" ? (dashSort.dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                  </TableHead>
                  <TableHead className="text-xs px-2">Client</TableHead>
                  <TableHead className="cursor-pointer select-none text-xs px-2" onClick={() => handleDashSort("pm")}>
                    PM {dashSort.field === "pm" ? (dashSort.dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                  </TableHead>
                  <TableHead className="text-right text-xs px-2">Contract</TableHead>
                  <TableHead className="cursor-pointer select-none text-xs px-2" onClick={() => handleDashSort("pct_budget_used")}>
                    Budget {dashSort.field === "pct_budget_used" ? (dashSort.dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-right text-xs px-2" onClick={() => handleDashSort("total_cost")}>
                    Total Cost {dashSort.field === "total_cost" ? (dashSort.dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                  </TableHead>
                  <TableHead className="cursor-pointer select-none text-xs px-2" onClick={() => handleDashSort("close_date")}>
                    Due Date {dashSort.field === "close_date" ? (dashSort.dir === "asc" ? "↑" : "↓") : <span className="opacity-30">↕</span>}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedProjects.map((project) => {
                  const pct = project.pct_budget_used;
                  const health = getBudgetHealthClasses(pct);
                  const totalCost = (project.total_spent ?? 0) + (project.qbo_labor_cost ?? 0);

                  return (
                    <TableRow key={project.id}>
                      <TableCell className="font-mono text-xs px-2">
                        {project.id}
                      </TableCell>
                      <TableCell className="px-2">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-blue-600 hover:underline text-sm"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm px-2">{project.client}</TableCell>
                      <TableCell className="px-2">
                        <Link
                          href={`/pm/${project.pm}`}
                          className="text-blue-600 hover:underline text-sm"
                        >
                          {getPMName(project.pm)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right text-sm px-2">
                        {formatCurrency(project.contract_amount)}
                      </TableCell>
                      <TableCell className="px-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${health.pill}`}>
                          {pct.toFixed(0)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm px-2">
                        {formatCurrency(totalCost)}
                      </TableCell>
                      <TableCell className="text-sm px-2 whitespace-nowrap">
                        {(() => {
                          const dd = (project as unknown as Record<string, string>).due_date;
                          return dd ? new Date(dd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
                        })()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Budget vs Spend Bar Chart — collapsible */}
      {displayedProjects.length > 0 && (
        <Card>
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setChartOpen((o) => !o)}
          >
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Budget vs Spend — Active Projects</CardTitle>
                {chartOpen && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Blue = total budget · Green = committed spend · Red bar = over budget
                  </p>
                )}
              </div>
              <span className="text-muted-foreground text-sm ml-4">
                {chartOpen ? "▲ Hide" : "▼ Show"}
              </span>
            </div>
          </CardHeader>
          {chartOpen && (
            <CardContent>
              <ResponsiveContainer width="100%" height={Math.max(280, displayedProjects.length * 32)}>
                <BarChart
                  layout="vertical"
                  data={displayedProjects.map((p) => ({
                    name: p.name.length > 22 ? p.name.slice(0, 22) + "…" : p.name,
                    Budget: Math.round(p.total_budget),
                    Spend: Math.round(p.total_spent),
                    overBudget: p.total_spent > p.total_budget && p.total_budget > 0,
                  }))}
                  margin={{ top: 0, right: 40, left: 8, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={160}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(Number(value)), String(name)]}
                  />
                  <Legend />
                  <Bar dataKey="Budget" fill="#3b82f6" radius={[0, 3, 3, 0]} maxBarSize={14} />
                  <Bar dataKey="Spend" radius={[0, 3, 3, 0]} maxBarSize={14}>
                    {displayedProjects.map((p, i) => (
                      <Cell
                        key={i}
                        fill={p.total_spent > p.total_budget && p.total_budget > 0 ? "#ef4444" : "#10b981"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          )}
        </Card>
      )}

      {/* Recent Expenses — last 14 days, paginated */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Recent Expenses
            <span className="text-muted-foreground font-normal text-sm ml-2">(last 14 days)</span>
          </CardTitle>
          <Link href="/expenses">
            <Button variant="outline" size="sm">See all →</Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {filteredExpenses.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No expenses in the last 14 days.</p>
          ) : (() => {
            const totalPages = Math.ceil(filteredExpenses.length / EXPENSES_PER_PAGE);
            const pageExpenses = filteredExpenses.slice(expensePage * EXPENSES_PER_PAGE, (expensePage + 1) * EXPENSES_PER_PAGE);
            return (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageExpenses.map((expense) => {
                      const project = projects.find((p) => p.id === expense.project_id);
                      return (
                        <TableRow key={expense.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {new Date(expense.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </TableCell>
                          <TableCell>
                            {project ? (
                              <Link href={`/projects/${project.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                                {project.name}
                              </Link>
                            ) : (
                              <span className="text-sm">{expense.project_id}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{expense.vendor ?? "-"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{expense.category}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatCurrency(expense.amount)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 py-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full"
                      disabled={expensePage === 0}
                      onClick={() => setExpensePage((p) => p - 1)}
                    >
                      ‹
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      {expensePage + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0 rounded-full"
                      disabled={expensePage >= totalPages - 1}
                      onClick={() => setExpensePage((p) => p + 1)}
                    >
                      ›
                    </Button>
                  </div>
                )}
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
