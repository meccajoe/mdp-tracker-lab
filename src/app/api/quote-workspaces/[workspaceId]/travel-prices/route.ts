import { NextResponse } from 'next/server';
import { requireQuoteProductWorkspaceAccess } from '@/lib/ada-server';
import { LAB_PROJECT_REF } from '@/lib/lab-safety.mjs';
import { labTravelOffers, parseTravelSearch } from '@/lib/travel-price-research';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspaceId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: Request, { params }: Context) {
  const { workspaceId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(workspaceId))
    return json({ error: 'Invalid workspace ID.' }, 400);
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== `https://${LAB_PROJECT_REF}.supabase.co`)
    return json({ error: 'Sample travel lookup is available only in Tracker Lab.' }, 503);
  const access = await requireQuoteProductWorkspaceAccess(workspaceId, 'edit_draft');
  if (!access.ok) return access.response;
  let search;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 4096) return json({ error: 'Travel search is too large.' }, 413);
    search = parseTravelSearch(JSON.parse(raw));
    if (search.departureDate < new Date().toISOString().slice(0, 10))
      return json({ error: 'Departure date must be today or later.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid travel search.' }, 400);
  }
  return json({ search, offers: labTravelOffers(), searchedAt: new Date().toISOString(), sample: true });
}
