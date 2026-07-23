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

    let pages: { cid: number; page: number; part: string; cover_url?: string; duration?: number }[] = []
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
        // 提取 pages 信息 (含 cid)
        if (json.data.series?.videos?.length) {
          pages = json.data.series.videos.map((sv: { cid?: number; page?: number; title?: string; cover_url?: string; duration?: number }) => ({
            cid: sv.cid || 0, page: sv.page || 1, part: sv.title || '',
            cover_url: sv.cover_url || '', duration: sv.duration || 0,
          })).filter((p: { cid: number }) => p.cid)
        }
        return Response.json({
          success: true,
          data: { bvid: v.bvid || bvid, title: v.title || '', cover_url: cover, duration: v.duration || 0, description: v.description || '', pages },
        })
      } catch { continue }
    }
    return Response.json({ success: false, error: '视频信息获取失败' }, { status: 502 })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message || 'Server error' }, { status: 500 })
  }
}