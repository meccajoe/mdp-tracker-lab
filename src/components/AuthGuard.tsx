"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session && pathname !== "/login") {
        router.replace("/login");
      } else {
        setChecked(true);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        router.replace("/login");
      }
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        // Enforce meccadesign.com domain
        if (!session.user.email?.endsWith("@meccadesign.com")) {
          supabase.auth.signOut();
          router.replace("/login");
          return;
        }
        if (pathname === "/login") {
          router.replace("/");
        }
        setChecked(true);
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  // On login page, always render
  if (pathname === "/login") return <>{children}</>;

  // On protected pages, wait until auth check passes
  if (!checked) return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50">
      <p className="text-gray-400 text-sm">Loading...</p>
    </div>
  );

  return <>{children}</>;
}
