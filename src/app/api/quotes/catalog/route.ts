import { NextResponse } from 'next/server';
import { requireQuoteProductAccess } from '@/lib/ada-server';
import { fetchLiveCatalog } from '@/lib/quote-live-catalog';
export const dynamic = 'force-dynamic';
export async function GET() {
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  const headers = {'Cache-Control':'private, no-store'};
  try { return NextResponse.json(await fetchLiveCatalog(), {headers}); }
  catch { return NextResponse.json({error:'Live Materials DB could not refresh. Your saved quote prices are unchanged. Retry when the sheet is available.'}, {status:502,headers}); }
}
