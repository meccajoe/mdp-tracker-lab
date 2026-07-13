"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPortfolioMonitorConfig, listPortfolioMonitorOptions, type PortfolioMonitorKey } from "@/lib/project-portfolio-monitoring";

type SavedPortfolioProject = {
  project_id: string;
  ordinal: number;
  monitor_keys: PortfolioMonitorKey[];
};

type SavedPortfolio = {
  id: string;
  name: string;
  slug: string;
  project_ids?: string[];
  projects?: SavedPortfolioProject[];
};

type PortfolioSubscription = {
  id: string;
  summary_text: string;
  status: "active" | "paused" | "archived";
  last_triggered_at: string | null;
  scope_type: string;
  scope_json?: Record<string, unknown> | null;
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

function formatDateTime(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ProjectPortfolioManager({
  initialProjectId = null,
  defaultPmInitials,
}: {
  initialProjectId?: string | null;
  defaultPmInitials?: string | null;
}) {
  const [portfolioName, setPortfolioName] = useState("");
  const [portfolioProjects, setPortfolioProjects] = useState(initialProjectId ?? "");
  const [scopeType, setScopeType] = useState<"my_active_projects" | "all_active_projects" | "pm_active_projects" | "saved_portfolio">("all_active_projects");
  const [mode, setMode] = useState<"digest" | "over_budget" | "labor_risk">("digest");
  const [pmInitials, setPmInitials] = useState(defaultPmInitials ?? "");
  const [selectedPortfolioSlug, setSelectedPortfolioSlug] = useState("");
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [portfolioSubscriptions, setPortfolioSubscriptions] = useState<PortfolioSubscription[]>([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(false);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);
  const [deletingPortfolioSlug, setDeletingPortfolioSlug] = useState<string | null>(null);
  const [creatingMonitorKey, setCreatingMonitorKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scopeOptions = useMemo(() => ([
    { value: "all_active_projects", label: "All active projects" },
    { value: "my_active_projects", label: "My active projects" },
    { value: "pm_active_projects", label: "PM active projects" },
    { value: "saved_portfolio", label: "Saved portfolio" },
  ]), []);

  const monitorOptions = useMemo(() => listPortfolioMonitorOptions(), []);

  async function loadSavedPortfolios() {
    setLoadingPortfolios(true);
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
      setLoadingPortfolios(false);
    }
  }

  async function loadPortfolioSubscriptions() {
    setLoadingSubscriptions(true);
    try {
      const response = await fetch("/api/project-portfolio-subscriptions");
      const { data, error } = await parseApiResponse<{ subscriptions?: PortfolioSubscription[] }>(response);
      if (error) throw new Error(error);
      setPortfolioSubscriptions(data?.subscriptions ?? []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load portfolio subscriptions");
    } finally {
      setLoadingSubscriptions(false);
    }
  }

  useEffect(() => {
    void loadSavedPortfolios();
    void loadPortfolioSubscriptions();
  }, []);

  async function savePortfolio() {
    setSavingPortfolio(true);
    setError(null);
    setStatus(null);
    try {
      const projectIds = portfolioProjects
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const response = await fetch("/api/project-portfolios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: portfolioName, projectIds }),
      });
      const { data, error } = await parseApiResponse<{ portfolio?: SavedPortfolio }>(response);
      if (error || !data?.portfolio) throw new Error(error ?? "Failed to save portfolio");
      setStatus(`Saved portfolio ${data.portfolio.name}.`);
      setPortfolioName("");
      setPortfolioProjects(initialProjectId ?? "");
      await loadSavedPortfolios();
      setSelectedPortfolioSlug(data.portfolio.slug);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save portfolio");
    } finally {
      setSavingPortfolio(false);
    }
  }

  async function deletePortfolio(slug: string) {
    setDeletingPortfolioSlug(slug);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/project-portfolios/${slug}`, { method: "DELETE" });
      const { error } = await parseApiResponse<{ portfolio?: SavedPortfolio }>(response);
      if (error) throw new Error(error);
      setStatus(`Deleted portfolio ${slug}.`);
      await loadSavedPortfolios();
      if (selectedPortfolioSlug === slug) {
        setSelectedPortfolioSlug("");
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete portfolio");
    } finally {
      setDeletingPortfolioSlug(null);
    }
  }

  async function createPortfolioSubscription(extra?: { monitorKey?: PortfolioMonitorKey; portfolioSlug?: string; scopeTypeOverride?: typeof scopeType; modeOverride?: typeof mode }) {
    setSavingSubscription(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/project-portfolio-subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scopeType: extra?.scopeTypeOverride ?? scopeType,
          pmInitials,
          portfolioSlug: extra?.portfolioSlug ?? selectedPortfolioSlug,
          mode: extra?.monitorKey ? "over_budget" : (extra?.modeOverride ?? mode),
          monitorKey: extra?.monitorKey,
        }),
      });
      const { data, error } = await parseApiResponse<{ subscription?: PortfolioSubscription }>(response);
      if (error || !data?.subscription) throw new Error(error ?? "Failed to create portfolio subscription");
      const effectiveMode = extra?.monitorKey ? "over_budget" : (extra?.modeOverride ?? mode);
      setStatus(extra?.monitorKey ? "Portfolio monitor alert created." : effectiveMode === "digest" ? "Portfolio digest created." : "Portfolio alert created.");
      await loadPortfolioSubscriptions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create portfolio subscription");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function createMonitorAlert(portfolioSlug: string, monitorKey: PortfolioMonitorKey) {
    setCreatingMonitorKey(`${portfolioSlug}:${monitorKey}`);
    await createPortfolioSubscription({ portfolioSlug, monitorKey });
    setCreatingMonitorKey(null);
  }

  async function updatePortfolioSubscription(subscriptionId: string, action: "pause" | "resume" | "delete") {
    setUpdatingSubscriptionId(subscriptionId);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/project-portfolio-subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const { error } = await parseApiResponse<{ subscription?: PortfolioSubscription }>(response);
      if (error) throw new Error(error);
      setStatus(action === "delete" ? "Portfolio subscription deleted." : action === "pause" ? "Portfolio subscription paused." : "Portfolio subscription resumed.");
      await loadPortfolioSubscriptions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to ${action} portfolio subscription`);
    } finally {
      setUpdatingSubscriptionId(null);
    }
  }

  return (
    <div className="space-y-6 rounded-xl border p-5">
      <div className="space-y-1">
        <p className="text-lg font-semibold">Portfolio digests and alerts</p>
        <p className="text-sm text-muted-foreground">
          Create Slack-backed portfolio subscriptions here, then use project modals only for adding individual jobs into portfolios with the monitors you care about.
        </p>
      </div>

      {status && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {status}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">Save portfolio</p>
          <p className="text-xs text-muted-foreground">Create a named project set for future digest and alert subscriptions.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Portfolio name</span>
            <input
              value={portfolioName}
              onChange={(event) => setPortfolioName(event.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="paul-priority-jobs"
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">Project ids</span>
            <input
              value={portfolioProjects}
              onChange={(event) => setPortfolioProjects(event.target.value)}
              className="w-full rounded-md border px-3 py-2"
              placeholder="26153, 26144, 26047"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={savePortfolio} disabled={savingPortfolio || !portfolioName.trim() || !portfolioProjects.trim()}>
            {savingPortfolio ? "Saving..." : "Save portfolio"}
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Saved portfolios</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadSavedPortfolios()} disabled={loadingPortfolios}>
            {loadingPortfolios ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        {savedPortfolios.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">No saved portfolios yet.</div>
        ) : (
          <div className="space-y-4">
            {savedPortfolios.map((portfolio) => {
              const uniqueMonitorKeys = Array.from(new Set((portfolio.projects ?? []).flatMap((item) => item.monitor_keys)));
              return (
                <div key={portfolio.id} className="space-y-4 rounded-xl border p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-medium">{portfolio.name}</div>
                      <div className="text-xs text-muted-foreground">{portfolio.slug} · {portfolio.projects?.length ?? portfolio.project_ids?.length ?? 0} project(s)</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => { setScopeType("saved_portfolio"); setSelectedPortfolioSlug(portfolio.slug); setMode("digest"); void createPortfolioSubscription({ portfolioSlug: portfolio.slug, scopeTypeOverride: "saved_portfolio", modeOverride: "digest" }); }} disabled={savingSubscription}>
                        Create digest
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => void deletePortfolio(portfolio.slug)} disabled={deletingPortfolioSlug === portfolio.slug}>
                        {deletingPortfolioSlug === portfolio.slug ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects in this portfolio</p>
                    {(portfolio.projects ?? []).length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">No projects saved yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {(portfolio.projects ?? []).map((project) => (
                          <div key={`${portfolio.id}:${project.project_id}`} className="rounded-md border px-3 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-sm font-medium">Project {project.project_id}</div>
                              <div className="flex flex-wrap gap-2">
                                {project.monitor_keys.length > 0 ? project.monitor_keys.map((monitorKey) => {
                                  const config = getPortfolioMonitorConfig(monitorKey);
                                  return (
                                    <Badge key={monitorKey} variant="outline">{config?.label ?? monitorKey}</Badge>
                                  );
                                }) : <span className="text-xs text-muted-foreground">No monitors saved yet</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Create alerts from saved monitor coverage</p>
                    {uniqueMonitorKeys.length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                        Add projects to this portfolio from a project modal and choose the budgets/stats you want monitored.
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {uniqueMonitorKeys.map((monitorKey) => {
                          const config = getPortfolioMonitorConfig(monitorKey);
                          const projectCount = (portfolio.projects ?? []).filter((project) => project.monitor_keys.includes(monitorKey as PortfolioMonitorKey)).length;
                          return (
                            <Button
                              key={`${portfolio.slug}:${monitorKey}`}
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void createMonitorAlert(portfolio.slug, monitorKey as PortfolioMonitorKey)}
                              disabled={creatingMonitorKey === `${portfolio.slug}:${monitorKey}`}
                            >
                              {creatingMonitorKey === `${portfolio.slug}:${monitorKey}` ? "Saving..." : `Create ${config?.label ?? monitorKey} alert (${projectCount})`}
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <div>
          <p className="text-sm font-medium">Create portfolio subscription</p>
          <p className="text-xs text-muted-foreground">Create portfolio digests or broad exception alerts that deliver to Slack and also show up in Slack management flows.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Portfolio scope</span>
            <select value={scopeType} onChange={(event) => setScopeType(event.target.value as typeof scopeType)} className="w-full rounded-md border px-3 py-2 bg-background">
              {scopeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Subscription type</span>
            <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className="w-full rounded-md border px-3 py-2 bg-background">
              <option value="digest">Digest</option>
              <option value="over_budget">Over-budget alert</option>
              <option value="labor_risk">Labor-risk alert</option>
            </select>
          </label>
          {scopeType === "pm_active_projects" && (
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">PM initials</span>
              <input value={pmInitials} onChange={(event) => setPmInitials(event.target.value.toUpperCase())} className="w-full rounded-md border px-3 py-2" placeholder="PM" />
            </label>
          )}
          {scopeType === "saved_portfolio" && (
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Saved portfolio</span>
              <select value={selectedPortfolioSlug} onChange={(event) => setSelectedPortfolioSlug(event.target.value)} className="w-full rounded-md border px-3 py-2 bg-background">
                <option value="">Select a saved portfolio</option>
                {savedPortfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.slug}>{portfolio.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {scopeType === "saved_portfolio" && (
          <div className="rounded-md border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
            For project-specific budget watches, use the saved monitor alerts above. This generic section is for broader digest / over-budget / labor-risk portfolio subscriptions.
          </div>
        )}
        <div className="flex justify-end">
          <Button type="button" onClick={() => void createPortfolioSubscription()} disabled={savingSubscription || (scopeType === "pm_active_projects" && !pmInitials.trim()) || (scopeType === "saved_portfolio" && !selectedPortfolioSlug)}>
            {savingSubscription ? "Saving..." : `Create portfolio ${mode === "digest" ? "digest" : "alert"}`}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Portfolio subscriptions</p>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadPortfolioSubscriptions()} disabled={loadingSubscriptions}>
            {loadingSubscriptions ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
        {portfolioSubscriptions.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">No portfolio subscriptions yet.</div>
        ) : (
          <div className="space-y-2">
            {portfolioSubscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-lg border px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{subscription.summary_text}</span>
                      <Badge variant={subscription.status === "active" ? "secondary" : "outline"}>{subscription.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">Last triggered: {formatDateTime(subscription.last_triggered_at)}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {subscription.status === "active" ? (
                      <Button type="button" variant="outline" size="sm" onClick={() => void updatePortfolioSubscription(subscription.id, "pause")} disabled={updatingSubscriptionId === subscription.id}>Pause</Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => void updatePortfolioSubscription(subscription.id, "resume")} disabled={updatingSubscriptionId === subscription.id}>Resume</Button>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={() => void updatePortfolioSubscription(subscription.id, "delete")} disabled={updatingSubscriptionId === subscription.id}>Delete</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
        Available monitor types: {monitorOptions.map((option) => option.label).join(" · ")}
      </div>
    </div>
  );
}
