"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  owner_full_name?: string | null;
  name: string;
  slug: string;
  automation: {
    rule_type: "manual" | "pm_active_projects" | "all_active_projects";
    pm_initials?: string | null;
  };
  pm_full_name?: string | null;
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

type WorkflowScopeType = "my_active_projects" | "all_active_projects" | "pm_active_projects" | "saved_portfolio";
type WorkflowMode = "digest" | "over_budget" | "labor_risk";
type DetailTab = "projects" | "automation" | "alerts";

const PM_FILTER_ALL = "ALL_PMS";
const PM_FILTER_SHARED = "SHARED";
const PM_FILTER_MANUAL = "MANUAL";
const PORTFOLIO_PRESET_HINT = "Popular presets: Labor reaches 95% of budget · Fabrication reaches 90% of budget · Travel reaches 100% of budget · Total project over budget.";

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

function getPortfolioDisplayName(portfolio: SavedPortfolio) {
  if (portfolio.automation.rule_type === "pm_active_projects") {
    return portfolio.pm_full_name?.trim() || portfolio.owner_full_name?.trim() || portfolio.automation.pm_initials || portfolio.name;
  }

  return portfolio.name;
}

function getPortfolioSecondaryLabel(portfolio: SavedPortfolio) {
  if (portfolio.automation.rule_type === "pm_active_projects") {
    const initials = portfolio.automation.pm_initials?.trim().toUpperCase();
    return initials ? `${initials} Active Projects` : portfolio.name;
  }

  return portfolio.owner_full_name?.trim() || portfolio.created_by_email;
}

