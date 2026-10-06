import { NextResponse } from 'next/server';
import { requireQuoteProductAccess } from '@/lib/ada-server';
import { calculateQuoteV27 } from '@/lib/quote-v27';
import { parseQuoteV27 } from '@/lib/quote-v27-validation';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ itemId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function GET(request: Request, { params }: Context) {
  const { itemId } = await params;
  if (!validId(itemId)) return json({ error: 'Invalid item ID.' }, 400);
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return json({error:'Prequote items are available only in Tracker Lab.'},403);
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  const capability=await access.actorSupabase.from('quote_user_capabilities').select('capability').eq('capability','create_workspace').is('revoked_at',null).limit(1);
  const canEdit=!capability.error&&Boolean(capability.data?.length);
  const search = new URL(request.url).searchParams;
  const history = await access.actorSupabase.from('lab_prequote_revisions')
    .select('revision, created_at, created_by_email').eq('item_id', itemId)
    .order('revision', { ascending: false }).limit(20);
  if (history.error) return json({ error: 'Reusable item history could not load.' }, 500);
  const latestVersion = history.data?.[0]?.revision ?? 0;
  const requested = search.get('revision');
  const version = requested === null ? latestVersion : Number(requested);
  if (!Number.isSafeInteger(version) || version < 0 || (requested !== null && version === 0)) return json({ error: 'Invalid revision.' }, 400);
  if (!version) return json({error:'Reusable item not found.'},404);
  const result = await access.actorSupabase.from('lab_prequote_revisions').select('document, revision, created_at')
    .eq('item_id', itemId).eq('revision', version).maybeSingle();
  if (result.error) return json({ error: 'Reusable item could not load.' }, 500);
  if (!result.data) return json({ error: 'Reusable item revision not found.' }, 404);
  try {
    const document = parseQuoteV27(result.data.document);
    return json({ document, version, latestVersion, history: history.data, canEdit, calculation: calculateQuoteV27(document) });
  } catch {
    return json({ error: 'This saved reusable item is invalid. Its history has been preserved.' }, 422);
  }
}

export async function POST(request: Request, { params }: Context) {
  const { itemId } = await params;
  if (!validId(itemId)) return json({ error: 'Invalid item ID.' }, 400);
  if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return json({error:'Prequote items are available only in Tracker Lab.'},403);
  const access = await requireQuoteProductAccess();
  if (!access.ok) return access.response;
  let document, expectedVersion: number;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_900_000) return json({ error: 'Reusable item exceeds the save size limit.' }, 413);
    const body = JSON.parse(raw);
    expectedVersion = body.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647) throw new Error('Invalid expected revision.');
    document = parseQuoteV27(body.document);
    if(document.lines.length!==1)throw new Error('A reusable item must contain exactly one quote item.');
    // Preserve unfinished/unassigned editor rows across saves.
    delete document.schedule;delete document.planning;delete document.reusableItemIds;delete document.catalogUsage;
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid reusable item.' }, 400);
  }
  const calculation = calculateQuoteV27(document);
  const result = await access.actorSupabase.from('lab_prequote_revisions').insert({
    item_id: itemId, revision: expectedVersion + 1, document,
    created_by: access.actorId, created_by_email: access.actorEmail,
  }).select('revision, created_at').single();
  if (result.error) {
    if (['PT409', '23505'].includes(result.error.code)) return json({ error: 'A newer revision was saved. Your edits are still here. Download them before reloading the latest revision.' }, 409);
    if (result.error.code === '42501') return json({ error: 'You no longer have permission to save this reusable item.' }, 403);
    return json({ error: 'Reusable item could not be saved. Your edits are still here.' }, 500);
  }
  return json({ version: result.data.revision, savedAt: result.data.created_at, calculation }, 201);
}
