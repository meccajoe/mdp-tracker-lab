import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { isMissionControlAllowedEmail } from '@/lib/mission-control-access';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function requireMissionControlViewer() {
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabaseAuth.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }

  const actorEmail = user.email.toLowerCase();
  if (!isMissionControlAllowedEmail(actorEmail)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Mission Control is visible to Joe only.' }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    actorEmail,
  };
}
