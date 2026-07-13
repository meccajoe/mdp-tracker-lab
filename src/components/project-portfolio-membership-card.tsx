"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPortfolioMonitorConfig, listPortfolioMonitorOptions, normalizePortfolioMonitorKeys, type PortfolioMonitorKey } from "@/lib/project-portfolio-monitoring";

type SavedPortfolioProject = {
  project_id: string;
  ordinal: number;
  monitor_keys: PortfolioMonitorKey[];
};

type SavedPortfolio = {
  id: string;
  name: string;
  slug: string;
  projects?: SavedPortfolioProject[];
};

async function parseApiResponse<T>(response: Response): Promise<{ data: (T & { error?: string }) | null; error: string | null }> {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as T & { error?: string };
      return {
        data: parsed,
        error: response.ok ? null : (parsed.error ?? `Request failed with status ${response.status}`),
      };
    } catch {
      return {
        data: null,
        error: response.ok ? "Server returned invalid JSON." : `Request failed with invalid JSON (status ${response.status}).`,
      };
    }
  }

  return {
    data: null,
    error: raw.trim() || `Request failed with status ${response.status}`,
  };
}

export function ProjectPortfolioMembershipCard({ projectId }: { projectId: string }) {
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [selectedPortfolioSlug, setSelectedPortfolioSlug] = useState("");
  const [selectedMonitorKeys, setSelectedMonitorKeys] = useState<PortfolioMonitorKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingSlug, setRemovingSlug] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monitorOptions = useMemo(() => listPortfolioMonitorOptions(), []);

  async function loadSavedPortfolios() {
    setLoading(true);
    try {
      const response = await fetch("/api/project-portfolios");
      const { data, error } = await parseApiResponse<{ portfolios?: SavedPortfolio[] }>(response);
      if (error) throw new Error(error);
      const portfolios = data?.portfolios ?? [];
      setSavedPortfolios(portfolios);
      if (!selectedPortfolioSlug && portfolios[0]?.slug) {
        setSelectedPortfolioSlug(portfolios[0].slug);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load saved portfolios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSavedPortfolios();
  }, []);

  const memberships = useMemo(() => {
    return savedPortfolios
      .map((portfolio) => ({
        portfolio,
        membership: (portfolio.projects ?? []).find((project) => project.project_id === projectId) ?? null,
      }))
      .filter((row) => row.membership);
  }, [projectId, savedPortfolios]);

  useEffect(() => {
    const selected = savedPortfolios.find((portfolio) => portfolio.slug === selectedPortfolioSlug);
    const existingMembership = selected?.projects?.find((project) => project.project_id === projectId);
    setSelectedMonitorKeys(existingMembership?.monitor_keys ?? ["labor_budget_warning", "total_budget_overrun"]);
  }, [projectId, savedPortfolios, selectedPortfolioSlug]);

  function toggleMonitorKey(monitorKey: PortfolioMonitorKey) {
    setSelectedMonitorKeys((current) => current.includes(monitorKey)
      ? current.filter((value) => value !== monitorKey)
      : [...current, monitorKey]);
  }

  async function saveMembership() {
    if (!selectedPortfolioSlug) {
      setError("Choose a saved portfolio first.");
      return;
    }

    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/project-portfolios/${selectedPortfolioSlug}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          monitorKeys: normalizePortfolioMonitorKeys(selectedMonitorKeys),
        }),
      });
      const { error } = await parseApiResponse<{ portfolio?: SavedPortfolio }>(response);
      if (error) throw new Error(error);
      setStatus("Saved portfolio membership for this project.");
      await loadSavedPortfolios();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save portfolio membership");
    } finally {
      setSaving(false);
    }
  }

  async function removeMembership(slug: string) {
    setRemovingSlug(slug);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/project-portfolios/${slug}/projects`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const { error } = await parseApiResponse<{ portfolio?: SavedPortfolio }>(response);
      if (error) throw new Error(error);
      setStatus("Removed this project from the portfolio.");
      await loadSavedPortfolios();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to remove this project from the portfolio");
    } finally {
      setRemovingSlug(null);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border p-5">
      <div className="space-y-1">
        <p className="text-sm font-medium">Portfolio membership</p>
        <p className="text-xs text-muted-foreground">
          Add this project to a saved portfolio and choose the budgets or stats you want that portfolio to monitor.
        </p>
      </div>

      {status && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{status}</div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-md border bg-muted/30 px-3 py-3 text-xs text-muted-foreground">
        Need to create, rename, or manage whole portfolios? <Link href="/admin/portfolios" className="font-medium text-foreground underline underline-offset-2">Open portfolio center</Link>.
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Saved portfolio</span>
            <select value={selectedPortfolioSlug} onChange={(event) => setSelectedPortfolioSlug(event.target.value)} className="w-full rounded-md border px-3 py-2 bg-background">
              <option value="">Select a saved portfolio</option>
              {savedPortfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.slug}>{portfolio.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Stats or budgets to monitor</p>
          <div className="flex flex-wrap gap-2">
            {monitorOptions.map((option) => {
              const selected = selectedMonitorKeys.includes(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => toggleMonitorKey(option.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs ${selected ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={() => void saveMembership()} disabled={saving || !selectedPortfolioSlug || selectedMonitorKeys.length === 0}>
            {saving ? "Saving..." : "Add this project to a portfolio"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Current portfolio memberships</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadSavedPortfolios()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        {memberships.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
            This project is not in any saved portfolio yet.
          </div>
        ) : (
          <div className="space-y-2">
            {memberships.map(({ portfolio, membership }) => (
              <div key={portfolio.id} className="rounded-lg border px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div>
                      <div className="text-sm font-medium">{portfolio.name}</div>
                      <div className="text-xs text-muted-foreground">{portfolio.slug}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(membership?.monitor_keys ?? []).map((monitorKey) => (
                        <Badge key={monitorKey} variant="outline">{getPortfolioMonitorConfig(monitorKey)?.label ?? monitorKey}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setSelectedPortfolioSlug(portfolio.slug); setSelectedMonitorKeys(membership?.monitor_keys ?? []); }}>
                      Edit monitors
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void removeMembership(portfolio.slug)} disabled={removingSlug === portfolio.slug}>
                      {removingSlug === portfolio.slug ? "Removing..." : "Remove"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
