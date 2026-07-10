"use client";

import { useState } from "react";

import type { ProjectSummary } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type RecommendationResponse = {
  projectId: string;
  message: string;
  recommendation:
    | {
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
      }
    | {
        type: "digest";
        digestKey: string;
        defaultSections: string[];
        message: string;
      }
    | {
        type: "clarify";
        message: string;
      };
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

  async function getRecommendation() {
    setLoading(true);
    setError(null);
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
      setResult(data as RecommendationResponse);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load recommendation");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Notification recommendation preview</CardTitle>
        <p className="text-sm text-muted-foreground">
          Preview how the copilot will recommend thresholds before creating a project notification.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Testing on <span className="font-medium text-foreground">{project.name}</span> ({projectId})
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

        <div className="flex items-center gap-3">
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

        {result?.recommendation.type === "threshold" && (() => {
          const recommendation = result.recommendation as Extract<RecommendationResponse["recommendation"], { type: "threshold" }>;
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
          </div>
        )}

        {result?.recommendation.type === "clarify" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {result.recommendation.message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
