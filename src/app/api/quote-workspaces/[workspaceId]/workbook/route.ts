import { createBlankQuoteV27 } from '@/lib/quote-v27-template';
import { NextResponse } from 'next/server';
import { requireQuoteProductWorkspaceAccess } from '@/lib/ada-server';
import { canPerformQuoteAction } from '@/lib/quote-permissions';
import { calculateQuoteV27 } from '@/lib/quote-v27';
import { parseQuoteV27 } from '@/lib/quote-v27-validation';
import fonroche from '@/data/quote-v27-fonroche.json';

export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ workspaceId: string }> };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function GET(request: Request, { params }: Context) {
  const { workspaceId } = await params;
  if (!validId(workspaceId)) return json({ error: 'Invalid workspace ID.' }, 400);
  const access = await requireQuoteProductWorkspaceAccess(workspaceId);
  if (!access.ok) return access.response;
  const canEdit = access.workspaceLifecycle !== 'archived' && canPerformQuoteAction(access.quoteActor, 'edit_draft');
  const search = new URL(request.url).searchParams;
  const template = search.get('template');
  if (template) {
    if (!['fonroche', 'blank'].includes(template)) return json({ error: 'Unknown template.' }, 400);
    const document = template === 'blank' ? createBlankQuoteV27() : parseQuoteV27(fonroche);
    return json({ document, canEdit });
  }
  const history = await access.actorSupabase.from('quote_workbook_revisions')
    .select('revision, created_at, created_by_email').eq('workspace_id', workspaceId)
    .order('revision', { ascending: false }).limit(20);
  if (history.error) return json({ error: 'Workbook history could not load.' }, 500);
  const latestVersion = history.data?.[0]?.revision ?? 0;
  const requested = search.get('revision');
  const version = requested === null ? latestVersion : Number(requested);
  if (!Number.isSafeInteger(version) || version < 0 || (requested !== null && version === 0)) return json({ error: 'Invalid revision.' }, 400);
  if (!version) return json({ document: null, version: 0, latestVersion, history: [], canEdit });
  const result = await access.actorSupabase.from('quote_workbook_revisions').select('document, revision, created_at')
    .eq('workspace_id', workspaceId).eq('revision', version).maybeSingle();
  if (result.error) return json({ error: 'Workbook could not load.' }, 500);
  if (!result.data) return json({ error: 'Workbook revision not found.' }, 404);
  try {
    const document = parseQuoteV27(result.data.document);
    return json({ document, version, latestVersion, history: history.data, canEdit, calculation: calculateQuoteV27(document) });
  } catch {
    return json({ error: 'This saved workbook is invalid. Its history has been preserved.' }, 422);
  }
}

export async function POST(request: Request, { params }: Context) {
  const { workspaceId } = await params;
  if (!validId(workspaceId)) return json({ error: 'Invalid workspace ID.' }, 400);
  const access = await requireQuoteProductWorkspaceAccess(workspaceId, 'edit_draft');
  if (!access.ok) return access.response;
  let document, expectedVersion: number;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_900_000) return json({ error: 'Workbook exceeds the save size limit.' }, 413);
    const body = JSON.parse(raw);
    expectedVersion = body.expectedVersion;
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= 2147483647) throw new Error('Invalid expected revision.');
    document = parseQuoteV27(body.document);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid workbook.' }, 400);
  }
  const calculation = calculateQuoteV27(document);
  const result = await access.actorSupabase.from('quote_workbook_revisions').insert({
    workspace_id: workspaceId, revision: expectedVersion + 1, document,
    engine_version: 'v27-1', created_by: access.actorId, created_by_email: access.actorEmail,
  }).select('revision, created_at').single();
  if (result.error) {
    if (['PT409', '23505'].includes(result.error.code)) return json({ error: 'A newer revision was saved. Your edits are still here. Download them before reloading the latest revision.' }, 409);
    if (result.error.code === '42501') return json({ error: 'You no longer have permission to save this workbook.' }, 403);
    return json({ error: 'Workbook could not be saved. Your edits are still here.' }, 500);
  }
  return json({ version: result.data.revision, savedAt: result.data.created_at, calculation }, 201);
}