function getSubscriptionPortfolioSlug(subscription: PortfolioSubscription) {
  const scopeJson = subscription.scope_json;
  if (!scopeJson || typeof scopeJson !== "object") return null;
  const value = scopeJson.portfolio_slug;
  return typeof value === "string" ? value : null;
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
  const [scopeType, setScopeType] = useState<WorkflowScopeType>("saved_portfolio");
  const [mode, setMode] = useState<WorkflowMode>("digest");
  const [pmInitials, setPmInitials] = useState(defaultPmInitials ?? "");
  const [selectedPortfolioSlug, setSelectedPortfolioSlug] = useState("");
  const [selectedPmFilter, setSelectedPmFilter] = useState((defaultPmInitials?.trim().toUpperCase() || PM_FILTER_ALL));
  const [selectedPortfolioKey, setSelectedPortfolioKey] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("projects");
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false);
  const [createWorkflowOpen, setCreateWorkflowOpen] = useState(false);
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

  const scopeOptions = useMemo(
    () => ([
      { value: "saved_portfolio" as const, label: "Saved portfolio" },
      { value: "pm_active_projects" as const, label: "PM active projects" },
      { value: "all_active_projects" as const, label: "All active projects" },
      { value: "my_active_projects" as const, label: "My active projects" },
    ]),
    []
  );

  const monitorOptions = useMemo(() => listPortfolioMonitorOptions(), []);

  async function loadSavedPortfolios() {
    setLoadingPortfolios(true);
    try {
      const response = await fetch("/api/project-portfolios");
      const { data, error } = await parseApiResponse<{ portfolios?: SavedPortfolio[] }>(response);
      if (error) throw new Error(error);
      const portfolios = data?.portfolios ?? [];
      setSavedPortfolios(portfolios);
      setAutomationRules(
        Object.fromEntries(
          portfolios.map((portfolio) => [
            portfolio.id,
            {
              ruleType: portfolio.automation?.rule_type ?? "manual",
              pmInitials: portfolio.automation?.pm_initials ?? "",
            },
          ])
        )
      );
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

  const pmPortfolios = useMemo(
    () => savedPortfolios.filter((portfolio) => portfolio.automation.rule_type === "pm_active_projects").sort(comparePortfolios),
    [savedPortfolios]
  );

  const sharedPortfolios = useMemo(
    () => savedPortfolios.filter((portfolio) => portfolio.automation.rule_type === "all_active_projects").sort(comparePortfolios),
    [savedPortfolios]
  );

  const manualPortfolios = useMemo(
    () => savedPortfolios.filter((portfolio) => portfolio.automation.rule_type === "manual").sort(comparePortfolios),
    [savedPortfolios]
  );

  const pmFilters = useMemo(
    () =>
      Array.from(
        new Set(
          pmPortfolios
            .map((portfolio) => portfolio.automation.pm_initials?.trim().toUpperCase())
            .filter((value): value is string => !!value)
        )
      ).sort(),
    [pmPortfolios]
  );

  const pmFilterOptions = useMemo(
    () =>
      pmFilters.map((initials) => {
        const portfolio = pmPortfolios.find((item) => item.automation.pm_initials?.trim().toUpperCase() === initials) ?? null;
        return {
          initials,
          label: portfolio ? getPortfolioDisplayName(portfolio) : initials,
        };
      }),
    [pmFilters, pmPortfolios]
  );

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

  const selectedPortfolio = useMemo(
    () => filteredPortfolios.find((portfolio) => getPortfolioKey(portfolio) === selectedPortfolioKey) ?? filteredPortfolios[0] ?? null,
    [filteredPortfolios, selectedPortfolioKey]
  );

  const selectedPortfolioUniqueMonitorKeys = useMemo(
    () => Array.from(new Set((selectedPortfolio?.projects ?? []).flatMap((item) => item.monitor_keys))),
    [selectedPortfolio]
  );

  const selectedPortfolioSubscriptions = useMemo(() => {
    if (!selectedPortfolio) return [];
    return portfolioSubscriptions.filter((subscription) => getSubscriptionPortfolioSlug(subscription) === selectedPortfolio.slug);
  }, [portfolioSubscriptions, selectedPortfolio]);

  const portfolioStatsByKey = useMemo(() => {
    return filteredPortfolios.reduce<Record<string, { digestCount: number; alertCount: number; monitoredProjectCount: number }>>((acc, portfolio) => {
      const subscriptions = portfolioSubscriptions.filter((subscription) => getSubscriptionPortfolioSlug(subscription) === portfolio.slug);
      acc[getPortfolioKey(portfolio)] = {
        digestCount: subscriptions.filter((subscription) => subscription.summary_text.toLowerCase().includes("digest")).length,
        alertCount: subscriptions.filter((subscription) => !subscription.summary_text.toLowerCase().includes("digest")).length,
        monitoredProjectCount: (portfolio.projects ?? []).filter((project) => project.monitor_keys.length > 0).length,
      };
      return acc;
    }, {});
  }, [filteredPortfolios, portfolioSubscriptions]);

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
      setCreatePortfolioOpen(false);
      await loadSavedPortfolios();
      setSelectedPortfolioSlug(data.portfolio.slug);
      setSelectedPortfolioKey(getPortfolioKey(data.portfolio));
      setSelectedPmFilter(data.portfolio.automation.rule_type === "pm_active_projects" ? (data.portfolio.automation.pm_initials?.toUpperCase() ?? PM_FILTER_ALL) : data.portfolio.automation.rule_type === "all_active_projects" ? PM_FILTER_SHARED : PM_FILTER_MANUAL);
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

  async function createPortfolioSubscription(extra?: { monitorKey?: PortfolioMonitorKey; portfolioSlug?: string; scopeTypeOverride?: WorkflowScopeType; modeOverride?: WorkflowMode }) {
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
      const effectiveMode = extra?.monitorKey ? "over_budget" : extra?.modeOverride ?? mode;
      setStatus(extra?.monitorKey ? "Portfolio monitor alert created." : effectiveMode === "digest" ? "Portfolio digest created." : "Portfolio alert created.");
      setCreateWorkflowOpen(false);
      await loadPortfolioSubscriptions();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to create portfolio subscription");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function createMonitorAlert(portfolioSlug: string, monitorKey: PortfolioMonitorKey) {
    setCreatingMonitorKey(`${portfolioSlug}:${monitorKey}`);
    await createPortfolioSubscription({ portfolioSlug, monitorKey, scopeTypeOverride: "saved_portfolio", modeOverride: "over_budget" });
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

  function openWorkflowDialog(next?: Partial<{ scopeType: WorkflowScopeType; mode: WorkflowMode; portfolioSlug: string; pmInitials: string }>) {
    setScopeType(next?.scopeType ?? "saved_portfolio");
    setMode(next?.mode ?? "digest");
    setPmInitials(next?.pmInitials ?? defaultPmInitials ?? "");
    setSelectedPortfolioSlug(next?.portfolioSlug ?? selectedPortfolio?.slug ?? savedPortfolios[0]?.slug ?? "");
    setCreateWorkflowOpen(true);
  }

  const topActions = (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => setCreatePortfolioOpen(true)}>
        Create portfolio
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => openWorkflowDialog({ mode: "digest", scopeType: selectedPortfolio ? "saved_portfolio" : "all_active_projects" })}>
        Create digest
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => openWorkflowDialog({ mode: "over_budget", scopeType: selectedPortfolio ? "saved_portfolio" : "all_active_projects" })}>
        Create alert
      </Button>
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="tracker-section-label">Portfolio digests and alerts</p>
            <p className="text-sm text-muted-foreground">Filter by PM, pick a portfolio, then manage only the piece you need.</p>
          </div>
          {topActions}
        </div>

        {status && <div className="tracker-banner-success">{status}</div>}
        {error && <div className="tracker-banner-danger">{error}</div>}

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" className={selectedPmFilter === PM_FILTER_ALL ? "tracker-filter-pill tracker-filter-pill-active" : "tracker-filter-pill"} variant="outline" onClick={() => setSelectedPmFilter(PM_FILTER_ALL)}>
            All
          </Button>
          {pmFilterOptions.map((filter) => (
            <Button key={filter.initials} type="button" size="sm" className={selectedPmFilter === filter.initials ? "tracker-filter-pill tracker-filter-pill-active" : "tracker-filter-pill"} variant="outline" onClick={() => setSelectedPmFilter(filter.initials)}>
              {filter.label}
            </Button>
          ))}
          <Button type="button" size="sm" className={selectedPmFilter === PM_FILTER_SHARED ? "tracker-filter-pill tracker-filter-pill-active" : "tracker-filter-pill"} variant="outline" onClick={() => setSelectedPmFilter(PM_FILTER_SHARED)}>
            Shared
          </Button>
          <Button type="button" size="sm" className={selectedPmFilter === PM_FILTER_MANUAL ? "tracker-filter-pill tracker-filter-pill-active" : "tracker-filter-pill"} variant="outline" onClick={() => setSelectedPmFilter(PM_FILTER_MANUAL)}>
            Manual
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void loadSavedPortfolios()} disabled={loadingPortfolios}>
            {loadingPortfolios ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        {filteredPortfolios.length === 0 ? (
          <div className="border border-dashed rounded-lg px-4 py-6 text-sm text-muted-foreground">No portfolios match this filter yet.</div>
        ) : (
          <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-1 rounded-lg border p-2">
              {filteredPortfolios.map((portfolio) => {
                const portfolioKey = getPortfolioKey(portfolio);
                const selected = selectedPortfolioKey === portfolioKey;
                const stats = portfolioStatsByKey[portfolioKey] ?? { digestCount: 0, alertCount: 0, monitoredProjectCount: 0 };
                return (
                  <button
                    key={portfolioKey}
                    type="button"
                    onClick={() => {
                      setSelectedPortfolioKey(portfolioKey);
                      setSelectedPortfolioSlug(portfolio.slug);
                    }}
                    className={`w-full rounded-lg px-3 py-3 text-left transition ${selected ? "bg-muted text-foreground" : "hover:bg-muted/60"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{getPortfolioDisplayName(portfolio)}</div>
                        <div className="truncate text-xs text-muted-foreground">{getPortfolioSecondaryLabel(portfolio)}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{getPortfolioProjectCount(portfolio)} projects</div>
                        <div>{stats.monitoredProjectCount} monitored</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>{stats.digestCount} digests</span>
                      <span>{stats.alertCount} alerts</span>
                      <span>{portfolio.automation.rule_type === "manual" ? "Manual" : "Automation on"}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPortfolio ? (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">{getPortfolioDisplayName(selectedPortfolio)}</h2>
                      <Badge variant="outline">{getPortfolioRuleLabel(selectedPortfolio)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{getPortfolioSecondaryLabel(selectedPortfolio)} · {getPortfolioProjectCount(selectedPortfolio)} active projects</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => openWorkflowDialog({ scopeType: "saved_portfolio", portfolioSlug: selectedPortfolio.slug, mode: "digest" })}>
                      Create digest
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => openWorkflowDialog({ scopeType: "saved_portfolio", portfolioSlug: selectedPortfolio.slug, mode: "over_budget" })}>
                      Create alert
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void deletePortfolio(selectedPortfolio.slug)} disabled={deletingPortfolioSlug === selectedPortfolio.slug}>
                      {deletingPortfolioSlug === selectedPortfolio.slug ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>

                <Tabs value={activeDetailTab} onValueChange={(value) => setActiveDetailTab(value as DetailTab)}>
                  <TabsList variant="line" className="w-full justify-start gap-4 border-b p-0 text-sm">
                    <TabsTrigger value="projects" className="rounded-none px-0 pb-3 pt-1">Projects</TabsTrigger>
                    <TabsTrigger value="automation" className="rounded-none px-0 pb-3 pt-1">Automation</TabsTrigger>
                    <TabsTrigger value="alerts" className="rounded-none px-0 pb-3 pt-1">Alerts</TabsTrigger>
                  </TabsList>

                  <TabsContent value="projects" className="pt-2">
                    {(selectedPortfolio.projects ?? []).length === 0 ? (
                      <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">No projects saved yet.</div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm text-muted-foreground">Projects are the main working view for PM portfolios.</p>
                          <span className="text-xs text-muted-foreground">{(selectedPortfolio.projects ?? []).length} projects</span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Project</TableHead>
                              <TableHead>Client</TableHead>
                              <TableHead>Monitor coverage</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(selectedPortfolio.projects ?? []).map((project) => (
                              <TableRow key={`${selectedPortfolio.id}:${project.project_id}`}>
                                <TableCell>
                                  <div className="font-medium">Project {project.project_id}{project.project_name ? ` · ${project.project_name}` : ""}</div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{project.client_name ?? "—"}</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-2">
                                    {project.monitor_keys.length > 0 ? (
                                      project.monitor_keys.map((monitorKey) => {
                                        const config = getPortfolioMonitorConfig(monitorKey);
                                        return (
                                          <Badge key={monitorKey} variant="outline">{config?.label ?? monitorKey}</Badge>
                                        );
                                      })
                                    ) : (
                                      <span className="text-xs text-muted-foreground">No monitors</span>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="automation" className="pt-2">
                    <div className="space-y-4 rounded-lg border p-4">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="space-y-1 text-sm sm:col-span-2">
                          <span className="text-muted-foreground">Rule type</span>
                          <select
                            value={automationRules[selectedPortfolio.id]?.ruleType ?? selectedPortfolio.automation?.rule_type ?? "manual"}
                            onChange={(event) =>
                              setAutomationRules((prev) => ({
                                ...prev,
                                [selectedPortfolio.id]: {
                                  ruleType: event.target.value as "manual" | "pm_active_projects" | "all_active_projects",
                                  pmInitials: prev[selectedPortfolio.id]?.pmInitials ?? selectedPortfolio.automation?.pm_initials ?? "",
                                },
                              }))
                            }
                            className="w-full rounded-md border bg-background px-3 py-2"
                          >
                            <option value="manual">Manual only</option>
                            <option value="pm_active_projects">PM active projects</option>
                            <option value="all_active_projects">All active projects</option>
                          </select>
                        </label>
                        {(automationRules[selectedPortfolio.id]?.ruleType ?? selectedPortfolio.automation?.rule_type ?? "manual") === "pm_active_projects" ? (
                          <label className="space-y-1 text-sm">
                            <span className="text-muted-foreground">PM initials</span>
                            <input
                              value={automationRules[selectedPortfolio.id]?.pmInitials ?? selectedPortfolio.automation?.pm_initials ?? ""}
                              onChange={(event) =>
                                setAutomationRules((prev) => ({
                                  ...prev,
                                  [selectedPortfolio.id]: {
                                    ruleType: "pm_active_projects",
                                    pmInitials: event.target.value.toUpperCase(),
                                  },
                                }))
                              }
                              className="w-full rounded-md border bg-background px-3 py-2"
                              placeholder="NG"
                            />
                          </label>
                        ) : null}
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
                  </TabsContent>

                  <TabsContent value="alerts" className="pt-2">
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => openWorkflowDialog({ scopeType: "saved_portfolio", portfolioSlug: selectedPortfolio.slug, mode: "digest" })}>
                          Create digest
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => openWorkflowDialog({ scopeType: "saved_portfolio", portfolioSlug: selectedPortfolio.slug, mode: "over_budget" })}>
                          Create alert
                        </Button>
                      </div>

                      {selectedPortfolioUniqueMonitorKeys.length > 0 ? (
                        <div className="space-y-2">
                          {selectedPortfolioUniqueMonitorKeys.map((monitorKey) => {
                            const config = getPortfolioMonitorConfig(monitorKey as PortfolioMonitorKey);
                            const projectCount = (selectedPortfolio.projects ?? []).filter((project) => project.monitor_keys.includes(monitorKey as PortfolioMonitorKey)).length;
                            return (
                              <div key={`${selectedPortfolio.slug}:${monitorKey}`} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                                <div>
                                  <div className="text-sm font-medium">{config?.label ?? monitorKey}</div>
                                  <div className="text-xs text-muted-foreground">{projectCount} projects covered</div>
                                </div>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void createMonitorAlert(selectedPortfolio.slug, monitorKey as PortfolioMonitorKey)}
                                  disabled={creatingMonitorKey === `${selectedPortfolio.slug}:${monitorKey}`}
                                >
                                  {creatingMonitorKey === `${selectedPortfolio.slug}:${monitorKey}` ? "Saving..." : "Create alert"}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">Add projects from a project modal to unlock monitor-based alerts here.</div>
                      )}

                      <div className="space-y-2">
                        <p className="tracker-section-label">Subscriptions for this portfolio</p>
                        {selectedPortfolioSubscriptions.length === 0 ? (
                          <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">No saved-portfolio subscriptions yet.</div>
                        ) : (
                          selectedPortfolioSubscriptions.map((subscription) => (
                            <div key={subscription.id} className="flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
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
                          ))
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground">{PORTFOLIO_PRESET_HINT}</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={createPortfolioOpen} onOpenChange={setCreatePortfolioOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Save portfolio</DialogTitle>
            <DialogDescription>Create portfolio groups here instead of keeping the form open on the page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Portfolio name</span>
              <input
                value={portfolioName}
                onChange={(event) => setPortfolioName(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                placeholder="paul-priority-jobs"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Project ids</span>
              <input
                value={portfolioProjects}
                onChange={(event) => setPortfolioProjects(event.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2"
                placeholder="26153, 26144, 26047"
              />
            </label>
          </div>
          <DialogFooter showCloseButton>
            <Button type="button" onClick={() => void savePortfolio()} disabled={savingPortfolio || !portfolioName.trim() || !portfolioProjects.trim()}>
              {savingPortfolio ? "Saving..." : "Save portfolio"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createWorkflowOpen} onOpenChange={setCreateWorkflowOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{mode === "digest" ? "Create portfolio digest" : "Create portfolio alert"}</DialogTitle>
            <DialogDescription>
              Create portfolio digests or alerts from a focused modal instead of a persistent panel. {monitorOptions.length > 0 ? `Available monitor types: ${monitorOptions.map((option) => option.label).join(" · ")}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Portfolio scope</span>
              <select value={scopeType} onChange={(event) => setScopeType(event.target.value as WorkflowScopeType)} className="w-full rounded-md border bg-background px-3 py-2">
                {scopeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">Subscription type</span>
              <select value={mode} onChange={(event) => setMode(event.target.value as WorkflowMode)} className="w-full rounded-md border bg-background px-3 py-2">
                <option value="digest">Digest</option>
                <option value="over_budget">Over-budget alert</option>
                <option value="labor_risk">Labor-risk alert</option>
              </select>
            </label>
            {scopeType === "pm_active_projects" ? (
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">PM initials</span>
                <input value={pmInitials} onChange={(event) => setPmInitials(event.target.value.toUpperCase())} className="w-full rounded-md border bg-background px-3 py-2" placeholder="PM" />
              </label>
            ) : null}
            {scopeType === "saved_portfolio" ? (
              <label className="space-y-1 text-sm sm:col-span-2">
                <span className="text-muted-foreground">Saved portfolio</span>
                <select value={selectedPortfolioSlug} onChange={(event) => setSelectedPortfolioSlug(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2">
                  <option value="">Select a saved portfolio</option>
                  {savedPortfolios.map((portfolio) => (
                    <option key={getPortfolioKey(portfolio)} value={portfolio.slug}>{portfolio.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {scopeType === "saved_portfolio" ? (
            <p className="text-xs text-muted-foreground">For project-specific watches, use the quick monitor rows in the Alerts tab.</p>
          ) : null}
          <DialogFooter showCloseButton>
            <Button type="button" onClick={() => void createPortfolioSubscription()} disabled={savingSubscription || (scopeType === "pm_active_projects" && !pmInitials.trim()) || (scopeType === "saved_portfolio" && !selectedPortfolioSlug)}>
              {savingSubscription ? "Saving..." : `Create portfolio ${mode === "digest" ? "digest" : "alert"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
