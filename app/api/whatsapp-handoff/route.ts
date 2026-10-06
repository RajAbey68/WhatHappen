import { NextRequest, NextResponse } from 'next/server'
import { PROJECT_TOKEN_HEADER, isAuthBypassed, isValidProjectId, requireProjectAccess } from '@/lib/api-auth'

const WHATTODO_BASE = (process.env.WHATTODO_API_URL || 'http://127.0.0.1:4000').replace(/\/$/, '')

function authed(request: NextRequest) {
  return (
    isAuthBypassed() ||
    request.headers.has(PROJECT_TOKEN_HEADER) ||
    request.headers.get('authorization')?.startsWith('Bearer ')
  )
}

async function whatToDo(path: string, method: 'GET' | 'PUT') {
  const res = await fetch(`${WHATTODO_BASE}${path}`, { method });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/**
 * GET ?projectId=&sessionId= — who holds the number: WhatToDo session status.
 */
export async function GET(request: NextRequest) {
  const q = new URL(request.url).searchParams;
  const projectId = q.get('projectId') ?? '';
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  try {
    const { status, body } = await whatToDo('/api/whatsapp/sessions', 'GET');
    if (status !== 200) return NextResponse.json({ error: 'WhatToDo unreachable', detail: body }, { status: 502 });
    const sessions = (body.sessions ?? []) as Array<{ id: string; phone: string; status: string }>;
    const sid = q.get('sessionId');
    const match = sid ? sessions.find((s) => s.id === sid) : sessions.find((s) => s.status === 'open') ?? sessions[0];
    return NextResponse.json({
      holder: !match || match.status === 'paused' ? 'free' : 'whattodo',
      session: match ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'WhatToDo unreachable' }, { status: 502 })
  }
}

/**
 * POST { projectId, action: 'takeover'|'release', sessionId? } — handoff toggle.
 * takeover: pause WhatToDo session (auth kept, no QR needed to resume).
 * release: resume WhatToDo session with stored auth.
 */
export async function POST(request: NextRequest) {
  if (!authed(request)) {
    return NextResponse.json({ error: 'Unauthorized: missing project access token' }, { status: 401 })
  }
  let body: any
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { projectId, action, sessionId } = body ?? {}
  if (!isValidProjectId(projectId)) {
    return NextResponse.json({ error: 'Invalid projectId' }, { status: 400 })
  }
  if (!['takeover', 'release'].includes(action)) {
    return NextResponse.json({ error: "action must be 'takeover'|'release'" }, { status: 400 })
  }
  const denied = await requireProjectAccess(request, projectId)
  if (denied) return denied

  const id = typeof sessionId === 'string' && sessionId ? sessionId : 'session_94711730345';
  const verb = action === 'takeover' ? 'pause' : 'resume';
  try {
    const { status, body: res } = await whatToDo(`/api/whatsapp/sessions/${encodeURIComponent(id)}/${verb}`, 'PUT');
    if (status !== 200) return NextResponse.json({ error: `WhatToDo ${verb} failed`, detail: res }, { status: 502 });
    return NextResponse.json({ ok: true, action, sessionId: id, holder: action === 'takeover' ? 'free' : 'whattodo' });
  } catch {
    return NextResponse.json({ error: 'WhatToDo unreachable' }, { status: 502 })
  }
}
