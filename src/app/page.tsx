"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ProjectSummary, Expense } from "@/lib/types";
import {
  formatCurrency,
  formatNumber,
  getBudgetHealthColor,
  getBudgetHealthBadge,
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const [projectsRes, expensesRes] = await Promise.all([
        supabase
          .from("project_summary")
          .select("*")
          .order("name", { ascending: true }),
        supabase
          .from("expenses")
          .select("*")
          .order("date", { ascending: false })
          .limit(10),
      ]);

      if (projectsRes.data) setProjects(projectsRes.data as ProjectSummary[]);
      if (expensesRes.data) setExpenses(expensesRes.data as Expense[]);
      setLoading(false);
    }

    fetchData();
  }, []);

  const activeProjects = projects.filter((p) => p.status === "Active");
  const overBudgetProjects = projects.filter(
    (p) => p.status === "Active" && p.total_spent > p.total_budget && p.total_budget > 0
  );

  const totalContractValue = activeProjects.reduce(
    (sum, p) => sum + (p.contract_amount ?? 0),
    0
  );
  const totalCommittedSpend = activeProjects.reduce(
    (sum, p) => sum + p.total_spent,
    0
  );
  const totalRemainingBudget = activeProjects.reduce(
    (sum, p) => sum + Math.max(0, p.total_budget - p.total_spent),
    0
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground text-lg">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Portfolio overview and project cost tracking
        </p>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Projects
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{activeProjects.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Contract Value
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatCurrency(totalContractValue)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Committed Spend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatCurrency(totalCommittedSpend)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Remaining Budget
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {formatCurrency(totalRemainingBudget)}
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
                    <Badge variant="destructive">Over Budget</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle>Active Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {activeProjects.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">
              No active projects found.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>PM</TableHead>
                  <TableHead className="text-right">Contract</TableHead>
                  <TableHead className="w-[180px]">Budget Used</TableHead>
                  <TableHead>Close Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeProjects.map((project) => {
                  const pct = Math.min(project.pct_budget_used, 100);
                  const healthColor = getBudgetHealthColor(
                    project.pct_budget_used
                  );
                  const badgeVariant = getBudgetHealthBadge(
                    project.pct_budget_used
                  );

                  return (
                    <TableRow key={project.id}>
                      <TableCell className="font-mono text-sm">
                        {project.id}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell>{project.client}</TableCell>
                      <TableCell>{project.pm}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(project.contract_amount)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-2 flex-1" />
                          <Badge variant={badgeVariant} className="text-xs w-14 justify-center">
                            {project.pct_budget_used.toFixed(0)}%
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {project.close_date
                          ? new Date(project.close_date).toLocaleDateString(
                              "en-US",
                              {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              }
                            )
                          : "TBD"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Expenses Feed */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center">
              No recent expenses.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => {
                  const project = projects.find(
                    (p) => p.id === expense.project_id
                  );
                  return (
                    <TableRow key={expense.id}>
                      <TableCell>
                        {new Date(expense.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        {project ? (
                          <Link
                            href={`/projects/${project.id}`}
                            className="text-blue-600 hover:underline"
                          >
                            {project.name}
                          </Link>
                        ) : (
                          expense.project_id
                        )}
                      </TableCell>
                      <TableCell>{expense.category}</TableCell>
                      <TableCell>{expense.vendor ?? "-"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatCurrency(expense.amount)}
                      </TableCell>
                      <TableCell>
                        {expense.amount_pending ? (
                          <Badge variant="secondary">Pending</Badge>
                        ) : (
                          <Badge variant="default">Confirmed</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
