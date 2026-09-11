import { redirect } from "next/navigation";

export default async function AdaWorkspacePage({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  redirect(`/quotes/${workspaceId}`);
}
