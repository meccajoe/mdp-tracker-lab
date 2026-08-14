"use client";

import { useEffect, useState } from "react";

import { isAdaAllowedEmail } from "@/lib/ada-access";
import { supabase } from "@/lib/supabase";

export function AdaAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setState(isAdaAllowedEmail(session?.user.email) ? "allowed" : "denied");
    });
    return () => {
      active = false;
    };
  }, []);

  if (state === "checking") {
    return <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground">Loading Ada…</div>;
  }

  if (state === "denied") {
    return <div className="flex min-h-[50dvh] items-center justify-center p-6 text-center"><div><h1 className="text-xl font-semibold">Ada is private</h1><p className="mt-2 text-sm text-muted-foreground">This workspace is currently visible to Joe only.</p></div></div>;
  }

  return <>{children}</>;
}
