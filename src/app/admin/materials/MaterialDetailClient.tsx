"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface VendorOption {
  id: string;
  name: string;
}

interface MaterialVendorPrice {
  id: string;
  price: number;
  price_basis: string | null;
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
  material_vendor_prices?: MaterialVendorPrice[];
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
  material_vendor_prices: [],
};

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
    updated_by: "ferris",
    created_by: "ferris",
  };
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
  const [loading, setLoading] = useState(mode === "edit");
  const [saving, setSaving] = useState(false);

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
        material_vendor_prices: item.material_vendor_prices ?? [],
      });
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

  const currentPriceSummary = useMemo(() => {
    return (form.material_vendor_prices ?? []).map((row) => ({
      id: row.id,
      vendorName: row.vendor?.name ?? "Unknown vendor",
      price: row.price,
      price_basis: row.price_basis,
    }));
  }, [form.material_vendor_prices]);

  function updateField<K extends keyof MaterialDetail>(key: K, value: MaterialDetail[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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
        body: JSON.stringify({ active: !form.active, updated_by: "ferris" }),
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
        <textarea
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          placeholder="Notes"
          className="min-h-28 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <div className="rounded-lg border border-border p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Current Vendor Prices</h2>
            <p className="text-xs text-muted-foreground">Read-only in this slice. Editing vendor price rows lands next.</p>
          </div>
          <Badge variant={form.active ? "default" : "outline"}>{form.active ? "Active" : "Inactive"}</Badge>
        </div>
        {currentPriceSummary.length === 0 ? (
          <p className="text-sm text-muted-foreground">No current vendor prices on this record yet.</p>
        ) : (
          <div className="space-y-2">
            {currentPriceSummary.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span>{row.vendorName}</span>
                <span className="text-muted-foreground">
                  ${row.price.toFixed(2)}{row.price_basis ? ` / ${row.price_basis}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
