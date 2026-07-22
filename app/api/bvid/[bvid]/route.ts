import { NextRequest } from 'next/server'
import { DENO_PROXIES } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { bvid } = await context.params
    if (!/^BV[a-zA-Z0-9]+$/.test(bvid)) {
      return Response.json({ success: false, error: 'Invalid bvid' }, { status: 400 })
    }

    for (const proxyUrl of DENO_PROXIES) {
      try {
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'info', url: `https://www.bilibili.com/video/${bvid}` }),
          signal: AbortSignal.timeout(8000),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.success || !json.data?.video) continue
        const v = json.data.video
        let cover = v.cover_url || ''
        if (cover.startsWith('//')) cover = 'https:' + cover
        else if (cover.startsWith('http://')) cover = 'https://' + cover.slice(7)
        return Response.json({
          success: true,
          data: { bvid: v.bvid || bvid, title: v.title || '', cover_url: cover, duration: v.duration || 0, description: v.description || '' },
        })
      } catch { continue }
    }
    return Response.json({ success: false, error: '视频信息获取失败' }, { status: 502 })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message || 'Server error' }, { status: 500 })
  }
}