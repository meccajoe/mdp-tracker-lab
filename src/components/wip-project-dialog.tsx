"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ProjectSummary } from "@/lib/types";
import { WipReportRow, formatCurrency, formatDate } from "@/lib/wip-report";
import { ProjectLinkIcons } from "@/components/project-link-icons";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface WipProjectDialogProps {
  row: WipReportRow;
  triggerLabel: string;
  triggerClassName?: string;
}

export function WipProjectDialog({ row, triggerLabel, triggerClassName = "" }: WipProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (!row.project_id) {
      setProject(null);
      setProjectError("This snapshot row is not linked to a live project record.");
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={triggerClassName}>{triggerLabel}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{row.project_name}</DialogTitle>
          <DialogDescription>
            WIP project drill-in from the dashboard. Review the frozen WIP row, then jump into the full project when needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <div>
              <h3 className="font-medium">View Snapshot Row</h3>
              <p className="text-sm text-muted-foreground">
                This is the WIP row currently shown in the dashboard.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
              <Field label="Customer" value={row.customer} />
              <Field label="Project #" value={row.project_number ?? "—"} />
              <Field label="Project Name" value={row.project_name} />
              <Field label="Class" value={row.wip_class ?? "—"} />
              <Field label="Status" value={row.project_status ?? "—"} />
              <Field label="PM" value={row.pm_initials ?? "—"} />
              <Field label="Contract Date" value={formatDate(row.contract_date)} />
              <Field label="Contract Amount" value={formatCurrency(row.contract_amount)} />
              <Field label="Estimated Cost" value={formatCurrency(row.estimated_cost)} />
              <Field label="Estimate Source" value={row.estimated_cost_source === "manual_override" ? "Manual Override" : "Derived"} />
              <Field label="Sales Tax Included" value={row.sales_tax_included || "—"} />
              <Field label="Completion Date" value={formatDate(row.completion_date)} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-medium">Current Live Project</h3>
                <p className="text-sm text-muted-foreground">
                  Current project detail from MDP Tracker.
                </p>
              </div>
              {project ? (
                <ProjectLinkIcons
                  hubspotUrl={project.hubspot_deal_url}
                  qboUrl={project.qbo_project_url}
                />
              ) : null}
            </div>

            {loadingProject ? (
              <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">
                Loading live project details...
              </div>
            ) : project ? (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-border p-4 text-sm md:grid-cols-2 xl:grid-cols-3">
                <Field label="Job #" value={project.job_number ?? project.id} />
                <Field label="Project Name" value={project.name} />
                <Field label="Client" value={project.client} />
                <Field label="Status" value={project.status} />
                <Field label="PM" value={project.pm} />
                <Field label="Contract Amount" value={formatCurrency(project.contract_amount)} />
                <Field label="Close Date" value={formatDate(project.close_date)} />
                <Field label="Due Date" value={formatDate(project.due_date)} />
                <Field label="Total Budget" value={formatCurrency(project.total_budget)} />
                <Field label="Budget Used" value={`${Math.round(project.pct_budget_used ?? 0)}%`} />
                <Field label="Estimated Cost Override" value={formatCurrency(project.estimated_cost_override)} />
                <Field label="Last Updated" value={project.updated_at ? new Date(project.updated_at).toLocaleString() : "—"} />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                {projectError ?? "Live project details are unavailable for this row."}
              </div>
            )}
          </section>
        </div>

        <DialogFooter showCloseButton>
          {row.project_id ? (
            <>
              <Link
                href={`/projects/${row.project_id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                Edit Project
              </Link>
              <Link
                href={`/projects/${row.project_id}`}
                className={buttonVariants({ variant: "default" })}
              >
                Open Full Project
              </Link>
            </>
          ) : (
            <Button variant="outline" disabled>
              No linked live project
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1">{value}</p>
    </div>
  );
}
