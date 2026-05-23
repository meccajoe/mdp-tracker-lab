"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { resolveEffectiveAdminView } from "@/lib/admin-view";

const STORAGE_KEY = "mdp-preview-non-admin";

type AdminViewContextValue = {
  actualIsAdmin: boolean;
  previewNonAdmin: boolean;
  effectiveIsAdmin: boolean;
  setActualIsAdmin: (value: boolean) => void;
  togglePreviewNonAdmin: () => void;
  resetPreview: () => void;
};

const AdminViewContext = createContext<AdminViewContextValue | null>(null);

export function AdminViewProvider({ children }: { children: React.ReactNode }) {
  const [actualIsAdmin, setActualIsAdmin] = useState(false);
  const [previewNonAdmin, setPreviewNonAdmin] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setPreviewNonAdmin(stored === "1");
  }, []);

  useEffect(() => {
    if (!actualIsAdmin) {
      setPreviewNonAdmin(false);
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [actualIsAdmin]);

  const value = useMemo<AdminViewContextValue>(() => ({
    actualIsAdmin,
    previewNonAdmin,
    effectiveIsAdmin: resolveEffectiveAdminView(actualIsAdmin, previewNonAdmin),
    setActualIsAdmin,
    togglePreviewNonAdmin: () => {
      if (!actualIsAdmin) return;
      setPreviewNonAdmin((current) => {
        const next = !current;
        if (next) window.localStorage.setItem(STORAGE_KEY, "1");
        else window.localStorage.removeItem(STORAGE_KEY);
        return next;
      });
    },
    resetPreview: () => {
      setPreviewNonAdmin(false);
      window.localStorage.removeItem(STORAGE_KEY);
    },
  }), [actualIsAdmin, previewNonAdmin]);

  return <AdminViewContext.Provider value={value}>{children}</AdminViewContext.Provider>;
}

export function useAdminView() {
  const context = useContext(AdminViewContext);
  if (!context) {
    throw new Error("useAdminView must be used within an AdminViewProvider");
  }
  return context;
}
