"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { UserRoleRow } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageShell } from "@/components/ui/page-shell";

const ROLES = ["admin", "pm", "production", "viewer"] as const;
type Role = typeof ROLES[number];

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full access — all projects, budgets, bonuses, settings, reconciliation",
  pm: "Project manager — sees own projects and can log expenses",
  production: "Production staff — sees all projects, adds expenses and purchasing; no budgets, bonuses, data entry, or settings",
  viewer: "Read-only — can view projects and labor data, cannot create or edit",
};

export default function UsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRoleRow[]>([]);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newBillSpendEmail, setNewBillSpendEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<Role>("pm");
  const [newInitials, setNewInitials] = useState("");
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editBillSpendEmail, setEditBillSpendEmail] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<Role>("pm");
  const [editInitials, setEditInitials] = useState("");

  const checkAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) { router.push("/"); return false; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
    if (data?.role !== "admin") { router.push("/"); return false; }
    return true;
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("*")
      .order("role")
      .order("email");
    if (data) setUsers(data as UserRoleRow[]);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const isAdmin = await checkAdmin();
      if (isAdmin) await fetchUsers();
      setLoading(false);
    }
    init();
  }, [checkAdmin, fetchUsers]);

  function resetAddForm() {
    setNewEmail(""); setNewBillSpendEmail(""); setNewFullName(""); setNewRole("pm"); setNewInitials("");
  }

  async function handleAdd() {
    if (!newEmail.trim()) { toast.error("Email is required"); return; }
    if (!newFullName.trim()) { toast.error("Full name is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("user_roles").insert({
      email: newEmail.trim().toLowerCase(),
      bill_spend_email: newBillSpendEmail.trim().toLowerCase() || null,
      full_name: newFullName.trim(),
      role: newRole,
      pm_initials: newInitials.trim().toUpperCase() || null,
      show_in_filters: newRole === "pm",
    });
    setSaving(false);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success(`${newFullName} added`);
    resetAddForm();
    setShowAddForm(false);
    await fetchUsers();
  }

  async function handleSave(email: string) {
    if (!editFullName.trim()) { toast.error("Full name is required"); return; }
    setSaving(true);
    const { error } = await supabase.from("user_roles").update({
      bill_spend_email: editBillSpendEmail.trim().toLowerCase() || null,
      full_name: editFullName.trim(),
      role: editRole,
      pm_initials: editInitials.trim().toUpperCase() || null,
    }).eq("email", email);
    setSaving(false);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success("User updated");
    setEditingEmail(null);
    await fetchUsers();
  }

  async function handleToggleFilter(email: string, current: boolean) {
    const { error } = await supabase.from("user_roles").update({ show_in_filters: !current }).eq("email", email);
    if (error) { toast.error("Failed to update"); return; }
    setUsers((prev) => prev.map((u) => u.email === email ? { ...u, show_in_filters: !current } : u));
    toast.success(!current ? "Shown in PM filters" : "Hidden from PM filters");
  }

  async function handleDelete(email: string, name: string) {
    if (!confirm(`Remove ${name || email} from user roles?`)) return;
    await supabase.from("user_roles").delete().eq("email", email);
    toast.success("User removed");
    await fetchUsers();
  }

  function startEdit(user: UserRoleRow) {
    setEditingEmail(user.email);
    setEditBillSpendEmail(user.bill_spend_email ?? "");
    setEditFullName(user.full_name ?? "");
    setEditRole((user.role as Role) ?? "pm");
    setEditInitials(user.pm_initials ?? "");
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-muted-foreground">Loading...</p>
    </div>
  );

  return (
    <PageShell>
      <div>
        <h1 className="text-2xl font-bold">User Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage who can access the tracker and what they can see.</p>
      </div>

      {/* Role legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {ROLES.map((role) => (
          <div key={role} className="rounded-lg border p-3">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant={role === "admin" ? "default" : role === "pm" ? "secondary" : "outline"}>{role}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>
            Users
            <span className="text-muted-foreground font-normal text-sm ml-1">({users.length})</span>
          </CardTitle>
          <Button size="sm" onClick={() => { setShowAddForm(!showAddForm); resetAddForm(); }}>
            {showAddForm ? "Cancel" : "+ Add User"}
          </Button>
        </CardHeader>
        <CardContent className="p-0">

          {/* Add form */}
          {showAddForm && (
            <div className="px-4 py-4 border-b bg-muted/30 space-y-3">
              <p className="text-sm font-medium">New user</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Full Name *</label>
                  <Input
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                    placeholder="e.g. David Martinez"
                    autoFocus
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Email *</label>
                  <Input
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="email@meccadesign.com"
                    type="email"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    BILL member email
                    <span className="text-muted-foreground font-normal ml-1">(optional — defaults to email if blank)</span>
                  </label>
                  <Input
                    value={newBillSpendEmail}
                    onChange={(e) => setNewBillSpendEmail(e.target.value)}
                    placeholder="bill-user@company.com"
                    type="email"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">Role *</label>
                  <Select value={newRole} onValueChange={(v) => setNewRole((v as Role) ?? "pm")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">
                    Initials
                    <span className="text-muted-foreground font-normal ml-1">(optional — used for PM project assignment)</span>
                  </label>
                  <Input
                    value={newInitials}
                    onChange={(e) => setNewInitials(e.target.value.toUpperCase().slice(0, 3))}
                    placeholder="e.g. DM"
                    maxLength={3}
                    className="uppercase"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => { setShowAddForm(false); resetAddForm(); }}>Cancel</Button>
                <Button size="sm" onClick={handleAdd} disabled={saving || !newEmail.trim() || !newFullName.trim()}>
                  {saving ? "Adding…" : "Add User"}
                </Button>
              </div>
            </div>
          )}

          {/* Users table */}
          <div data-slot="users-mobile-list" className="divide-y md:hidden">
            {users.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No users found.</p>
            ) : users.map((user) => (
              <article key={user.email} className="space-y-3 p-4">
                {editingEmail === user.email ? (
                  <>
                    <div className="space-y-1"><label className="text-xs text-muted-foreground">Full name</label><Input value={editFullName} onChange={(e) => setEditFullName(e.target.value)} /></div>
                    <div className="space-y-1"><label className="text-xs text-muted-foreground">BILL member email</label><Input type="email" value={editBillSpendEmail} onChange={(e) => setEditBillSpendEmail(e.target.value)} /></div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1"><label className="text-xs text-muted-foreground">Role</label><Select value={editRole} onValueChange={(v) => setEditRole((v as Role) ?? "pm")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
                      <div className="space-y-1"><label className="text-xs text-muted-foreground">Initials</label><Input value={editInitials} onChange={(e) => setEditInitials(e.target.value.toUpperCase().slice(0, 3))} className="uppercase" /></div>
                    </div>
                    <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => handleSave(user.email)} disabled={saving}>Save</Button><Button variant="outline" size="sm" onClick={() => setEditingEmail(null)}>Cancel</Button></div>
                  </>
                ) : (
                  <>
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0"><p className="break-words font-medium">{user.full_name || "Unnamed user"}</p><p className="break-all text-sm text-muted-foreground">{user.email}</p></div>
                      <Badge variant={user.role === "admin" ? "default" : user.role === "pm" ? "secondary" : "outline"}>{user.role}</Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-xs">
                      <div className="col-span-2"><dt className="text-muted-foreground">BILL email</dt><dd className="break-all">{user.bill_spend_email || "Uses login email"}</dd></div>
                      <div><dt className="text-muted-foreground">Initials</dt><dd>{user.pm_initials || "—"}</dd></div>
                      <div><dt className="text-muted-foreground">PM filters</dt><dd>{user.show_in_filters ? "Visible" : "Hidden"}</dd></div>
                    </dl>
                    <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => startEdit(user)}>Edit</Button><Button variant="outline" size="sm" onClick={() => handleToggleFilter(user.email, user.show_in_filters ?? false)}>{user.show_in_filters ? "Hide from filters" : "Show in filters"}</Button><Button variant="outline" size="sm" className="text-red-500" onClick={() => handleDelete(user.email, user.full_name ?? "")}>Remove</Button></div>
                  </>
                )}
              </article>
            ))}
          </div>
          <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>BILL member email</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-20">Initials</TableHead>
                <TableHead className="w-32 text-center">PM Filters</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    No users found.
                  </TableCell>
                </TableRow>
              ) : users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell className="font-medium text-sm">
                    {editingEmail === user.email ? (
                      <Input
                        value={editFullName}
                        onChange={(e) => setEditFullName(e.target.value)}
                        className="h-7 text-sm"
                        placeholder="Full name"
                        autoFocus
                      />
                    ) : (
                      <span>{user.full_name || <span className="text-muted-foreground italic">—</span>}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{user.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {editingEmail === user.email ? (
                      <Input
                        value={editBillSpendEmail}
                        onChange={(e) => setEditBillSpendEmail(e.target.value)}
                        className="h-7 text-sm"
                        placeholder="bill-user@company.com"
                        type="email"
                      />
                    ) : (
                      <span>{user.bill_spend_email || <span className="italic">Uses login email</span>}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingEmail === user.email ? (
                      <Select value={editRole} onValueChange={(v) => setEditRole((v as Role) ?? "pm")}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={user.role === "admin" ? "default" : user.role === "pm" ? "secondary" : "outline"}>
                        {user.role}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingEmail === user.email ? (
                      <Input
                        value={editInitials}
                        onChange={(e) => setEditInitials(e.target.value.toUpperCase().slice(0, 3))}
                        className="h-7 text-xs w-16 uppercase"
                        maxLength={3}
                        placeholder="e.g. DM"
                      />
                    ) : (
                      <span className="text-sm font-mono text-muted-foreground">{user.pm_initials || "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => handleToggleFilter(user.email, user.show_in_filters ?? false)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        (user.show_in_filters ?? false) ? "bg-primary" : "bg-muted"
                      }`}
                      title={(user.show_in_filters ?? false) ? "Visible in PM filters" : "Hidden from PM filters"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        (user.show_in_filters ?? false) ? "translate-x-4" : "translate-x-0.5"
                      }`} />
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {editingEmail === user.email ? (
                        <>
                          <Button variant="default" size="sm" className="h-7 text-xs px-2" onClick={() => handleSave(user.email)} disabled={saving}>
                            {saving ? "…" : "Save"}
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setEditingEmail(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => startEdit(user)}>Edit</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-red-500 hover:text-red-600" onClick={() => handleDelete(user.email, user.full_name ?? "")}>Remove</Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
