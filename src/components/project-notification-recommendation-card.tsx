"use client";

import { useEffect, useState } from "react";

import type { ProjectSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ThresholdRecommendation = {
  type: "threshold";
  metricKey: string;
  scopeKey: string;
  unit: "hours" | "currency" | "percent";
  currentValue: number | null;
  basisValue: number;
  basisLabel: string;
  spotlight: { id: string; label: string; threshold: number };
  options: Array<{ id: string; label: string; threshold: number }>;
  message: string;
};

type DigestRecommendation = {
  type: "digest";
  digestKey: string;
  defaultSections: string[];
  message: string;
};

type ClarifyRecommendation = {
  type: "clarify";
  message: string;
};

type RecommendationResponse = {
  projectId: string;
  message: string;
  recommendation: ThresholdRecommendation | DigestRecommendation | ClarifyRecommendation;
};

type ProjectSubscription = {
  id: string;
  project_id: string;
  channel?: string;
  target_json?: Record<string, unknown> | null;
  subscription_type: "metric_threshold_alert" | "scheduled_digest";
  metric_key: string | null;
  condition_operator: string | null;
  threshold_value: number | null;
  schedule_cron: string | null;
  status: "active" | "paused" | "archived";
  cooldown_minutes: number;
  summary_text: string;
  last_triggered_at: string | null;
  created_at: string;
  updated_at: string;
  rule_json: Record<string, unknown>;
};

function formatValue(value: number, unit: "hours" | "currency" | "percent") {
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (unit === "percent") {
    return `${value}%`;
  }
  return `${value} hrs`;
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

export function ProjectNotificationRecommendationCard({
  projectId,
  project,
}: {
  projectId: string;
  project: ProjectSummary;
}) {
  const [prompt, setPrompt] = useState("notify me when labor gets too high");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<ProjectSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [updatingSubscriptionId, setUpdatingSubscriptionId] = useState<string | null>(null);
  const [sendingTestKey, setSendingTestKey] = useState<string | null>(null);
  const [slackStatus, setSlackStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  async function loadSubscriptions() {
    setSubscriptionsLoading(true);
    setSubscriptionsError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/subscriptions`);
      const data = (await response.json()) as { subscriptions?: ProjectSubscription[]; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load subscriptions");
      }
      setSubscriptions(data.subscriptions ?? []);
    } catch (requestError) {
      setSubscriptions([]);
      setSubscriptionsError(requestError instanceof Error ? requestError.message : "Failed to load Slack subscriptions");
    } finally {
      setSubscriptionsLoading(false);
    }
  }

  useEffect(() => {
    void loadSubscriptions();
  }, [projectId]);

  async function getRecommendation() {
    setLoading(true);
    setError(null);
    setSlackStatus(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/copilot/notification-recommendation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: prompt }),
      });
      const data = (await response.json()) as RecommendationResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to load recommendation");
      }
      setResult(data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load recommendation");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function createSubscription() {
    if (!result || result.recommendation.type === "clarify") {
      return;
    }

    setSavingSubscription(true);
    setSubscriptionsError(null);
    setSubscriptionStatus(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recommendation: result.recommendation }),
      });
      const data = (await response.json()) as { subscription?: ProjectSubscription; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create subscription");
      }
      setSubscriptions((current) => [data.subscription!, ...current]);
      setSubscriptionStatus(result.recommendation.type === "digest" ? "Slack digest created." : "Slack alert created.");
    } catch (requestError) {
      setSubscriptionsError(requestError instanceof Error ? requestError.message : "Failed to create Slack subscription");
    } finally {
      setSavingSubscription(false);
    }
  }

  async function updateSubscription(subscriptionId: string, action: "pause" | "resume" | "delete") {
    setUpdatingSubscriptionId(subscriptionId);
    setSubscriptionsError(null);
    setSubscriptionStatus(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { subscription?: ProjectSubscription; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `Failed to ${action} subscription`);
      }
      if (action === "delete") {
        setSubscriptions((current) => current.filter((subscription) => subscription.id !== subscriptionId));
      } else {
        setSubscriptions((current) =>
          current.map((subscription) => (subscription.id === subscriptionId ? data.subscription! : subscription))
        );
      }
      setSubscriptionStatus(action === "delete" ? "Subscription deleted." : action === "pause" ? "Subscription paused." : "Subscription resumed.");
    } catch (requestError) {
      setSubscriptionsError(requestError instanceof Error ? requestError.message : `Failed to ${action} Slack subscription`);
    } finally {
      setUpdatingSubscriptionId(null);
    }
  }

  async function sendSlackTest(payload: { subscriptionId?: string; summaryText?: string; recommendationMessage?: string }, key: string) {
    setSendingTestKey(key);
    setSlackStatus(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/subscriptions/test-delivery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { error?: string; targetEmail?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Slack delivery failed");
      }
      setSlackStatus(`Sent test to Slack for ${data.targetEmail}.`);
    } catch (requestError) {
      setSlackStatus(requestError instanceof Error ? requestError.message : "Slack delivery failed");
    } finally {
      setSendingTestKey(null);
    }
  }

  return (
    <Card className="border-0 shadow-none">
      <CardHeader className="px-0 pb-3 pt-0">
        <CardTitle className="text-base">Slack digests and alerts</CardTitle>
        <p className="text-sm text-muted-foreground">
          Create and manage the same Slack digests and alerts you can access from Slack. Changes here stay synced with your Slack subscriptions for this project.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-0">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Managing Slack delivery for <span className="font-medium text-foreground">{project.name}</span> ({projectId})
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          {[
            "notify me when labor gets too high",
            "notify me if fabrication gets too high",
            "keep me posted on this project",
          ].map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border px-3 py-1 text-muted-foreground hover:bg-muted"
            >
              {example}
            </button>
          ))}
        </div>

        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Type a notification request"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={getRecommendation} disabled={loading || !prompt.trim()}>
            {loading ? "Loading..." : "Get recommendation"}
          </Button>
          {project.budget_hrs != null && (
            <span className="text-xs text-muted-foreground">
              Labor budget: {project.budget_hrs} hrs · Current labor: {project.qbo_total_hours} hrs
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {slackStatus && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
            {slackStatus}
          </div>
        )}

        {subscriptionStatus && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {subscriptionStatus}
          </div>
        )}

        <div className="rounded-md border bg-blue-50/70 px-3 py-2 text-sm text-blue-900">
          New subscriptions created here deliver as Slack DMs to you and show up in Slack subscription management for this project.
        </div>

        {result?.recommendation.type === "threshold" && (() => {
          const recommendation = result.recommendation as ThresholdRecommendation;
          return (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{recommendation.metricKey}</Badge>
                <Badge variant="outline">{recommendation.scopeKey}</Badge>
                <Badge variant="outline">
                  Current: {recommendation.currentValue == null ? "—" : formatValue(recommendation.currentValue, recommendation.unit)}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{recommendation.message}</p>
              <div className="space-y-2">
                <p className="text-sm font-medium">Recommended thresholds</p>
                <div className="flex flex-wrap gap-2">
                  {recommendation.options.map((option) => (
                    <div
                      key={option.id}
                      className={`rounded-md border px-3 py-2 text-sm ${option.id === recommendation.spotlight.id ? "border-emerald-300 bg-emerald-50" : "bg-background"}`}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className="text-muted-foreground">{formatValue(option.threshold, recommendation.unit)}</div>
                      {option.id === recommendation.spotlight.id && (
                        <div className="mt-1 text-xs font-medium text-emerald-700">Suggested default</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => sendSlackTest({ summaryText: `Alert when ${recommendation.metricKey === "qbo_total_hours" ? "labor hours" : recommendation.scopeKey} reach ${formatValue(recommendation.spotlight.threshold, recommendation.unit)}`, recommendationMessage: recommendation.message }, "recommendation-threshold")} disabled={sendingTestKey === "recommendation-threshold"}>
                  {sendingTestKey === "recommendation-threshold" ? "Sending..." : "Send test to Slack"}
                </Button>
                <Button type="button" onClick={createSubscription} disabled={savingSubscription}>
                  {savingSubscription ? "Saving..." : "Create suggested alert"}
                </Button>
              </div>
            </div>
          );
        })()}

        {result?.recommendation.type === "digest" && (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{result.recommendation.message}</p>
            <div>
              <p className="text-sm font-medium">Default digest sections</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.recommendation.defaultSections.map((section) => (
                  <Badge key={section} variant="outline">{section}</Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => sendSlackTest({ summaryText: "Weekday 4pm project digest", recommendationMessage: result.recommendation.message }, "recommendation-digest")} disabled={sendingTestKey === "recommendation-digest"}>
                {sendingTestKey === "recommendation-digest" ? "Sending..." : "Send test to Slack"}
              </Button>
              <Button type="button" onClick={createSubscription} disabled={savingSubscription}>
                {savingSubscription ? "Saving..." : "Create default digest"}
              </Button>
            </div>
          </div>
        )}

        {result?.recommendation.type === "clarify" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {result.recommendation.message}
          </div>
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Saved Slack subscriptions</p>
              <p className="text-xs text-muted-foreground">These are your live Slack digests and alerts for this project. Pause, resume, delete, or test the same subscriptions you can manage in Slack.</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={loadSubscriptions} disabled={subscriptionsLoading}>
              {subscriptionsLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>

          {subscriptionsError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {subscriptionsError}
            </div>
          )}

          {subscriptions.length === 0 ? (
            <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
              No Slack digests or alerts saved for this project yet.
            </div>
          ) : (
            <div className="space-y-2">
              {subscriptions.map((subscription) => (
                <div key={subscription.id} className="rounded-md border px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{subscription.summary_text}</span>
                        <Badge variant={subscription.status === "active" ? "secondary" : "outline"}>{subscription.status}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Last triggered: {formatDateTime(subscription.last_triggered_at)}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => sendSlackTest({ subscriptionId: subscription.id }, `subscription-${subscription.id}`)}
                        disabled={sendingTestKey === `subscription-${subscription.id}`}
                      >
                        {sendingTestKey === `subscription-${subscription.id}` ? "Sending..." : "Send test to Slack"}
                      </Button>
                      {subscription.status === "active" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateSubscription(subscription.id, "pause")}
                          disabled={updatingSubscriptionId === subscription.id}
                        >
                          Pause
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateSubscription(subscription.id, "resume")}
                          disabled={updatingSubscriptionId === subscription.id}
                        >
                          Resume
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => updateSubscription(subscription.id, "delete")}
                        disabled={updatingSubscriptionId === subscription.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
