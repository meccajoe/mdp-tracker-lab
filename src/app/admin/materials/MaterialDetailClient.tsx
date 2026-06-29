"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface VendorOption {
  id: string;
  name: string;
}

interface MaterialAlias {
  id: string;
  alias_text: string;
  normalized_alias_text?: string | null;
  created_at?: string | null;
}

interface MaterialChangeLogRow {
  id: string;
  entity_type: string;
  change_type: string;
  changed_by: string | null;
  changed_at: string;
  field_name?: string | null;
  batch_id?: string | null;
  batch?: {
    id: string;
    source_name?: string | null;
    status?: string | null;
    created_at?: string | null;
  } | null;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
}

interface MaterialVendorPrice {
  id?: string;
  localKey: string;
  vendor_id: string;
  vendor_sku: string;
  vendor_material_name: string;
  vendor_dimension_text: string;
  unit: string;
  pack_quantity: string;
  price: string;
  price_basis: string;
  effective_date: string;
  source_type: "manual" | "spreadsheet" | "invoice" | "bill";
  source_ref: string;
  notes: string;
  is_current: boolean;
  vendor: { id: string; name: string } | null;
}

interface MaterialDetail {
  id?: string;
  canonical_name: string;
  category: string;
  subcategory: string;
  dimensions: string;
  thickness_text: string;
  base_unit: string;
  default_vendor_id: string;
  default_price: string;
  sku_or_code: string;
  finish: string;
  notes: string;
  active: boolean;
}

const EMPTY_FORM: MaterialDetail = {
  canonical_name: "",
  category: "",
  subcategory: "",
  dimensions: "",
  thickness_text: "",
  base_unit: "",
  default_vendor_id: "",
  default_price: "",
  sku_or_code: "",
  finish: "",
  notes: "",
  active: true,
};

function createBlankVendorPriceRow(): MaterialVendorPrice {
  return {
    localKey: `new-${crypto.randomUUID()}`,
    vendor_id: "",
    vendor_sku: "",
    vendor_material_name: "",
    vendor_dimension_text: "",
    unit: "",
    pack_quantity: "",
    price: "",
    price_basis: "",
    effective_date: "",
    source_type: "manual",
    source_ref: "",
    notes: "",
    is_current: true,
    vendor: null,
  };
}

function toEditableVendorPrice(row: any, index: number): MaterialVendorPrice {
  return {
    id: row.id,
    localKey: row.id ?? `existing-${index}`,
    vendor_id: row.vendor_id ?? row.vendor?.id ?? "",
    vendor_sku: row.vendor_sku ?? "",
    vendor_material_name: row.vendor_material_name ?? "",
    vendor_dimension_text: row.vendor_dimension_text ?? "",
    unit: row.unit ?? "",
    pack_quantity: row.pack_quantity != null ? String(row.pack_quantity) : "",
    price: row.price != null ? String(row.price) : "",
    price_basis: row.price_basis ?? "",
    effective_date: row.effective_date ?? "",
    source_type: row.source_type ?? "manual",
    source_ref: row.source_ref ?? "",
    notes: row.notes ?? "",
    is_current: row.is_current !== false,
    vendor: row.vendor ?? null,
  };
}

function normalizeFormToPayload(form: MaterialDetail) {
  return {
    canonical_name: form.canonical_name,
    category: form.category,
    subcategory: form.subcategory || null,
    dimensions: form.dimensions || null,
    thickness_text: form.thickness_text || null,
    base_unit: form.base_unit || null,
    default_vendor_id: form.default_vendor_id || null,
    default_price: form.default_price ? Number(form.default_price) : null,
    sku_or_code: form.sku_or_code || null,
    finish: form.finish || null,
    notes: form.notes || null,
    active: form.active,
  };
}

