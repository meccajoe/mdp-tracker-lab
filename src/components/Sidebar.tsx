"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { adaFetch } from "@/lib/ada-client";
import { PM_NAMES } from "@/lib/types";
import { canSeeTeamBonuses } from "@/lib/bonus-access";

import { isMissionControlAllowedEmail } from "@/lib/mission-control-access";
import { useAdminView } from "@/components/admin-view-provider";
import UserMenu from "@/components/UserMenu";
import ThemeToggle from "@/components/ThemeToggle";
import { IssueQuickLogDialog } from "@/components/issue-quick-log-dialog";

const ChevronDown = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronRight = () => (
  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

function NavLink({ href, label, icon, collapsed, exact }: {
  href: string; label: string; icon: React.ReactNode; collapsed: boolean; exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors
        ${active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}
        ${collapsed ? "justify-center" : ""}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function SectionHeader({ label, open, onToggle, collapsed }: {
  label: string; open: boolean; onToggle: () => void; collapsed: boolean;
}) {
  if (collapsed) return null;
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full px-2.5 pt-4 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
    >
      <span>{label}</span>
      {open ? <ChevronDown /> : <ChevronRight />}
    </button>
  );
}

export default function Sidebar({
  variant = "desktop",
  onNavigate,
}: {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { actualIsAdmin, effectiveIsAdmin, previewNonAdmin, setActualIsAdmin, togglePreviewNonAdmin } = useAdminView();
  const [collapsed, setCollapsed] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [isProduction, setIsProduction] = useState(false);
  const [pmInitials, setPmInitials] = useState<string | null>(null);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePMs, setActivePMs] = useState<string[]>([]);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [hasQuoteAccess, setHasQuoteAccess] = useState(false);

  useEffect(() => {
    function syncResponsiveCollapse() {
      if (variant === "desktop") {
        setCollapsed(window.innerWidth < 1500);
      } else {
        setCollapsed(false);
      }
    }

    syncResponsiveCollapse();
    window.addEventListener("resize", syncResponsiveCollapse);

    async function loadRole(email: string) {
      const normalizedEmail = email.toLowerCase();
      setActorEmail(normalizedEmail);
      const [{ data }, quoteAccessResponse] = await Promise.all([
        supabase.from("user_roles").select("role, pm_initials").eq("email", normalizedEmail).single(),
        adaFetch("/api/quotes/access").catch(() => null),
      ]);
      const r = data?.role ?? null;
      setRole(r);
      setActualIsAdmin(r === "admin");
      setIsProduction(r === "production");
      setPmInitials(data?.pm_initials ?? null);
      setHasQuoteAccess(Boolean(quoteAccessResponse?.ok));
    }
    // Load PMs eligible for bonus surfaces (role = pm)
    supabase.from("user_roles").select("pm_initials, role").eq("role", "pm").not("pm_initials", "is", null)
      .then(({ data }) => { if (data) setActivePMs(data.map((r) => r.pm_initials as string).sort()); });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) loadRole(session.user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) loadRole(session.user.email);
      else { setActualIsAdmin(false); setPmInitials(null); setActorEmail(null); setHasQuoteAccess(false); }
    });
    return () => {
      window.removeEventListener("resize", syncResponsiveCollapse);
      subscription.unsubscribe();
    };
  }, [setActualIsAdmin, variant]);

  // Auto-open admin sections if on an admin page
  useEffect(() => {
    if (pathname.startsWith("/admin/reports") || pathname.startsWith("/admin/portfolios") || pathname.startsWith("/admin/mission-control")) setReportsOpen(true);
    if (pathname.startsWith("/admin")) setSettingsOpen(true);
  }, [pathname]);

  if (pathname === "/login") return null;

  const dashIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
  const projectsIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
  const bonusIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  const purchasingIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>;
  const usersIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
  const dataEntryIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 18h18M3 6h18M7 3v18" /></svg>;
  const expensesIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" /></svg>;
  const reportIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m3 7H6a2 2 0 01-2-2V5a2 2 0 012-2h7.586a1 1 0 01.707.293l3.414 3.414A1 1 0 0118 7.414V19a2 2 0 01-2 2z" /></svg>;
  const flagIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v18m0-10h12l-2 3 2 3H5" /></svg>;
  const missionControlIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" /></svg>;
  const portfolioIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>;
  const lineItemIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
  const materialsIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15l12-12 6 6-12 12H3v-6zM13 5l6 6M9 9l2 2m-5 1l2 2m-1 3l2 2" /></svg>;
  const quoteIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 3h7l5 5v13H7a2 2 0 01-2-2V5a2 2 0 012-2zm7 0v5h5M9 13h6M9 17h4" /></svg>;
  const reconcileIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>;
  const settingsIcon = <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

  const canSeeMissionControl = isMissionControlAllowedEmail(actorEmail);
  const canLogIssues = role === "admin" || role === "pm" || role === "production";

  const isMobile = variant === "mobile";

  return (
    <aside
      onClickCapture={(event) => {
        if (onNavigate && (event.target as HTMLElement).closest("a")) onNavigate();
      }}
      className={`flex shrink-0 flex-col border-r border-border bg-background ${isMobile ? "h-full w-full" : `sticky top-0 h-dvh transition-all duration-200 ease-in-out ${collapsed ? "w-16" : "w-52"}`}`}
    >
      {/* Logo */}
      <div className="flex items-center h-14 px-3 border-b border-border gap-2.5 overflow-hidden">
        <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
          <Image src="/mdp-logo.jpg" alt="MDP" width={28} height={28} className="object-contain w-full h-full" />
        </div>
        {!collapsed && <span className="text-sm font-semibold whitespace-nowrap text-foreground tracking-wide">Project Tracker</span>}
      </div>

      {/* Collapse toggle */}
      {!isMobile ? (
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border-b border-border ${collapsed ? "justify-center" : "justify-end"}`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
            : <><span>Collapse</span><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg></>
          }
        </button>
      ) : null}

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {/* Core nav */}
        <NavLink href="/" label="Dashboard" icon={dashIcon} collapsed={collapsed} exact />
        <NavLink href="/projects" label="Projects" icon={projectsIcon} collapsed={collapsed} exact={false} />
        {hasQuoteAccess && <NavLink href="/quotes" label="Quotes" icon={quoteIcon} collapsed={collapsed} exact={false} />}
        {hasQuoteAccess && <NavLink href="/capacity" label="Capacity" icon={projectsIcon} collapsed={collapsed} exact={false} />}
        <NavLink href="/expenses" label="Expenses" icon={expensesIcon} collapsed={collapsed} exact={false} />
        <NavLink href="/line-item-search" label="Search Items" icon={lineItemIcon} collapsed={collapsed} exact={false} />
        <NavLink href="/admin/materials" label="Materials" icon={materialsIcon} collapsed={collapsed} exact={false} />
        {canLogIssues && <IssueQuickLogDialog collapsed={collapsed} />}

        {/* Team Bonuses — admin only for now */}
        {canSeeTeamBonuses(role) && (
          <>
            <SectionHeader label="Team Bonuses" open={bonusOpen} onToggle={() => setBonusOpen(!bonusOpen)} collapsed={collapsed} />
            {collapsed ? (
              <NavLink
                href={effectiveIsAdmin ? `/pm` : `/pm/${pmInitials ?? ""}`}
                label="Bonuses"
                icon={bonusIcon}
                collapsed={true}
                exact={false}
              />
            ) : bonusOpen && (
              effectiveIsAdmin
                ? (
                  <>
                    <NavLink href="/pm" label="Team Summary" icon={bonusIcon} collapsed={false} exact />
                    {activePMs.map((init) => (
                      <NavLink key={init} href={`/pm/${init}`} label={PM_NAMES[init] ?? init} icon={bonusIcon} collapsed={false} exact={false} />
                    ))}
                  </>
                )
                : pmInitials && (
                    <NavLink href={`/pm/${pmInitials}`} label="My Bonus" icon={bonusIcon} collapsed={false} exact={false} />
                  )
            )}
          </>
        )}

        {/* Purchasing — production role sees vendors only */}
        {isProduction && (
          <NavLink href="/admin/vendors" label="Purchasing" icon={purchasingIcon} collapsed={collapsed} exact={false} />
        )}

        {/* Reports section — admin only */}
        {effectiveIsAdmin && (
          <>
            <SectionHeader label="Reports" open={reportsOpen} onToggle={() => setReportsOpen(!reportsOpen)} collapsed={collapsed} />
            {collapsed ? (
              <NavLink href={canSeeMissionControl ? "/admin/mission-control" : "/admin/reports/wip"} label={canSeeMissionControl ? "Mission Control" : "WIP"} icon={canSeeMissionControl ? missionControlIcon : reportIcon} collapsed={true} exact={false} />
            ) : reportsOpen && (
              <>
                <NavLink href="/admin/reports/wip" label="WIP" icon={reportIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/labor-reconciliation" label="Labor Reconciliation" icon={reconcileIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/issues" label="Production Issues" icon={flagIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/pricing-intelligence" label="Pricing Intelligence" icon={lineItemIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/portfolios" label="Portfolio Center" icon={portfolioIcon} collapsed={false} exact={false} />
                {canSeeMissionControl && <NavLink href="/admin/mission-control" label="Mission Control" icon={missionControlIcon} collapsed={false} exact={false} />}
              </>
            )}
          </>
        )}

        {/* Settings section — admin only */}
        {effectiveIsAdmin && (
          <>
            <SectionHeader label="Settings" open={settingsOpen} onToggle={() => setSettingsOpen(!settingsOpen)} collapsed={collapsed} />
            {collapsed ? (
              <NavLink href="/admin/vendors" label="Settings" icon={settingsIcon} collapsed={true} exact={false} />
            ) : settingsOpen && (
              <>
                <NavLink href="/admin/data-entry" label="Data Entry" icon={dataEntryIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/vendors" label="Purchasing" icon={purchasingIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/users" label="Users" icon={usersIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/settings" label="Budgets" icon={settingsIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/reconciliation" label="Reconciliation" icon={reconcileIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/formula-rebaseline-preview" label="Formula Review" icon={reconcileIcon} collapsed={false} exact={false} />
                <NavLink href="/admin/flags" label="Flags" icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 00-2-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>} collapsed={false} exact={false} />
              </>
            )}
          </>
        )}

        {actualIsAdmin && !collapsed && (
          <div className="px-2.5 pt-4 pb-1">
            <button
              onClick={togglePreviewNonAdmin}
              className="w-full rounded-lg border border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <div className="flex items-center justify-between gap-2">
                <span>View Mode</span>
                <span className="text-[10px] uppercase tracking-wide">
                  {previewNonAdmin ? "Non-admin" : "Admin"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {previewNonAdmin ? "Previewing PM/non-admin UI" : "Previewing full admin UI"}
              </p>
            </button>
          </div>
        )}
      </nav>

      {/* Theme toggle */}
      <div className="px-2 pb-2">
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* User */}
      <div className="border-t border-border p-2">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
