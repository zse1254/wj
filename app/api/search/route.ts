import { NextRequest } from 'next/server'
import { DENO_PROXIES, fixVideoItems } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')
  if (!q || q.length < 2) {
    return Response.json({ success: false, error: '请输入至少2个字符' }, { status: 400 })
  }

  for (const proxyUrl of DENO_PROXIES) {
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'search', keyword: q }),
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text()
      let data: any = {}
      try { data = JSON.parse(text) } catch { data = { error: text } }
      if (!res.ok || !data.success) continue
      const fixed = { ...data.data, items: fixVideoItems(data.data.items || []) }
      return Response.json({ success: true, data: fixed })
    } catch { continue }
  }

  return Response.json({ success: false, error: '搜索服务不可用' }, { status: 502 })
}