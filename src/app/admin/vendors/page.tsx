"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/ui/page-shell";

interface Vendor { id: string; name: string; active: boolean; }
interface Purchaser { id: string; initials: string; full_name: string; active: boolean; }

export default function VendorManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchasers, setPurchasers] = useState<Purchaser[]>([]);

  // Add forms
  const [newVendorName, setNewVendorName] = useState("");
  const [addingVendor, setAddingVendor] = useState(false);
  const [showVendorForm, setShowVendorForm] = useState(false);
  const [newPurchaserInitials, setNewPurchaserInitials] = useState("");
  const [newPurchaserName, setNewPurchaserName] = useState("");
  const [addingPurchaser, setAddingPurchaser] = useState(false);
  const [showPurchaserForm, setShowPurchaserForm] = useState(false);

  // Edit state
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editingVendorName, setEditingVendorName] = useState("");
  const [editingPurchaserId, setEditingPurchaserId] = useState<string | null>(null);
  const [editingPurchaserInitials, setEditingPurchaserInitials] = useState("");
  const [editingPurchaserName, setEditingPurchaserName] = useState("");

  const checkAdmin = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) { router.push("/"); return false; }
    const { data } = await supabase.from("user_roles").select("role").eq("email", session.user.email).single();
    if (data?.role !== "admin" && data?.role !== "production") { router.push("/"); return false; }
    return true;
  }, [router]);

  const fetchVendors = useCallback(async () => {
    const { data } = await supabase.from("vendors").select("*").order("name");
    if (data) setVendors(data as Vendor[]);
  }, []);

  const fetchPurchasers = useCallback(async () => {
    const { data } = await supabase.from("purchasers").select("*").order("full_name");
    if (data) setPurchasers(data as Purchaser[]);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const isAdmin = await checkAdmin();
      if (isAdmin) await Promise.all([fetchVendors(), fetchPurchasers()]);
      setLoading(false);
    }
    init();
  }, [checkAdmin, fetchVendors, fetchPurchasers]);

  async function handleAddVendor() {
    if (!newVendorName.trim()) return;
    setAddingVendor(true);
    const { error } = await supabase.from("vendors").insert({ name: newVendorName.trim() });
    setAddingVendor(false);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success("Vendor added");
    setNewVendorName(""); setShowVendorForm(false);
    await fetchVendors();
  }

  async function handleSaveVendor(id: string) {
    if (!editingVendorName.trim()) return;
    const { error } = await supabase.from("vendors").update({ name: editingVendorName.trim() }).eq("id", id);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success("Vendor updated");
    setEditingVendorId(null);
    await fetchVendors();
  }

  async function handleToggleVendor(vendor: Vendor) {
    await supabase.from("vendors").update({ active: !vendor.active }).eq("id", vendor.id);
    await fetchVendors();
  }

  async function handleAddPurchaser() {
    if (!newPurchaserInitials.trim() || !newPurchaserName.trim()) return;
    setAddingPurchaser(true);
    const { error } = await supabase.from("purchasers").insert({
      initials: newPurchaserInitials.trim().toUpperCase(),
      full_name: newPurchaserName.trim(),
    });
    setAddingPurchaser(false);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success("Purchaser added");
    setNewPurchaserInitials(""); setNewPurchaserName(""); setShowPurchaserForm(false);
    await fetchPurchasers();
  }

  async function handleSavePurchaser(id: string) {
    if (!editingPurchaserInitials.trim() || !editingPurchaserName.trim()) return;
    const { error } = await supabase.from("purchasers").update({
      initials: editingPurchaserInitials.trim().toUpperCase(),
      full_name: editingPurchaserName.trim(),
    }).eq("id", id);
    if (error) { toast.error("Failed: " + error.message); return; }
    toast.success("Purchaser updated");
    setEditingPurchaserId(null);
    await fetchPurchasers();
  }

  async function handleTogglePurchaser(purchaser: Purchaser) {
    await supabase.from("purchasers").update({ active: !purchaser.active }).eq("id", purchaser.id);
    await fetchPurchasers();
  }

  if (loading) return <div className="flex items-center justify-center min-h-dvh"><p className="text-muted-foreground">Loading...</p></div>;

  return (
    <PageShell>
      <h1 className="text-2xl font-bold">Vendor Management</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vendors */}
        <Card>
          <CardHeader className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Vendors <span className="text-muted-foreground font-normal text-sm ml-1">({vendors.length})</span></CardTitle>
            <Button size="sm" onClick={() => setShowVendorForm(!showVendorForm)}>+ Add Vendor</Button>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            {showVendorForm && (
              <div className="flex flex-col gap-2 px-4 pb-2 pt-4 sm:flex-row">
                <Input value={newVendorName} onChange={(e) => setNewVendorName(e.target.value)} placeholder="Vendor name" onKeyDown={(e) => e.key === "Enter" && handleAddVendor()} autoFocus />
                <Button onClick={handleAddVendor} disabled={addingVendor || !newVendorName.trim()} size="sm">{addingVendor ? "Adding..." : "Add"}</Button>
                <Button variant="outline" size="sm" onClick={() => { setShowVendorForm(false); setNewVendorName(""); }}>Cancel</Button>
              </div>
            )}
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="text-right w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.length === 0 ? (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">No vendors yet</TableCell></TableRow>
                  ) : vendors.map((vendor) => (
                    <TableRow key={vendor.id}>
                      <TableCell>
                        {editingVendorId === vendor.id ? (
                          <Input value={editingVendorName} onChange={(e) => setEditingVendorName(e.target.value)} className="h-7 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSaveVendor(vendor.id); if (e.key === "Escape") setEditingVendorId(null); }} autoFocus />
                        ) : (
                          <span className="font-medium">{vendor.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={vendor.active ? "default" : "outline"}>{vendor.active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {editingVendorId === vendor.id ? (
                            <>
                              <Button variant="default" size="sm" className="h-7 text-xs px-2" onClick={() => handleSaveVendor(vendor.id)}>Save</Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setEditingVendorId(null)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setEditingVendorId(vendor.id); setEditingVendorName(vendor.name); }}>Edit</Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground" onClick={() => handleToggleVendor(vendor)}>{vendor.active ? "Deactivate" : "Activate"}</Button>
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

        {/* Purchasers */}
        <Card>
          <CardHeader className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Purchasers <span className="text-muted-foreground font-normal text-sm ml-1">({purchasers.length})</span></CardTitle>
            <Button size="sm" onClick={() => setShowPurchaserForm(!showPurchaserForm)}>+ Add Purchaser</Button>
          </CardHeader>
          <CardContent className="space-y-4 p-0">
            {showPurchaserForm && (
              <div className="flex flex-col gap-2 px-4 pb-2 pt-4 sm:flex-row">
                <Input value={newPurchaserInitials} onChange={(e) => setNewPurchaserInitials(e.target.value)} placeholder="Initials" className="w-full sm:w-24" />
                <Input value={newPurchaserName} onChange={(e) => setNewPurchaserName(e.target.value)} placeholder="Full name" onKeyDown={(e) => e.key === "Enter" && handleAddPurchaser()} />
                <Button onClick={handleAddPurchaser} disabled={addingPurchaser || !newPurchaserInitials.trim() || !newPurchaserName.trim()} size="sm">{addingPurchaser ? "Adding..." : "Add"}</Button>
                <Button variant="outline" size="sm" onClick={() => { setShowPurchaserForm(false); setNewPurchaserInitials(""); setNewPurchaserName(""); }}>Cancel</Button>
              </div>
            )}
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Initials</TableHead>
                    <TableHead>Full Name</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead className="text-right w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchasers.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No purchasers yet</TableCell></TableRow>
                  ) : purchasers.map((purchaser) => (
                    <TableRow key={purchaser.id}>
                      <TableCell>
                        {editingPurchaserId === purchaser.id ? (
                          <Input value={editingPurchaserInitials} onChange={(e) => setEditingPurchaserInitials(e.target.value)} className="h-7 text-sm w-20" autoFocus />
                        ) : (
                          <span className="font-mono font-medium">{purchaser.initials}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingPurchaserId === purchaser.id ? (
                          <Input value={editingPurchaserName} onChange={(e) => setEditingPurchaserName(e.target.value)} className="h-7 text-sm" onKeyDown={(e) => { if (e.key === "Enter") handleSavePurchaser(purchaser.id); if (e.key === "Escape") setEditingPurchaserId(null); }} />
                        ) : (
                          <span>{purchaser.full_name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={purchaser.active ? "default" : "outline"}>{purchaser.active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          {editingPurchaserId === purchaser.id ? (
                            <>
                              <Button variant="default" size="sm" className="h-7 text-xs px-2" onClick={() => handleSavePurchaser(purchaser.id)}>Save</Button>
                              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={() => setEditingPurchaserId(null)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => { setEditingPurchaserId(purchaser.id); setEditingPurchaserInitials(purchaser.initials); setEditingPurchaserName(purchaser.full_name); }}>Edit</Button>
                              <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-muted-foreground" onClick={() => handleTogglePurchaser(purchaser)}>{purchaser.active ? "Deactivate" : "Activate"}</Button>
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
      </div>
    </PageShell>
  );
}
