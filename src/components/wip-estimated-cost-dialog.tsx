"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ProjectSummary } from "@/lib/types";
import { WipReportRow, formatCurrency } from "@/lib/wip-report";
import { buildWipBudgetBreakdownRows } from "@/lib/wip-budget-breakdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const BUDGET_CATEGORY_TOOLTIPS: Record<string, string> = {
  "Labor Hours": "Saved hours if present; otherwise Materials quote × labor % ÷ $41/hr.",
  Materials: "Saved budget if present; otherwise Materials quote × materials %.",
  Design: "Saved budget if present; otherwise Design quote × design %.",
  "Project Management": "Saved budget if present; otherwise PM quote × PM %.",
  Shipping: "Saved budget if present; otherwise Shipping quote × shipping %.",
  Crating: "Saved budget if present; otherwise Crating quote × crating %.",
  "I&D Labor": "Saved budget if present; otherwise I&D quote × I&D %.",
  Travel: "Saved budget if present; otherwise Travel quote × travel %.",
  Props: "Saved budget if present; otherwise Props quote × props %.",
  Equipment: "Saved budget if present; otherwise Equipment quote × equipment %.",
  Rental: "Saved budget if present; otherwise Rental quote × rental %.",
  "Flooring/Graphics": "Saved budget if present; otherwise Flooring quote × flooring %.",
};

interface WipEstimatedCostDialogProps {
  row: WipReportRow;
  triggerLabel: string;
  triggerClassName?: string;
}

export function WipEstimatedCostDialog({ row, triggerLabel, triggerClassName = "" }: WipEstimatedCostDialogProps) {
  const [open, setOpen] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (!row.project_id) {
      setProject(null);
      setProjectError("This row is not linked to a live project record, so the budget breakdown is unavailable.");
      return;
    }

    let active = true;

    async function loadProject() {
      setLoadingProject(true);
      setProjectError(null);

      const { data, error } = await supabase
        .from("project_summary")
        .select("*")
        .eq("id", row.project_id)
        .single();

      if (!active) return;

      if (error || !data) {
        setProject(null);
        setProjectError(error?.message ?? "Live project record not found.");
      } else {
        setProject(data as ProjectSummary);
      }

      setLoadingProject(false);
    }

    loadProject();

    return () => {
      active = false;
    };
  }, [open, row.project_id]);

  const breakdownRows = useMemo(() => (project ? buildWipBudgetBreakdownRows(project) : []), [project]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClassName}>{triggerLabel}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Budget Breakdown — {row.project_name}</DialogTitle>
          <DialogDescription>
            Estimated cost drill-in showing category percentages and budget dollars behind this project’s WIP estimate.
          </DialogDescription>
        </DialogHeader>

        {loadingProject ? (
          <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
            Loading budget breakdown...
          </div>
        ) : project ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 text-sm md:grid-cols-2 xl:grid-cols-4">
              <SummaryField label="Project #" value={project.job_number ?? project.id} />
              <SummaryField label="Contract Amount" value={formatCurrency(project.contract_amount)} />
              <SummaryField label="Estimated Cost Shown in WIP" value={formatCurrency(row.estimated_cost)} />
              <SummaryField label="Current Total Budget" value={formatCurrency(project.total_budget)} />
            </div>

            <p className="text-sm text-muted-foreground">
              Category breakdown includes Labor Hours, Materials, Design, Project Management, Shipping, Crating, I&D Labor, Travel, Props, Equipment, Rental, and Flooring/Graphics.
            </p>
            <p className="text-xs text-muted-foreground">
              Percent uses project override when set; otherwise the default model percentage.
            </p>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium text-right">Percent</th>
                    <th className="px-3 py-2 font-medium text-right">Budget Basis</th>
                    <th className="px-3 py-2 font-medium text-right">Budget Dollars</th>
                    <th className="px-3 py-2 font-medium text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {breakdownRows.map((item) => (
                    <tr key={item.category} className="border-t border-border even:bg-muted/15">
                      <td className="px-3 py-2 font-medium">
                        <span
                          title={BUDGET_CATEGORY_TOOLTIPS[item.category]}
                          className="cursor-help decoration-dotted underline-offset-4 hover:underline"
                        >
                          {item.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{item.percent}%</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{formatCurrency(item.basisAmount)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.budgetDollars)}</td>
                      <td className="px-3 py-2 text-right text-muted-foreground">{item.budgetHours != null ? `${item.budgetHours}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            {projectError ?? "Budget breakdown is unavailable for this row."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SummaryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
