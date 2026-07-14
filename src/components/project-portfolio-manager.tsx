"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPortfolioMonitorConfig, listPortfolioMonitorOptions, type PortfolioMonitorKey } from "@/lib/project-portfolio-monitoring";

type SavedPortfolioProject = {
  project_id: string;
  ordinal: number;
  monitor_keys: PortfolioMonitorKey[];
  project_name?: string | null;
  client_name?: string | null;
};

type SavedPortfolio = {
  id: string;
  created_by_email: string;
  name: string;
  slug: string;
  automation: {
    rule_type: "manual" | "pm_active_projects" | "all_active_projects";
    pm_initials?: string | null;
  };
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

const PM_FILTER_ALL = "ALL_PMS";
const PM_FILTER_SHARED = "SHARED";
const PM_FILTER_MANUAL = "MANUAL";

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

function getPortfolioKey(portfolio: SavedPortfolio) {
  return `${portfolio.created_by_email}:${portfolio.slug}`;
}

function getPortfolioProjectCount(portfolio: SavedPortfolio) {
  return portfolio.projects?.length ?? portfolio.project_ids?.length ?? 0;
}

function getPortfolioRuleLabel(portfolio: SavedPortfolio) {
  if (portfolio.automation.rule_type === "pm_active_projects") {
    return `${portfolio.automation.pm_initials ?? "PM"} active projects`;
  }
  if (portfolio.automation.rule_type === "all_active_projects") {
    return "All active projects";
  }
  return "Manual";
}

function comparePortfolios(a: SavedPortfolio, b: SavedPortfolio) {
  const pmA = a.automation.pm_initials ?? "";
  const pmB = b.automation.pm_initials ?? "";
  return pmA.localeCompare(pmB) || a.name.localeCompare(b.name) || a.created_by_email.localeCompare(b.created_by_email);
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
  const [selectedPmFilter, setSelectedPmFilter] = useState((defaultPmInitials?.trim().toUpperCase() || PM_FILTER_ALL));
  const [selectedPortfolioKey, setSelectedPortfolioKey] = useState("");
  const [savedPortfolios, setSavedPortfolios] = useState<SavedPortfolio[]>([]);
  const [portfolioSubscriptions, setPortfolioSubscriptions] = useState<PortfolioSubscription[]>([]);
  const [loadingPortfolios, setLoadingPortfolios] = useState(false);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [savingAutomationSlug, setSavingAutomationSlug] = useState<string | null>(null);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);
  const [deletingPortfolioSlug, setDeletingPortfolioSlug] = useState<string | null>(null);
  const [creatingMonitorKey, setCreatingMonitorKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [automationRules, setAutomationRules] = useState<Record<string, { ruleType: "manual" | "pm_active_projects" | "all_active_projects"; pmInitials: string }>>({});

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
      setAutomationRules(Object.fromEntries(portfolios.map((portfolio) => [portfolio.id, {
        ruleType: portfolio.automation?.rule_type ?? "manual",
        pmInitials: portfolio.automation?.pm_initials ?? "",
      }])));
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

  const pmPortfolios = useMemo(() => savedPortfolios
    .filter((portfolio) => portfolio.automation.rule_type === "pm_active_projects")
    .sort(comparePortfolios), [savedPortfolios]);

  const sharedPortfolios = useMemo(() => savedPortfolios
    .filter((portfolio) => portfolio.automation.rule_type === "all_active_projects")
    .sort(comparePortfolios), [savedPortfolios]);

  const manualPortfolios = useMemo(() => savedPortfolios
    .filter((portfolio) => portfolio.automation.rule_type === "manual")
    .sort(comparePortfolios), [savedPortfolios]);

  const pmFilters = useMemo(() => Array.from(new Set(
    pmPortfolios
      .map((portfolio) => portfolio.automation.pm_initials?.trim().toUpperCase())
      .filter((value): value is string => !!value)
  )).sort(), [pmPortfolios]);

  const filteredPortfolios = useMemo(() => {
    if (selectedPmFilter === PM_FILTER_SHARED) return sharedPortfolios;
    if (selectedPmFilter === PM_FILTER_MANUAL) return manualPortfolios;
    if (selectedPmFilter === PM_FILTER_ALL) return pmPortfolios;
    return pmPortfolios.filter((portfolio) => (portfolio.automation.pm_initials ?? "").trim().toUpperCase() === selectedPmFilter);
  }, [manualPortfolios, pmPortfolios, selectedPmFilter, sharedPortfolios]);

  useEffect(() => {
    if (filteredPortfolios.length === 0) {
      if (selectedPortfolioKey) setSelectedPortfolioKey("");
      return;
    }

    const existing = filteredPortfolios.find((portfolio) => getPortfolioKey(portfolio) === selectedPortfolioKey);
    const next = existing ?? filteredPortfolios[0];
    const nextKey = getPortfolioKey(next);
    if (nextKey !== selectedPortfolioKey) {
      setSelectedPortfolioKey(nextKey);
    }
    if (selectedPortfolioSlug !== next.slug) {
      setSelectedPortfolioSlug(next.slug);
    }
  }, [filteredPortfolios, selectedPortfolioKey, selectedPortfolioSlug]);

  const selectedPortfolio = useMemo(() => filteredPortfolios.find((portfolio) => getPortfolioKey(portfolio) === selectedPortfolioKey) ?? filteredPortfolios[0] ?? null, [filteredPortfolios, selectedPortfolioKey]);

  const selectedPortfolioUniqueMonitorKeys = useMemo(() => Array.from(new Set((selectedPortfolio?.projects ?? []).flatMap((item) => item.monitor_keys))), [selectedPortfolio]);

  const filteredProjectCount = useMemo(() => filteredPortfolios.reduce((total, portfolio) => total + getPortfolioProjectCount(portfolio), 0), [filteredPortfolios]);

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
      setSelectedPortfolioKey(getPortfolioKey(data.portfolio));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save portfolio");
    } finally {
      setSavingPortfolio(false);
    }
  }

  async function deletePortfolio(slug: string) {
    const ownerEmail = savedPortfolios.find((portfolio) => portfolio.slug === slug)?.created_by_email ?? "";
    setDeletingPortfolioSlug(slug);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/project-portfolios/${slug}?ownerEmail=${encodeURIComponent(ownerEmail)}`, { method: "DELETE" });
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

  async function saveAutomation(portfolio: SavedPortfolio) {
    const draft = automationRules[portfolio.id] ?? {
      ruleType: portfolio.automation?.rule_type ?? "manual",
      pmInitials: portfolio.automation?.pm_initials ?? "",
    };
    setSavingAutomationSlug(portfolio.slug);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch(`/api/project-portfolios/${portfolio.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerEmail: portfolio.created_by_email,
          ruleType: draft.ruleType,
          pmInitials: draft.pmInitials,
        }),
      });
      const { data, error } = await parseApiResponse<{ portfolio?: SavedPortfolio }>(response);
      if (error || !data?.portfolio) throw new Error(error ?? "Failed to save automation rule");
      setStatus(`Updated automation for ${data.portfolio.name}.`);
      await loadSavedPortfolios();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to save automation rule");
    } finally {
      setSavingAutomationSlug(null);
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

      <div className="space-y-4 rounded-xl border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium">PM portfolio workspace</p>
            <p className="text-xs text-muted-foreground">Filter built PM portfolios by owner/PM first, then inspect one portfolio in a focused detail view instead of scrolling stacked cards.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadSavedPortfolios()} disabled={loadingPortfolios}>
            {loadingPortfolios ? "Refreshing..." : "Refresh portfolios"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={selectedPmFilter === PM_FILTER_ALL ? "default" : "outline"} onClick={() => setSelectedPmFilter(PM_FILTER_ALL)}>
            All PMs
          </Button>
          {pmFilters.map((filter) => (
            <Button key={filter} type="button" size="sm" variant={selectedPmFilter === filter ? "default" : "outline"} onClick={() => setSelectedPmFilter(filter)}>
              {filter}
            </Button>
          ))}
          <Button type="button" size="sm" variant={selectedPmFilter === PM_FILTER_SHARED ? "default" : "outline"} onClick={() => setSelectedPmFilter(PM_FILTER_SHARED)}>
            Shared
          </Button>
          <Button type="button" size="sm" variant={selectedPmFilter === PM_FILTER_MANUAL ? "default" : "outline"} onClick={() => setSelectedPmFilter(PM_FILTER_MANUAL)}>
            Manual
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Visible portfolios</div>
            <div className="mt-1 text-2xl font-semibold">{filteredPortfolios.length}</div>
          </div>
          <div className="rounded-lg border px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Projects in view</div>
            <div className="mt-1 text-2xl font-semibold">{filteredProjectCount}</div>
          </div>
          <div className="rounded-lg border px-3 py-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Filter mode</div>
            <div className="mt-1 text-sm font-medium">
              {selectedPmFilter === PM_FILTER_ALL ? "All PM portfolios" : selectedPmFilter === PM_FILTER_SHARED ? "Shared automation portfolios" : selectedPmFilter === PM_FILTER_MANUAL ? "Manual portfolios" : `${selectedPmFilter} workspace`}
            </div>
          </div>
        </div>

        {filteredPortfolios.length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">No portfolios match this PM filter yet.</div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">Portfolio list</p>
                <span className="text-xs text-muted-foreground">{filteredPortfolios.length} shown</span>
              </div>
              <div className="space-y-2">
                {filteredPortfolios.map((portfolio) => {
                  const portfolioKey = getPortfolioKey(portfolio);
                  const selected = selectedPortfolioKey === portfolioKey;
                  return (
                    <button
                      key={portfolioKey}
                      type="button"
                      onClick={() => {
                        setSelectedPortfolioKey(portfolioKey);
                        setSelectedPortfolioSlug(portfolio.slug);
                      }}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition ${selected ? "border-foreground bg-muted/40" : "hover:bg-muted/20"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{portfolio.name}</div>
                          <div className="text-xs text-muted-foreground">{portfolio.created_by_email}</div>
                        </div>
                        <Badge variant={selected ? "secondary" : "outline"}>{getPortfolioProjectCount(portfolio)} projects</Badge>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{getPortfolioRuleLabel(portfolio)}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedPortfolio ? (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{selectedPortfolio.name}</h2>
                      <Badge variant="outline">{getPortfolioRuleLabel(selectedPortfolio)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{selectedPortfolio.created_by_email} · {selectedPortfolio.slug}</p>
                    <p className="text-xs text-muted-foreground">{getPortfolioProjectCount(selectedPortfolio)} project(s) currently in this portfolio.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setScopeType("saved_portfolio"); setSelectedPortfolioSlug(selectedPortfolio.slug); setMode("digest"); void createPortfolioSubscription({ portfolioSlug: selectedPortfolio.slug, scopeTypeOverride: "saved_portfolio", modeOverride: "digest" }); }} disabled={savingSubscription}>
                      Create digest
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void deletePortfolio(selectedPortfolio.slug)} disabled={deletingPortfolioSlug === selectedPortfolio.slug}>
                      {deletingPortfolioSlug === selectedPortfolio.slug ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div>
                    <p className="text-sm font-medium">Automation rule</p>
                    <p className="text-xs text-muted-foreground">Use Portfolio Center to decide whether this portfolio auto-manages PM-active projects, all active projects, or stays manual.</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="space-y-1 text-sm sm:col-span-2">
                      <span className="text-muted-foreground">Rule type</span>
                      <select
                        value={automationRules[selectedPortfolio.id]?.ruleType ?? selectedPortfolio.automation?.rule_type ?? "manual"}
                        onChange={(event) => setAutomationRules((prev) => ({
                          ...prev,
                          [selectedPortfolio.id]: {
                            ruleType: event.target.value as "manual" | "pm_active_projects" | "all_active_projects",
                            pmInitials: prev[selectedPortfolio.id]?.pmInitials ?? selectedPortfolio.automation?.pm_initials ?? "",
                          },
                        }))}
                        className="w-full rounded-md border px-3 py-2 bg-background"
                      >
                        <option value="manual">Manual only</option>
                        <option value="pm_active_projects">PM active projects</option>
                        <option value="all_active_projects">All active projects</option>
                      </select>
                    </label>
                    {(automationRules[selectedPortfolio.id]?.ruleType ?? selectedPortfolio.automation?.rule_type ?? "manual") === "pm_active_projects" && (
                      <label className="space-y-1 text-sm">
                        <span className="text-muted-foreground">PM initials</span>
                        <input
                          value={automationRules[selectedPortfolio.id]?.pmInitials ?? selectedPortfolio.automation?.pm_initials ?? ""}
                          onChange={(event) => setAutomationRules((prev) => ({
                            ...prev,
                            [selectedPortfolio.id]: {
                              ruleType: "pm_active_projects",
                              pmInitials: event.target.value.toUpperCase(),
                            },
                          }))}
                          className="w-full rounded-md border px-3 py-2"
                          placeholder="NG"
                        />
                      </label>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void saveAutomation(selectedPortfolio)}
                      disabled={savingAutomationSlug === selectedPortfolio.slug || ((automationRules[selectedPortfolio.id]?.ruleType ?? selectedPortfolio.automation?.rule_type ?? "manual") === "pm_active_projects" && !(automationRules[selectedPortfolio.id]?.pmInitials ?? selectedPortfolio.automation?.pm_initials ?? "").trim())}
                    >
                      {savingAutomationSlug === selectedPortfolio.slug ? "Saving..." : "Save automation"}
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Projects in this portfolio</p>
                    {(selectedPortfolio.projects ?? []).length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">No projects saved yet.</div>
                    ) : (
                      <div className="space-y-2">
                        {(selectedPortfolio.projects ?? []).map((project) => (
                          <div key={`${selectedPortfolio.id}:${project.project_id}`} className="rounded-md border px-3 py-3">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <div className="text-sm font-medium">Project {project.project_id}{project.project_name ? ` · ${project.project_name}` : ""}</div>
                                {project.client_name && (
                                  <div className="text-xs text-muted-foreground">Client: {project.client_name}</div>
                                )}
                              </div>
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
                    {selectedPortfolioUniqueMonitorKeys.length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                        Add projects to this portfolio from a project modal and choose the budgets/stats you want monitored.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedPortfolioUniqueMonitorKeys.map((monitorKey) => {
                          const config = getPortfolioMonitorConfig(monitorKey as PortfolioMonitorKey);
                          const projectCount = (selectedPortfolio.projects ?? []).filter((project) => project.monitor_keys.includes(monitorKey as PortfolioMonitorKey)).length;
                          return (
                            <Button
                              key={`${selectedPortfolio.slug}:${monitorKey}`}
                              type="button"
                              variant="outline"
                              className="w-full justify-between"
                              onClick={() => void createMonitorAlert(selectedPortfolio.slug, monitorKey as PortfolioMonitorKey)}
                              disabled={creatingMonitorKey === `${selectedPortfolio.slug}:${monitorKey}`}
                            >
                              <span>{config?.label ?? monitorKey}</span>
                              <span className="text-xs text-muted-foreground">{creatingMonitorKey === `${selectedPortfolio.slug}:${monitorKey}` ? "Saving..." : `${projectCount} project(s)`}</span>
                            </Button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

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
                  <option key={getPortfolioKey(portfolio)} value={portfolio.slug}>{portfolio.name}</option>
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
        Popular presets: Labor reaches 95% of budget · Fabrication reaches 90% of budget · Travel reaches 100% of budget · Total project over budget.
      </div>

      <div className="rounded-md border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
        Available monitor types: {monitorOptions.map((option) => option.label).join(" · ")}
      </div>
    </div>
  );
}