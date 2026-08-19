"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AdaWorkspaceDetail } from "@/components/ada-workspace-detail";
import { AdaCreateDialog, AdaWorkspaceSurface } from "@/components/ada-workspace-surface";
import { adaFetch } from "@/lib/ada-client";

type AdaWorkspace = { id: string; ada_project_id: string | null; title: string; client_name: string | null; status: "draft" | "gathering_inputs" | "estimating" | "in_review" | "accepted" | "handed_off" | "archived"; last_activity_at: string };
type AdaProject = { id: string; title: string; client_name: string | null };
type CreateMode = "project" | "chat" | null;
type Filter = AdaWorkspace["status"] | "recent";

export function AdaWorkspaceShell({ workspaceId }: { workspaceId?: string }) {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<AdaWorkspace[]>([]);
  const [projects, setProjects] = useState<AdaProject[]>([]);
  const [filter, setFilter] = useState<Filter>("recent");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [newChatProjectId, setNewChatProjectId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [quoteLibraryCollapsed, setQuoteLibraryCollapsed] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [editingChat, setEditingChat] = useState<AdaWorkspace | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const params = new URLSearchParams();
    if (filter !== "recent") params.set("status", filter);
    if (query.trim()) params.set("search", query.trim());
    const [chatsResponse, projectsResponse] = await Promise.all([adaFetch(`/api/ada/workspaces?${params.toString()}`), adaFetch("/api/ada/projects")]);
    const chatsResult = await chatsResponse.json().catch(() => ({}));
    const projectsResult = await projectsResponse.json().catch(() => ({}));
    if (!chatsResponse.ok || !projectsResponse.ok) { setError(chatsResult.error ?? projectsResult.error ?? "Ada library could not load."); setWorkspaces([]); setProjects([]); } else { setWorkspaces(chatsResult.workspaces ?? []); setProjects(projectsResult.projects ?? []); }
    setLoading(false);
  }, [filter, query]);

  useEffect(() => { void load(); }, [load]);
  const selected = useMemo(() => workspaces.find((workspace) => workspace.id === workspaceId) ?? null, [workspaceId, workspaces]);
  const openNewChat = (projectId?: string) => { setNewChatProjectId(projectId ?? null); setCreateMode("chat"); };

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const title = String(form.get("title") ?? "").trim(); if (!title || !createMode) return;
    const selectedProjectId = newChatProjectId ?? (String(form.get("adaProjectId") ?? "") || undefined); const isProject = createMode === "project";
    setCreating(true); const response = await fetch(isProject ? "/api/ada/projects" : "/api/ada/workspaces", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, clientName: String(form.get("clientName") ?? ""), adaProjectId: isProject ? undefined : selectedProjectId }) }); const result = await response.json().catch(() => ({})); setCreating(false);
    if (!response.ok) { setError(result.error ?? "Ada item could not be created."); return; }
    setCreateMode(null); setNewChatProjectId(null); if (isProject) await load(); else router.push(`/ada/${result.workspace.id}`);
  }

  async function patchChat(chat: AdaWorkspace, changes: { title?: string; clientName?: string | null; adaProjectId?: string }) {
    const response = await adaFetch(`/api/ada/workspaces/${chat.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: changes.title ?? chat.title, clientName: changes.clientName ?? chat.client_name, adaProjectId: changes.adaProjectId }) }); const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Chat could not be updated."); return; }
    await load();
  }

  async function deleteChat(chat: AdaWorkspace) {
    if (!window.confirm(`Delete ${chat.title}? This removes its messages and uploaded files.`)) return;
    const response = await adaFetch(`/api/ada/workspaces/${chat.id}`, { method: "DELETE" }); const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Chat could not be deleted."); return; }
    if (workspaceId === chat.id) router.push("/ada"); await load();
  }

  async function updateProject(project: AdaProject) {
    const title = window.prompt("Project name", project.title);
    if (!title?.trim()) return;
    const response = await adaFetch(`/api/ada/projects/${project.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title, clientName: project.client_name }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Project could not be updated."); return; }
    await load();
  }

  async function deleteProject(project: AdaProject) {
    if (!window.confirm(`Delete ${project.title}? Its chats will remain standalone.`)) return;
    const response = await adaFetch(`/api/ada/projects/${project.id}`, { method: "DELETE" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) { setError(result.error ?? "Project could not be deleted."); return; }
    await load();
  }

  return <><AdaWorkspaceSurface projects={projects} workspaces={workspaces} workspaceId={workspaceId} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} loading={loading} error={error} onRetry={() => void load()} quoteLibraryCollapsed={quoteLibraryCollapsed} setQuoteLibraryCollapsed={setQuoteLibraryCollapsed} filterMenuOpen={filterMenuOpen} setFilterMenuOpen={setFilterMenuOpen} onNewProject={() => setCreateMode("project")} onNewChat={openNewChat} onEditChat={setEditingChat} onDeleteChat={(chat) => void deleteChat(chat)} onMoveChat={(chat, projectId) => void patchChat(chat, { adaProjectId: projectId })} onEditProject={(project) => void updateProject(project)} onDeleteProject={(project) => void deleteProject(project)}>{selected ? <AdaWorkspaceDetail workspaceId={selected.id} /> : <div className="flex h-full items-center justify-center p-8 text-center"><div><p className="text-lg font-semibold">Start a project or chat</p><p className="mt-2 text-sm text-muted-foreground">Projects keep related quote conversations together. A chat can also stand on its own.</p></div></div>}</AdaWorkspaceSurface><AdaCreateDialog mode={createMode ?? "chat"} projects={projects} open={createMode !== null} creating={creating} onClose={() => { setCreateMode(null); setNewChatProjectId(null); }} onSubmit={create} />{editingChat ? <div role="dialog" aria-modal="true" aria-label="Edit chat" className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4"><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void patchChat(editingChat, { title: String(form.get("title") ?? "").trim(), clientName: String(form.get("clientName") ?? "").trim() || null }); setEditingChat(null); }} className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl"><h2 className="text-lg font-semibold">Edit chat</h2><label className="mt-4 block text-sm font-medium">Chat title<input required name="title" defaultValue={editingChat.title} className="mt-1.5 h-10 w-full rounded-md border border-border px-3" /></label><label className="mt-4 block text-sm font-medium">Client<input name="clientName" defaultValue={editingChat.client_name ?? ""} className="mt-1.5 h-10 w-full rounded-md border border-border px-3" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={() => setEditingChat(null)} className="rounded-md px-3 py-2 text-sm">Cancel</button><button type="submit" className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background">Save changes</button></div></form></div> : null}</>;
}
