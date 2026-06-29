"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VendorOption {
  id: string;
  name: string;
}

interface MaterialVendorPrice {
  id: string;
  vendor_id: string | null;
  price: number;
  price_basis: string | null;
  is_current: boolean;
  vendor: { id: string; name: string } | null;
}

interface MaterialRow {
  id: string;
  canonical_name: string;
  category: string;
  dimensions: string | null;
  thickness_text: string | null;
  default_price: number | null;
  active: boolean;
  default_vendor: { id: string; name: string } | null;
  material_vendor_prices: MaterialVendorPrice[];
  current_price_count: number;
}

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function MaterialsClient() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [vendorId, setVendorId] = useState("all");
  const [active, setActive] = useState("active");
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [items, setItems] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVendors = useCallback(async () => {
    const { data, error: vendorError } = await supabase
      .from("vendors")
      .select("id, name")
      .eq("active", true)
      .order("name");

    if (vendorError) {
      console.error("[materials/vendors]", vendorError);
      return;
    }

    setVendors((data ?? []) as VendorOption[]);
  }, []);

  const fetchMaterials = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category !== "all") params.set("category", category);
      if (vendorId !== "all") params.set("vendor_id", vendorId);
      if (active !== "all") params.set("active", active);
      params.set("limit", "100");
      params.set("sort", "canonical_name");
      params.set("order", "asc");

      const response = await fetch(`/api/materials/search?${params.toString()}`);
      if (!response.ok) throw new Error(`Search failed: ${response.status}`);

      const payload = (await response.json()) as { items: MaterialRow[] };
      setItems(payload.items ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [active, category, query, vendorId]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  const categories = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.category).filter(Boolean))).sort();
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Materials</h1>
          <p className="text-sm text-muted-foreground">Search by material, vendor, size, and current catalog status.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/materials/import" className={buttonVariants({ variant: "outline" })}>
            Import Workbook
          </Link>
          <Link href="/admin/materials/new" className={buttonVariants({ variant: "default" })}>
            Add Material
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search materials"
          className="md:col-span-1"
        />

        <Select value={category} onValueChange={(value) => setCategory(value ?? "all")}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={vendorId} onValueChange={(value) => setVendorId(value ?? "all")}>
          <SelectTrigger>
            <SelectValue placeholder="Vendor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Vendors</SelectItem>
            {vendors.map((vendor) => (
              <SelectItem key={vendor.id} value={vendor.id}>{vendor.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={active} onValueChange={(value) => setActive(value ?? "all")}>
          <SelectTrigger>
            <SelectValue placeholder="Active" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Material</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Default Vendor</TableHead>
              <TableHead className="text-right">Default Price</TableHead>
              <TableHead className="text-right">Current Vendor Prices</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading materials…</TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-red-600">{error}</TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No materials found for the current filters.</TableCell>
              </TableRow>
            ) : items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium">{item.canonical_name}</div>
                  {(item.thickness_text || item.dimensions) && (
                    <div className="text-xs text-muted-foreground">{[item.thickness_text, item.dimensions].filter(Boolean).join(" • ")}</div>
                  )}
                </TableCell>
                <TableCell>{item.category}</TableCell>
                <TableCell>{item.dimensions ?? "—"}</TableCell>
                <TableCell>{item.default_vendor?.name ?? "—"}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.default_price)}</TableCell>
                <TableCell className="text-right">{item.current_price_count}</TableCell>
                <TableCell>
                  <Badge variant={item.active ? "default" : "outline"}>{item.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/materials/${item.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Edit
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
