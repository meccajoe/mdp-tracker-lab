"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ProjectSummary, PM_OPTIONS, PROJECT_STATUSES, getPMName } from "@/lib/types";
import { formatCurrency, getBudgetHealthClasses } from "@/lib/constants";
import { ProjectLinkIcons } from "@/components/project-link-icons";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortField =
  | "id"
  | "status"
  | "pm"
  | "close_date"
  | "contract_amount"
  | "pct_budget_used"
  | "qbo_total_hours"
  | "qbo_labor_cost";
type SortDir = "asc" | "desc";

export default function ProjectsPage() {
  const searchParams = useSearchParams();
  const urlPm = searchParams.get("pm");

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activePMs, setActivePMs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("Active");
  const [pmFilter, setPmFilter] = useState<string>(urlPm ?? "All");
  const [sortField, setSortField] = useState<SortField>("id");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchProjects() {
      setLoading(true);
      const [{ data, error }, { data: pmRows }] = await Promise.all([
        supabase.from("project_summary").select("*"),
        supabase.from("user_roles").select("pm_initials").eq("show_in_filters", true).not("pm_initials", "is", null),
      ]);
      if (error) {
        console.error("Error fetching projects:", error);
      } else {
        setProjects((data as ProjectSummary[]) ?? []);
      }
      if (pmRows) setActivePMs(pmRows.map((r) => r.pm_initials as string).sort());
      setLoading(false);
    }
    fetchProjects();
  }, []);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const filtered = projects.filter((p) => {
    if (statusFilter !== "All" && p.status !== statusFilter) return false;
    if (pmFilter !== "All" && p.pm !== pmFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.name?.toLowerCase().includes(q) &&
        !p.client?.toLowerCase().includes(q) &&
        !String(p.id).includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortField === "id") {
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true }) * dir;
    }
    const valA = a[sortField];
    const valB = b[sortField];
    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === "string" && typeof valB === "string") {
      return valA.localeCompare(valB) * dir;
    }
    return ((valA as number) - (valB as number)) * dir;
  });

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  function statusBadgeClasses(status: string): string {
    switch (status) {
      case "Active":
        return "bg-green-100 text-green-700 border border-green-200";
      case "Completed":
        return "bg-red-100 text-red-700 border border-red-200";
      case "On Hold":
        return "bg-gray-100 text-gray-500 border border-gray-200";
      default:
        return "bg-gray-100 text-gray-500 border border-gray-200";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          <Select value={statusFilter} onValueChange={(v) => v !== null && setStatusFilter(v)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              {PROJECT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">PM:</span>
          <Select value={pmFilter} onValueChange={(v) => v !== null && setPmFilter(v)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All</SelectItem>
              {activePMs.map((pm) => (
                <SelectItem key={pm} value={pm}>
                  {getPMName(pm)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full max-w-sm">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
          />
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="w-[80px] cursor-pointer select-none"
                onClick={() => handleSort("id")}
              >
                Job #{sortIndicator("id")}
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Client</TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("pm")}
              >
                PM{sortIndicator("pm")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("status")}
              >
                Status{sortIndicator("status")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("contract_amount")}
              >
                Contract Amount{sortIndicator("contract_amount")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("pct_budget_used")}
              >
                Budget Used{sortIndicator("pct_budget_used")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
                onClick={() => handleSort("qbo_labor_cost")}
              >
                Total Cost{sortIndicator("qbo_labor_cost")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none text-right"
              >
                P&amp;L to Date
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("close_date")}
              >
                Due Date{sortIndicator("close_date")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  Loading projects...
                </TableCell>
              </TableRow>
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  No projects found.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((project) => {
                const pct = project.pct_budget_used;
                const clampedPct = Math.min(pct, 100);
                const health = getBudgetHealthClasses(pct);

                return (
                  <TableRow key={project.id} className="hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/projects/${project.id}`}
                        className="hover:underline"
                      >
                        {project.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/projects/${project.id}`}
                          className="hover:underline"
                        >
                          {project.name}
                        </Link>
                        <ProjectLinkIcons
                          hubspotUrl={project.hubspot_deal_url}
                          qboUrl={project.qbo_project_url}
                        />
                      </div>
                    </TableCell>
                    <TableCell>{project.client}</TableCell>
                    <TableCell>
                      <Link
                        href={`/pm/${project.pm}`}
                        className="text-blue-600 hover:underline"
                      >
                        {getPMName(project.pm)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${statusBadgeClasses(project.status)}`}
                      >
                        {project.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(project.contract_amount)}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full border ${health.pill}`}
                      >
                        {pct?.toFixed(1) ?? "0.0"}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency((project.total_spent ?? 0) + (project.qbo_labor_cost ?? 0))}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {(() => {
                        if (!project.contract_amount) return <span className="text-muted-foreground">—</span>;
                        const totalCost = (project.total_spent ?? 0) + (project.qbo_labor_cost ?? 0);
                        const pnl = project.contract_amount - totalCost;
                        const marginPct = project.contract_amount > 0 ? (pnl / project.contract_amount) * 100 : 0;
                        return (
                          <span className={pnl >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold"}>
                            {pnl >= 0 ? "+" : ""}{formatCurrency(pnl)}
                            <span className="text-xs font-normal ml-1 opacity-70">({marginPct.toFixed(0)}%)</span>
                          </span>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {project.close_date
                        ? new Date(project.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
