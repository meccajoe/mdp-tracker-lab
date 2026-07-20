import { NextRequest, NextResponse } from 'next/server';

import { requireMissionControlViewer } from '@/lib/mission-control-server';

const TARGET_BASE = 'http://127.0.0.1:3467';
const BRIDGE_BASE = '/admin/mission-control/bridge/';

async function proxy(request: NextRequest, pathSegments: string[] = []) {
  const access = await requireMissionControlViewer();
  if (!access.ok) return access.response;

  const upstreamPath = pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/';
  const upstreamUrl = new URL(upstreamPath, TARGET_BASE);
  upstreamUrl.search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.text();
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch {
    return NextResponse.json({ error: 'Mission Control upstream unavailable' }, { status: 502 });
  }

  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType?.includes('text/html')) {
    let html = await upstream.text();
    const embedMode = request.nextUrl.searchParams.get('embed') === '1';

    if (!html.includes('<base ')) {
      html = html.replace('<head>', `<head><base href="${BRIDGE_BASE}">`);
    }

    html = html.replace(
      '</head>',
      `<script>window.__MC_BASE__ = ${JSON.stringify(BRIDGE_BASE)};${embedMode ? 'window.__MC_EMBED__ = true;' : ''}</script></head>`,
    );

    if (embedMode) {
      html = html.replace('<body>', '<body class="embed-mode">');
    }

    return new NextResponse(html, {
      status: upstream.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const responseHeaders = new Headers();
  if (upstreamContentType) responseHeaders.set('content-type', upstreamContentType);
  responseHeaders.set('cache-control', 'no-store');

  return new NextResponse(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path ?? []);
}
