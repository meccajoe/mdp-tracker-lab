"use client";

import { useEffect, useState } from "react";

export function AdaAccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"checking" | "allowed" | "denied">("checking");
  useEffect(() => {
    let active = true;
    fetch("/api/ada/access").then((response) => active && setState(response.ok ? "allowed" : "denied")).catch(() => active && setState("denied"));
    return () => { active = false; };
  }, []);
  if (state === "checking") return <div className="flex min-h-[50dvh] items-center justify-center text-sm text-muted-foreground">Loading Ada…</div>;
  if (state === "denied") return <div className="flex min-h-[50dvh] items-center justify-center p-6 text-center"><div><h1 className="text-xl font-semibold">Ada access required</h1><p className="mt-2 text-sm text-muted-foreground">Ask an Ada administrator to enable your workspace.</p></div></div>;
  return <>{children}</>;
}
