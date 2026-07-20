"use client";

import { useEffect, useState } from "react";

import { ProjectOperationsBoard } from "@/components/project-operations-board";
import { supabase } from "@/lib/supabase";

export default function AdminOperationsPage() {
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
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Operations Board</h1>
        <p className="text-sm text-muted-foreground">
          Mecca-wide project control board for active work, manual follow-up, blockers, and lookback history.
        </p>
      </div>
      <ProjectOperationsBoard />
    </div>
  );
}
