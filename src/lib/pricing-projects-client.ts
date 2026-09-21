"use client";

import { authenticatedFetch } from "@/lib/authenticated-fetch";

export type PricingProject = {
  id: string;
  name: string | null;
  client: string | null;
  project_type: string | null;
  close_date: string | null;
  contract_amount: number | null;
  quote_materials: number | null;
  total_spent: number | null;
};

// Read every page; the API caps each response at 100 projects.
export async function loadPricingProjects(): Promise<PricingProject[]> {
  const projects: PricingProject[] = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const response = await authenticatedFetch(
      `/api/pricing-intelligence/projects?limit=${limit}&offset=${offset}`,
      { cache: "no-store" },
    );
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `Pricing request failed (${response.status})`);
    if (!Array.isArray(result.projects)) throw new Error("Invalid pricing response");
    projects.push(...result.projects);
    if (result.projects.length < limit) return projects;
  }
}
