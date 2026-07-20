"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { ProjectPortfolioManager } from "@/components/project-portfolio-manager";
import { PageShell } from "@/components/ui/page-shell";

export default function AdminPortfoliosPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.email) {
        setLoading(false);
        return;
      }
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("email", session.user.email.toLowerCase())
        .maybeSingle();
      setIsAdmin(roleData?.role === "admin");
      setLoading(false);
    }

    void load();
  }, []);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading...</div>;
  }

  if (!isAdmin) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Admin access required</div>;
  }

  return (
    <PageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Portfolio Center</h1>
        <p className="text-sm text-muted-foreground">
          Browse PM portfolios, tune automation, and launch digests or alerts without the page getting in the way.
        </p>
      </div>
      <ProjectPortfolioManager />
    </PageShell>
  );
}
