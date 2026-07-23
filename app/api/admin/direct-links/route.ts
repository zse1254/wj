import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { fetchPlayurl } from '@/lib/deno-proxy'

// POST /api/admin/direct-links  { bvid, page? }
// 返回 B站 CDN 直链 (视频+音频 URL 列表)
export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json().catch(() => ({}))
    const bvid = body.bvid as string
    const page = Number(body.page) || 1
    if (!bvid || !/^BV[a-zA-Z0-9]+$/.test(bvid)) {
      return Response.json({ success: false, error: 'Invalid bvid' }, { status: 400 })
    }

    // 获取 cid
    let cid: number | undefined
    if (page > 1) {
      try {
        const infoRes = await fetch(`${new URL(request.url).origin}/api/bvid/${bvid}`)
        if (infoRes.ok) {
          const infoJson = await infoRes.json()
          if (infoJson.success && infoJson.data?.pages?.length) {
            const p = infoJson.data.pages.find((p: { page: number; cid: number }) => p.page === page)
            if (p?.cid) cid = p.cid
          }
        }
      } catch {}
    }

    const data = await fetchPlayurl(bvid, cid, 80)
    if (!data?.dash) {
      return Response.json({ success: false, error: '获取直链失败' }, { status: 502 })
    }

    const video = (data.dash.video || []).map((v: any) => ({
      id: v.id,
      url: v.baseUrl || v.base_url || '',
      backup: v.backupUrl || v.backup_url || [],
      codecs: v.codecs || '',
      width: v.width || 0,
      height: v.height || 0,
      bandwidth: v.bandwidth || v.bandWidth || 0,
    }))
    const audio = (data.dash.audio || []).map((a: any) => ({
      id: a.id,
      url: a.baseUrl || a.base_url || '',
      backup: a.backupUrl || a.backup_url || [],
      codecs: a.codecs || '',
      bandwidth: a.bandwidth || a.bandWidth || 0,
    }))

    return Response.json({
      success: true,
      data: { video, audio, duration: data.dash.duration || data.video_duration || 0 },
    })
  } catch (err: any) {
    const status = err?.message === 'Unauthorized' ? 401 : err?.message === 'Forbidden' ? 403 : 500
    return Response.json({ success: false, error: err.message }, { status })
  }
}
