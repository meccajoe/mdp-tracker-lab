"use client";

import { useEffect, useState } from "react";

import { adaFetch } from "@/lib/ada-client";

export function QuoteAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    let active = true;
    adaFetch("/api/quotes/access")
      .then((response) => active && setState(response.ok ? "allowed" : "denied"))
      .catch(() => active && setState("denied"));
    return () => {
      active = false;
    };
  }, []);

  if (state === "checking") {
    return <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground">Loading quotes…</div>;
  }
  if (state === "denied") {
    return (
      <div className="flex min-h-[50dvh] items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold">Quote Workspace access required</h1>
          <p className="mt-2 text-sm text-muted-foreground">Ask a Tracker administrator to add you to a quote or enable quote creation.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
