import { NextRequest } from 'next/server'
import { DENO_PROXIES } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  for (const proxyUrl of DENO_PROXIES) {
    try {
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rcmd' }),
        signal: AbortSignal.timeout(8000),
      })
      const text = await res.text()
      let data: any = {}
      try { data = JSON.parse(text) } catch { data = { error: text } }
      if (!res.ok || !data.success) continue
      return Response.json({ success: true, data: data.data })
    } catch { continue }
  }

  return Response.json({ success: false, error: '推荐服务不可用' }, { status: 502 })
}