"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { UserRoleRow, PM_NAMES } from "@/lib/types";

export interface PMOption {
  initials: string;
  fullName: string;
}

let cachedUsers: UserRoleRow[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function fetchUserRoles(): Promise<UserRoleRow[]> {
  if (cachedUsers && Date.now() - cacheTime < CACHE_TTL) return cachedUsers;
  const { data } = await supabase
    .from("user_roles")
    .select("email, role, pm_initials, full_name, show_in_filters")
    .order("full_name", { nullsFirst: false });
  cachedUsers = (data as UserRoleRow[]) ?? [];
  cacheTime = Date.now();
  return cachedUsers;
}

/** Resolve a PM initials string to a display name, preferring DB over hardcoded fallback */
export function resolvePMName(initials: string, users: UserRoleRow[]): string {
  if (!initials) return initials;
  const match = users.find((u) => u.pm_initials === initials);
  if (match?.full_name) return match.full_name;
  return PM_NAMES[initials] ?? initials;
}

/** Returns PMs that should appear in filters (show_in_filters = true) */
export function getActivePMs(users: UserRoleRow[]): PMOption[] {
  return users
    .filter((u) => u.show_in_filters && u.pm_initials)
    .map((u) => ({ initials: u.pm_initials!, fullName: u.full_name || PM_NAMES[u.pm_initials!] || u.pm_initials! }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** All PMs (for project assignment dropdowns) */
export function getAllPMs(users: UserRoleRow[]): PMOption[] {
  return users
    .filter((u) => (u.role === "pm" || u.role === "admin") && u.pm_initials)
    .map((u) => ({ initials: u.pm_initials!, fullName: u.full_name || PM_NAMES[u.pm_initials!] || u.pm_initials! }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function useUserRoles() {
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserRoles().then((u) => { setUsers(u); setLoading(false); });
  }, []);

  return { users, loading, activePMs: getActivePMs(users), allPMs: getAllPMs(users), resolveName: (initials: string) => resolvePMName(initials, users) };
}
