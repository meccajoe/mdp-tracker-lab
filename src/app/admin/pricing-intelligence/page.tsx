"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";

type PricingProject = {
  id: string;
  name: string | null;
  client: string | null;
  project_type: string | null;
  close_date: string | null;
  contract_amount: number | null;
  quote_materials: number | null;
  total_spent: number | null;
};

const PROJECT_TYPES = ["Trade Show", "Corporate Event", "Event Activation", "Pop-Up", "Retail", "Permanent", "Other"];
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function PricingIntelligencePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<PricingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"missing" | "all" | "typed">("missing");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("project_pricing_index")
      .select("id, name, client, project_type, close_date, contract_amount, quote_materials, total_spent")
      .order("close_date", { ascending: false, nullsFirst: false });
    if (error) toast.error(`Could not load pricing data: ${error.message}`);
    else setProjects((data ?? []) as PricingProject[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) return router.replace("/");
      const { data: roleRow } = await supabase.from("user_roles").select("role").eq("email", session.user.email.toLowerCase()).maybeSingle();
      if (roleRow?.role !== "admin") return router.replace("/");
      void load();
    }
    void checkAccess();
  }, [load, router]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (filter === "missing" && project.project_type) return false;
      if (filter === "typed" && !project.project_type) return false;
      return !query || [project.id, project.name, project.client, project.project_type].filter(Boolean).join(" ").toLowerCase().includes(query);
    });
  }, [filter, projects, search]);

  const typedCount = projects.filter((project) => project.project_type).length;
  const coverage = projects.length ? Math.round((typedCount / projects.length) * 100) : 0;

  async function setProjectType(project: PricingProject, projectType: string) {
    setSavingId(project.id);
    const { error } = await supabase.from("projects").update({ project_type: projectType || null }).eq("id", project.id);
    if (error) {
      toast.error(`Could not update project type: ${error.message}`);
    } else {
      setProjects((current) => current.map((entry) => entry.id === project.id ? { ...entry, project_type: projectType || null } : entry));
      toast.success(`${project.name ?? project.id} tagged${projectType ? ` as ${projectType}` : ""}.`);
    }
    setSavingId(null);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pricing Intelligence</p>
          <h1 className="text-2xl font-semibold tracking-tight">Project-type data health</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Tag quote-backed HubSpot projects so pricing comparisons use a meaningful project-type signal. This is a curation workflow—not a financial edit.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>Refresh</Button>
      </div>

      <section className="grid gap-3 sm:grid-cols-3">
        <Metric label="Quote-backed projects" value={String(projects.length)} />
        <Metric label="Tagged project type" value={`${typedCount} (${coverage}%)`} />
        <Metric label="Missing type" value={String(projects.length - typedCount)} />
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search job, client, or current type" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm md:max-w-sm" />
          <div className="flex flex-wrap gap-2">
            <FilterButton active={filter === "missing"} onClick={() => setFilter("missing")}>Missing type</FilterButton>
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>All indexed</FilterButton>
            <FilterButton active={filter === "typed"} onClick={() => setFilter("typed")}>Tagged</FilterButton>
          </div>
        </div>

        {loading ? <p className="p-6 text-sm text-muted-foreground">Loading pricing data...</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Project</th><th className="px-4 py-3">Client</th><th className="px-4 py-3">Contract</th><th className="px-4 py-3">Actual spend</th><th className="px-4 py-3">Project type</th></tr></thead>
              <tbody>{visibleProjects.map((project) => <tr key={project.id} className="border-t border-border/70"><td className="px-4 py-3"><p className="font-medium">{project.id} — {project.name ?? "Untitled"}</p><p className="text-xs text-muted-foreground">{project.close_date ?? "No close date"}</p></td><td className="px-4 py-3 text-muted-foreground">{project.client ?? "—"}</td><td className="px-4 py-3">{currency.format(project.contract_amount ?? 0)}</td><td className="px-4 py-3">{currency.format(project.total_spent ?? 0)}</td><td className="px-4 py-3"><select value={project.project_type ?? ""} onChange={(event) => void setProjectType(project, event.target.value)} disabled={savingId === project.id} className="min-w-40 rounded-md border border-border bg-background px-2 py-1.5 text-sm"><option value="">Choose type</option>{PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></td></tr>)}</tbody>
            </table>
            {!visibleProjects.length && <p className="p-6 text-sm text-muted-foreground">No projects match this filter.</p>}
          </div>
        )}
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>{children}</button>;
}
