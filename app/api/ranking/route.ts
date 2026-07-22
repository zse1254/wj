import { NextRequest } from 'next/server'
import { DENO_PROXIES } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const rid = request.nextUrl.searchParams.get('rid') || '0'
  for (const proxyUrl of DENO_PROXIES) {
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ranking', rid: parseInt(rid, 10) }),
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text()
      let data: any = {}
      try { data = JSON.parse(text) } catch { data = { error: text } }
      if (!res.ok || !data.success) continue
      return Response.json({ success: true, data: data.data })
    } catch { continue }
  }

  return Response.json({ success: false, error: '排行服务不可用' }, { status: 502 })
}