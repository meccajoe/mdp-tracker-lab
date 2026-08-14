"use client";

import { useParams } from "next/navigation";

import { AdaAccessGate } from "@/components/ada-access-gate";
import { AdaWorkspaceShell } from "@/components/ada-workspace-shell";

export default function AdaWorkspacePage() {
  const params = useParams<{ workspaceId: string }>();
  return <AdaAccessGate><AdaWorkspaceShell workspaceId={params.workspaceId} /></AdaAccessGate>;
}
