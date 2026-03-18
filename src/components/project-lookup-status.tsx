"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import type { ProjectLookupResult } from "@/lib/project-lookups";

interface ProjectLookupStatusProps {
  loading: boolean;
  result: ProjectLookupResult | null;
}

function SourceStatus({
  loading,
  found,
  label,
  name,
}: {
  loading: boolean;
  found: boolean;
  label: string;
  name: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Looking up {label}...</span>
      </div>
    );
  }

  if (!found) {
    return (
      <div className="text-xs text-muted-foreground">{label}: not found</div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-green-600">
      <CheckCircle2 className="h-3.5 w-3.5" />
      <span>
        {label}: {name ?? "Found"}
      </span>
    </div>
  );
}

export function ProjectLookupStatus({
  loading,
  result,
}: ProjectLookupStatusProps) {
  if (!loading && !result) {
    return null;
  }

  return (
    <div className="space-y-1">
      <SourceStatus
        loading={loading}
        found={Boolean(result?.hubspot_deal_id)}
        label="HubSpot"
        name={result?.hubspot_deal_name ?? null}
      />
      <SourceStatus
        loading={loading}
        found={Boolean(result?.qbo_project_id)}
        label="QBO"
        name={result?.qbo_project_name ?? null}
      />
    </div>
  );
}
