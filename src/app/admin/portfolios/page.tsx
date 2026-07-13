"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import { ProjectPortfolioManager } from "@/components/project-portfolio-manager";

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
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Portfolio Center</h1>
        <p className="text-sm text-muted-foreground">
          Create and manage portfolio digests, alerts, memberships, and monitor-specific project coverage outside of the individual project modal.
        </p>
      </div>
      <ProjectPortfolioManager />
    </div>
  );
}
