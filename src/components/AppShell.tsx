"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";

function pageLabel(pathname: string) {
  if (pathname === "/") return "Dashboard";
  if (pathname.startsWith("/projects")) return "Projects";
  if (pathname.startsWith("/expenses")) return "Expenses";
  if (pathname.startsWith("/line-item-search")) return "Search Items";
  if (pathname.startsWith("/admin/mission-control")) return "Mission Control";
  if (pathname.startsWith("/admin/portfolios")) return "Portfolio Center";
  if (pathname.startsWith("/admin/reports/wip")) return "WIP";
  if (pathname.startsWith("/admin/labor-reconciliation")) return "Labor Reconciliation";
  if (pathname.startsWith("/admin/materials")) return "Materials";
  if (pathname.startsWith("/admin")) return "Administration";
  return "Project Tracker";
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdaWorkspace = pathname.startsWith("/ada");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileNavOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  if (pathname === "/login") {
    return <main className="min-h-dvh w-full bg-background">{children}</main>;
  }

  if (isAdaWorkspace) {
    return <main data-slot="ada-workspace-shell" className="h-dvh w-full overflow-hidden bg-background">{children}</main>;
  }

  return (
    <div className="min-h-dvh w-full max-w-full overflow-x-clip bg-background">
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur xl:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(true)}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-accent"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">MDP Tracker</div>
          <div className="truncate text-xs text-muted-foreground">{pageLabel(pathname)}</div>
        </div>
      </header>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Tracker navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/35"
          />
          <div className="relative h-full w-72 max-w-[85vw] bg-background shadow-2xl">
            <Sidebar variant="mobile" onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      ) : null}

      <div className="flex min-h-dvh min-w-0 w-full max-w-full">
        <div className="hidden xl:block">
          <Sidebar />
        </div>
        <main className="min-w-0 w-full max-w-full flex-1 overflow-x-clip overflow-y-auto pt-14 xl:pt-0">
          <div className="w-full min-w-0 max-w-[1800px] px-4 py-4 sm:px-6 sm:py-6 xl:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
