"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { PM_NAMES } from "@/lib/types";
import UserMenu from "@/components/UserMenu";
import ThemeToggle from "@/components/ThemeToggle";

const bonusIcon = (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const navItems = [
  {
    href: "/",
    label: "Dashboard",
    exact: true,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: "/projects",
    label: "Projects",
    exact: false,
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
];

interface BonusNavItem {
  href: string;
  label: string;
  exact: boolean;
  icon: React.ReactNode;
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [bonusItems, setBonusItems] = useState<BonusNavItem[]>([]);

  useEffect(() => {
    async function loadRole(email: string) {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role, pm_initials")
        .eq("email", email.toLowerCase())
        .single();

      if (roleData?.role === "admin") {
        const items: BonusNavItem[] = Object.keys(PM_NAMES).map((init) => ({
          href: `/pm/${init}`,
          label: PM_NAMES[init],
          exact: false,
          icon: bonusIcon,
        }));
        setBonusItems(items);
      } else if (roleData?.role === "pm" && roleData.pm_initials) {
        setBonusItems([{
          href: `/pm/${roleData.pm_initials}`,
          label: "My Bonus",
          exact: false,
          icon: bonusIcon,
        }]);
      }
    }

    // Load on mount from existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) loadRole(session.user.email);
    });

    // Also reload when auth state changes (e.g. after OAuth redirect)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) loadRole(session.user.email);
      else setBonusItems([]);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (pathname === "/login") return null;

  const isAdmin = bonusItems.length > 1;

  return (
    <aside
      className={`
        flex flex-col h-screen sticky top-0 flex-shrink-0 transition-all duration-200 ease-in-out
        bg-background border-r border-border
        ${collapsed ? "w-16" : "w-56"}
      `}
    >
      {/* Logo + title */}
      <div className="flex items-center h-14 px-3 border-b border-border gap-2.5 overflow-hidden">
        <div className="w-7 h-7 rounded overflow-hidden flex-shrink-0">
          <Image src="/mdp-logo.jpg" alt="MDP" width={28} height={28} className="object-contain w-full h-full" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold whitespace-nowrap text-foreground tracking-wide">
            Project Tracker
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors
                ${active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }
                ${collapsed ? "justify-center" : ""}
              `}
            >
              <span className="flex-shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        {/* Bonus nav items */}
        {bonusItems.length > 0 && (
          <>
            {!collapsed && isAdmin && (
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-2.5 pt-4 pb-1">
                Team Bonuses
              </p>
            )}
            {bonusItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`
                    flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors
                    ${active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }
                    ${collapsed ? "justify-center" : ""}
                  `}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );
            })}
          </>
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
