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

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold flex-shrink-0">
          {initials}
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{pmName}</h1>
          <p className="text-muted-foreground">PM Bonus Tracker</p>
        </div>
      </div>

      <Card className="border-yellow-300 bg-yellow-50/70 dark:border-yellow-900 dark:bg-yellow-950/20">
        <CardHeader>
          <CardTitle>PM bonus tracker is temporarily unavailable</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            QBO project profitability source is being repaired.
          </p>
          <p>
            We found that the current synced QBO profitability values are repeating company-level totals across projects instead of using true per-project profit from the QBO project details surface.
          </p>
          <p>
            The page is hidden until the tracker is reading the correct project-level income, expenses, and profit values.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