function normalizeVendorPricePayload(row: MaterialVendorPrice, setAsDefault = false) {
  return {
    vendor_id: row.vendor_id || null,
    vendor_sku: row.vendor_sku || null,
    vendor_material_name: row.vendor_material_name || null,
    vendor_dimension_text: row.vendor_dimension_text || null,
    unit: row.unit || null,
    pack_quantity: row.pack_quantity ? Number(row.pack_quantity) : null,
    price: row.price ? Number(row.price) : null,
    price_basis: row.price_basis || null,
    effective_date: row.effective_date || null,
    source_type: row.source_type,
    source_ref: row.source_ref || null,
    notes: row.notes || null,
    is_current: row.is_current,
    set_as_default: setAsDefault,
  };
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function summarizeChange(row: MaterialChangeLogRow) {
  const entityLabel = row.entity_type.replace(/_/g, " ");
  const batchText = row.batch?.source_name ? ` · ${row.batch.source_name}` : "";
  return `${row.change_type} ${entityLabel}${batchText}`;
}

export default function MaterialDetailClient({
  mode,
  materialId,
}: {
  mode: "create" | "edit";
  materialId?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<MaterialDetail>(EMPTY_FORM);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [aliases, setAliases] = useState<MaterialAlias[]>([]);
  const [vendorPrices, setVendorPrices] = useState<MaterialVendorPrice[]>([]);
  const [changeLog, setChangeLog] = useState<MaterialChangeLogRow[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);
  const [savingAliasKey, setSavingAliasKey] = useState<string | null>(null);
  const [savingVendorPriceKey, setSavingVendorPriceKey] = useState<string | null>(null);

  const fetchVendors = useCallback(async () => {
    const { data, error } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (error) {
      toast.error(`Failed to load vendors: ${error.message}`);
      return;
    }

    setVendors((data ?? []) as VendorOption[]);
  }, []);

  const fetchMaterial = useCallback(async () => {
    if (mode !== "edit" || !materialId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/materials/${materialId}`);
      if (!response.ok) throw new Error(`Failed to load material: ${response.status}`);
      const payload = await response.json() as { item: any };
      const item = payload.item;

      setForm({
        id: item.id,
        canonical_name: item.canonical_name ?? "",
        category: item.category ?? "",
        subcategory: item.subcategory ?? "",
        dimensions: item.dimensions ?? "",
        thickness_text: item.thickness_text ?? "",
        base_unit: item.base_unit ?? "",
        default_vendor_id: item.default_vendor_id ?? "",
        default_price: item.default_price != null ? String(item.default_price) : "",
        sku_or_code: item.sku_or_code ?? "",
        finish: item.finish ?? "",
        notes: item.notes ?? "",
        active: item.active !== false,
      });
      setAliases((item.material_aliases ?? []) as MaterialAlias[]);
      setVendorPrices((item.material_vendor_prices ?? []).map((row: any, index: number) => toEditableVendorPrice(row, index)));
      setChangeLog((item.material_change_log ?? []) as MaterialChangeLogRow[]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [materialId, mode]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  useEffect(() => {
    fetchMaterial();
  }, [fetchMaterial]);

  const currentChangeLog = useMemo(() => changeLog.slice(0, 20), [changeLog]);

  function updateField<K extends keyof MaterialDetail>(key: K, value: MaterialDetail[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateAlias(aliasId: string, value: string) {
    setAliases((current) => current.map((alias) => (
      alias.id === aliasId ? { ...alias, alias_text: value } : alias
    )));
  }

  function updateVendorPriceRow(localKey: string, field: keyof MaterialVendorPrice, value: string | boolean | null) {
    setVendorPrices((current) => current.map((row) => {
      if (row.localKey !== localKey) return row;
      return {
        ...row,
        [field]: value,
        ...(field === "vendor_id"
          ? {
              vendor: vendors.find((vendor) => vendor.id === value) ?? null,
            }
          : {}),
      };
    }));
  }

  async function handleSave() {
    if (!form.canonical_name.trim() || !form.category.trim()) {
      toast.error("Canonical Name and Category are required.");
      return;
    }

    setSaving(true);
    try {
      const payload = normalizeFormToPayload(form);
      const response = await fetch(mode === "create" ? "/api/materials" : `/api/materials/${materialId}`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Save failed: ${response.status}`);

      toast.success(mode === "create" ? "Material created" : "Material updated");
      if (mode === "create" && result.item?.id) {
        router.push(`/admin/materials/${result.item.id}`);
        router.refresh();
      } else {
        await fetchMaterial();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (mode !== "edit" || !materialId) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/materials/${materialId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !form.active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Archive failed: ${response.status}`);
      toast.success(form.active ? "Material archived" : "Material restored");
      await fetchMaterial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAlias() {
    if (mode !== "edit" || !materialId || !newAlias.trim()) return;
    setSavingAliasKey("new");
    try {
      const response = await fetch(`/api/materials/${materialId}/aliases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias_text: newAlias }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Alias save failed: ${response.status}`);
      setNewAlias("");
      toast.success("Alias added");
      await fetchMaterial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingAliasKey(null);
    }
  }

  async function handleSaveAlias(alias: MaterialAlias) {
    if (mode !== "edit" || !materialId || !alias.id) return;
    setSavingAliasKey(alias.id);
    try {
      const response = await fetch(`/api/materials/${materialId}/aliases/${alias.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alias_text: alias.alias_text }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Alias update failed: ${response.status}`);
      toast.success("Alias updated");
      await fetchMaterial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingAliasKey(null);
    }
  }

  async function handleDeleteAlias(aliasId: string) {
    if (mode !== "edit" || !materialId) return;
    setSavingAliasKey(aliasId);
    try {
      const response = await fetch(`/api/materials/${materialId}/aliases/${aliasId}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Alias delete failed: ${response.status}`);
      toast.success("Alias removed");
      await fetchMaterial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingAliasKey(null);
    }
  }

  async function handleSaveVendorPrice(row: MaterialVendorPrice, setAsDefault = false) {
    if (mode !== "edit" || !materialId) return;
    if (!row.price.trim()) {
      toast.error("Vendor price amount is required.");
      return;
    }

    setSavingVendorPriceKey(row.localKey);
    try {
      const response = await fetch(
        row.id ? `/api/materials/${materialId}/vendor-prices/${row.id}` : `/api/materials/${materialId}/vendor-prices`,
        {
          method: row.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(normalizeVendorPricePayload(row, setAsDefault)),
        }
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Vendor price save failed: ${response.status}`);
      toast.success(setAsDefault ? "Vendor price saved and set as default" : "Vendor price saved");
      await fetchMaterial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingVendorPriceKey(null);
    }
  }

  async function handleRetireVendorPrice(row: MaterialVendorPrice) {
    if (mode !== "edit" || !materialId) return;

    if (!row.id) {
      setVendorPrices((current) => current.filter((item) => item.localKey !== row.localKey));
      return;
    }

    setSavingVendorPriceKey(row.localKey);
    try {
      const response = await fetch(`/api/materials/${materialId}/vendor-prices/${row.id}`, {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? `Vendor price retire failed: ${response.status}`);
      toast.success("Vendor price retired");
      await fetchMaterial();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingVendorPriceKey(null);
    }
  }

  if (loading) {
    return <div className="py-10 text-center text-muted-foreground">Loading material…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{mode === "create" ? "Create Material" : form.canonical_name || "Material Detail"}</h1>
          <p className="text-sm text-muted-foreground">
            Maintain the canonical catalog record used by the materials database.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/materials" className={buttonVariants({ variant: "outline" })}>Back to Materials</Link>
          {mode === "edit" && (
            <Button variant="outline" onClick={handleArchiveToggle} disabled={saving}>
              {form.active ? "Archive Material" : "Restore Material"}
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : mode === "create" ? "Create Material" : "Save Material"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Canonical Name</label>
          <Input value={form.canonical_name} onChange={(e) => updateField("canonical_name", e.target.value)} placeholder="Canonical Name" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Category</label>
          <Input value={form.category} onChange={(e) => updateField("category", e.target.value)} placeholder="Category" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Subcategory</label>
          <Input value={form.subcategory} onChange={(e) => updateField("subcategory", e.target.value)} placeholder="Subcategory" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Dimensions</label>
          <Input value={form.dimensions} onChange={(e) => updateField("dimensions", e.target.value)} placeholder="Dimensions" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Thickness</label>
          <Input value={form.thickness_text} onChange={(e) => updateField("thickness_text", e.target.value)} placeholder="Thickness" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Base Unit</label>
          <Input value={form.base_unit} onChange={(e) => updateField("base_unit", e.target.value)} placeholder="Base Unit" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Default Vendor</label>
          <Select value={form.default_vendor_id || "none"} onValueChange={(value) => updateField("default_vendor_id", value === "none" ? "" : value ?? "") }>
            <SelectTrigger>
              <SelectValue placeholder="Select vendor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No default vendor</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Default Price</label>
          <Input value={form.default_price} onChange={(e) => updateField("default_price", e.target.value)} placeholder="Default Price" type="number" step="0.01" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">SKU / Code</label>
          <Input value={form.sku_or_code} onChange={(e) => updateField("sku_or_code", e.target.value)} placeholder="SKU / Code" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Finish</label>
          <Input value={form.finish} onChange={(e) => updateField("finish", e.target.value)} placeholder="Finish" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Notes</label>
        <Textarea
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          placeholder="Notes"
          className="min-h-28"
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Material Aliases</h2>
            <p className="text-xs text-muted-foreground">Add alternate names so search can still find the right canonical record.</p>
          </div>
          <Badge variant={form.active ? "default" : "outline"}>{form.active ? "Active" : "Inactive"}</Badge>
        </div>

        {mode === "create" ? (
          <p className="text-sm text-muted-foreground">Create the material first, then add aliases.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input value={newAlias} onChange={(e) => setNewAlias(e.target.value)} placeholder="Add alias" />
              <Button onClick={handleCreateAlias} disabled={savingAliasKey === "new"}>{savingAliasKey === "new" ? "Adding…" : "Add Alias"}</Button>
            </div>
            {aliases.length === 0 ? (
              <p className="text-sm text-muted-foreground">No aliases on this material yet.</p>
            ) : (
              <div className="space-y-2">
                {aliases.map((alias) => (
                  <div key={alias.id} className="flex flex-col gap-2 rounded-md border border-border p-3 md:flex-row md:items-center">
                    <Input value={alias.alias_text} onChange={(e) => updateAlias(alias.id, e.target.value)} />
                    <div className="flex gap-2 md:w-auto">
                      <Button variant="outline" onClick={() => handleSaveAlias(alias)} disabled={savingAliasKey === alias.id}>Save Alias</Button>
                      <Button variant="ghost" onClick={() => handleDeleteAlias(alias.id)} disabled={savingAliasKey === alias.id}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Current Vendor Prices</h2>
            <p className="text-xs text-muted-foreground">Manage vendor-specific pricing rows and optionally set one as the default catalog price.</p>
          </div>
          {mode === "edit" && (
            <Button variant="outline" onClick={() => setVendorPrices((current) => [...current, createBlankVendorPriceRow()])}>
              Add Vendor Price
            </Button>
          )}
        </div>

        {mode === "create" ? (
          <p className="text-sm text-muted-foreground">Create the material first, then add vendor price rows.</p>
        ) : vendorPrices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current vendor prices on this record yet.</p>
        ) : (
          <div className="space-y-4">
            {vendorPrices.map((row) => (
              <div key={row.localKey} className="rounded-md border border-border p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Vendor</label>
                    <Select value={row.vendor_id || "none"} onValueChange={(value) => updateVendorPriceRow(row.localKey, "vendor_id", value === "none" ? "" : value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select vendor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No vendor</SelectItem>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Price</label>
                    <Input value={row.price} onChange={(e) => updateVendorPriceRow(row.localKey, "price", e.target.value)} type="number" step="0.01" placeholder="0.00" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Price Basis</label>
                    <Input value={row.price_basis} onChange={(e) => updateVendorPriceRow(row.localKey, "price_basis", e.target.value)} placeholder="sheet / sq ft / ea" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Unit</label>
                    <Input value={row.unit} onChange={(e) => updateVendorPriceRow(row.localKey, "unit", e.target.value)} placeholder="EA" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Pack Quantity</label>
                    <Input value={row.pack_quantity} onChange={(e) => updateVendorPriceRow(row.localKey, "pack_quantity", e.target.value)} type="number" step="0.01" placeholder="1" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Effective Date</label>
                    <Input value={row.effective_date} onChange={(e) => updateVendorPriceRow(row.localKey, "effective_date", e.target.value)} type="date" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Vendor SKU</label>
                    <Input value={row.vendor_sku} onChange={(e) => updateVendorPriceRow(row.localKey, "vendor_sku", e.target.value)} placeholder="Vendor SKU" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Vendor Material Name</label>
                    <Input value={row.vendor_material_name} onChange={(e) => updateVendorPriceRow(row.localKey, "vendor_material_name", e.target.value)} placeholder="Vendor material name" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Vendor Dimension Text</label>
                    <Input value={row.vendor_dimension_text} onChange={(e) => updateVendorPriceRow(row.localKey, "vendor_dimension_text", e.target.value)} placeholder="Vendor dimension text" />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Source Type</label>
                    <Select value={row.source_type} onValueChange={(value) => updateVendorPriceRow(row.localKey, "source_type", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Source type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="spreadsheet">Spreadsheet</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                        <SelectItem value="bill">BILL</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1 xl:col-span-2">
                    <label className="text-xs font-medium text-muted-foreground">Source Ref</label>
                    <Input value={row.source_ref} onChange={(e) => updateVendorPriceRow(row.localKey, "source_ref", e.target.value)} placeholder="Invoice number / spreadsheet row" />
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Notes</label>
                  <Textarea value={row.notes} onChange={(e) => updateVendorPriceRow(row.localKey, "notes", e.target.value)} className="min-h-20" placeholder="Optional notes about this vendor price" />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => handleSaveVendorPrice(row)} disabled={savingVendorPriceKey === row.localKey}>Save Vendor Price</Button>
                  <Button variant="outline" onClick={() => handleSaveVendorPrice(row, true)} disabled={savingVendorPriceKey === row.localKey}>Save + Set Default</Button>
                  <Button variant="ghost" onClick={() => handleRetireVendorPrice(row)} disabled={savingVendorPriceKey === row.localKey}>
                    {row.id ? "Retire" : "Remove"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3">
          <h2 className="font-medium">Audit History</h2>
          <p className="text-xs text-muted-foreground">Recent material, alias, vendor price, and import events for this catalog record.</p>
        </div>
        {mode === "create" ? (
          <p className="text-sm text-muted-foreground">Create the material first, then audit history will appear here.</p>
        ) : currentChangeLog.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit history recorded yet.</p>
        ) : (
          <div className="space-y-3">
            {currentChangeLog.map((row) => (
              <div key={row.id} className="rounded-md border border-border p-3">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div className="font-medium capitalize">{summarizeChange(row)}</div>
                  <div className="text-xs text-muted-foreground">{formatTimestamp(row.changed_at)}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {row.changed_by ?? "Unknown user"}
                  {row.batch_id ? ` • batch ${row.batch_id}` : ""}
                </div>
                {row.field_name ? (
                  <div className="mt-2 text-xs text-muted-foreground">Field: {row.field_name}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
