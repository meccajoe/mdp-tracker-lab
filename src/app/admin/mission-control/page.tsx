"use client";

import { useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabase';
import { isMissionControlAllowedEmail } from '@/lib/mission-control-access';

export default function AdminMissionControlPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      const actorEmail = session?.user?.email?.toLowerCase() ?? null;
      setEmail(actorEmail);
      setAllowed(isMissionControlAllowedEmail(actorEmail));
      setLoading(false);
    }

    void load();
  }, []);

  const frameSrc = useMemo(() => '/admin/mission-control/bridge/?embed=1', []);

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">Loading Mission Control…</div>;
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Mission Control</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This surface is currently visible to Joe only.
          </p>
          {email ? <p className="mt-2 text-xs text-muted-foreground">Signed in as {email}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-6 -my-6 flex min-h-[calc(100vh-1.5rem)] flex-col bg-background xl:-mx-8">
      <div className="border-b border-border px-6 py-4 xl:px-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Mission Control</h1>
          <p className="text-sm text-muted-foreground">
            Joe-only dev-work board inside MDP Tracker.
          </p>
        </div>
      </div>
      <iframe
        title="MDP Mission Control"
        src={frameSrc}
        className="min-h-[calc(100vh-7rem)] w-full flex-1 border-0 bg-background"
      />
    </div>
  );
}
