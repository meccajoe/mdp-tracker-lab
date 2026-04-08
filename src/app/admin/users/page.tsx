"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { PM_NAMES, PM_OPTIONS } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface UserRole {
  email: string;
  pm_initials: string | null;
  role: string;
  show_in_filters: boolean;
}

export default function UsersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserRole[]>([]);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editInitials, setEditInitials] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("pm");
  const [newInitials, setNewInitials] = useState("");
  const [saving, setSaving] = useState(false);

  const checkAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) { router.push("/"); return false; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
    if (data?.role !== "admin") { router.push("/"); return false; }
    return true;
  }, [router]);

  const fetchUsers = useCallback(async () => {
    const { data } = await supabase.from("user_roles").select("*").order("role").order("email");
    if (data) setUsers(data as UserRole[]);
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

  async function handleAdd() {
    if (!newEmail.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("user_roles").insert({
      email: newEmail.trim().toLowerCase(),
      role: newRole,
      pm_initials: newRole === "pm" && newInitials ? newInitials.toUpperCase() : null,
    });
    setSaving(false);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success("User added");
    setNewEmail(""); setNewRole("pm"); setNewInitials(""); setShowAddForm(false);
    await fetchUsers();
  }

  async function handleSave(email: string) {
    setSaving(true);
    const { error } = await supabase.from("user_roles").update({
      role: editRole,
      pm_initials: editRole === "pm" && editInitials ? editInitials.toUpperCase() : null,
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
    toast.success(!current ? "Shown in filters" : "Hidden from filters");
  }

  async function handleDelete(email: string) {
    if (!confirm(`Remove ${email} from user roles?`)) return;
    await supabase.from("user_roles").delete().eq("email", email);
    toast.success("User removed");
    await fetchUsers();
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">User Management</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Users <span className="text-muted-foreground font-normal text-sm ml-1">({users.length})</span></CardTitle>
          <Button size="sm" onClick={() => setShowAddForm(!showAddForm)}>+ Add User</Button>
        </CardHeader>
        <CardContent className="p-0">
          {showAddForm && (
            <div className="flex gap-2 px-4 py-3 border-b flex-wrap">
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@meccadesign.com" className="flex-1 min-w-48" />
              <Select value={newRole} onValueChange={(v) => setNewRole(v ?? "pm")}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="pm">PM</SelectItem>
                </SelectContent>
              </Select>
              {newRole === "pm" && (
                <Select value={newInitials} onValueChange={(v) => setNewInitials(v ?? "")}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="PM initials" /></SelectTrigger>
                  <SelectContent>
                    {PM_OPTIONS.map((init) => (
                      <SelectItem key={init} value={init}>{init} — {PM_NAMES[init] ?? init}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" onClick={handleAdd} disabled={saving || !newEmail.trim()}>{saving ? "Adding..." : "Add"}</Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setNewEmail(""); }}>Cancel</Button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead className="w-24">Role</TableHead>
                <TableHead className="w-40">PM</TableHead>
                <TableHead className="w-36 text-center">Show in filters</TableHead>
                <TableHead className="text-right w-36">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.email}>
                  <TableCell className="font-medium text-sm">{user.email}</TableCell>
                  <TableCell>
                    {editingEmail === user.email ? (
                      <Select value={editRole} onValueChange={(v) => setEditRole(v ?? "pm")}>
                        <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="pm">PM</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingEmail === user.email && editRole === "pm" ? (
                      <Select value={editInitials} onValueChange={(v) => setEditInitials(v ?? "")}>
                        <SelectTrigger className="h-7 w-36 text-xs"><SelectValue placeholder="Select PM" /></SelectTrigger>
                        <SelectContent>
                          {PM_OPTIONS.map((init) => (
                            <SelectItem key={init} value={init}>{init} — {PM_NAMES[init] ?? init}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {user.pm_initials ? `${user.pm_initials} — ${PM_NAMES[user.pm_initials] ?? user.pm_initials}` : "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      onClick={() => handleToggleFilter(user.email, user.show_in_filters ?? true)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                        (user.show_in_filters ?? true) ? "bg-primary" : "bg-muted"
                      }`}
                      title={(user.show_in_filters ?? true) ? "Visible in PM filters" : "Hidden from PM filters"}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        (user.show_in_filters ?? true) ? "translate-x-4" : "translate-x-0.5"
                      }`} />
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {editingEmail === user.email ? (
                        <>
                          <Button variant="default" size="sm" className="h-7 text-xs px-2" onClick={() => handleSave(user.email)} disabled={saving}>Save</Button>
                          <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setEditingEmail(null)}>Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setEditingEmail(user.email); setEditRole(user.role); setEditInitials(user.pm_initials ?? ""); }}>Edit</Button>
                          <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-red-500 hover:text-red-600" onClick={() => handleDelete(user.email)}>Remove</Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
