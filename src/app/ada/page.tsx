import { AdaAccessGate } from "@/components/ada-access-gate";
import { AdaWorkspaceShell } from "@/components/ada-workspace-shell";

export default function AdaPage() {
  return <AdaAccessGate><AdaWorkspaceShell /></AdaAccessGate>;
}
