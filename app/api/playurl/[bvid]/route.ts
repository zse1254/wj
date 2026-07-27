import { NextRequest } from 'next/server'
import { getCachedPlayurl, loadAndCachePlayurl } from '@/lib/bvid-cache'

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

    const page = parseInt(request.nextUrl.searchParams.get('p') || '1', 10)

    // Get cid for multi-page
    let cid: number | undefined
    if (page > 1) {
      try {
        const infoRes = await fetch(`${request.nextUrl.origin}/api/bvid/${bvid}`)
        if (infoRes.ok) {
          const infoJson = await infoRes.json()
          if (infoJson.success && infoJson.data?.pages?.length) {
            const pg = infoJson.data.pages.find((p: { page: number; cid: number }) => p.page === page)
            if (pg?.cid) cid = pg.cid
          }
        }
      } catch {}
    }

    // 1. 先查 D1 缓存
    let data = await getCachedPlayurl(bvid, page)
    if (!data) {
      // 2. 缓存过期或无 → 调 Deno 拉最新 → 写 D1
      try {
        data = await loadAndCachePlayurl(bvid, cid, 80, page)
      } catch (err: any) {
        return Response.json({ success: false, error: 'playurl 获取失败: ' + err.message }, { status: 502 })
      }
    }

    if (!data?.dash) {
      return Response.json({ success: false, error: 'DASH 数据不可用' }, { status: 502 })
    }

    // Extract durl (muxed single-file URL, works with <video> tag directly)
    let durlUrl = ''
    if (data.durl && Array.isArray(data.durl) && data.durl.length > 0) {
      const first = data.durl[0]
      durlUrl = first.url || ''
      if (!durlUrl && first.backup_url && Array.isArray(first.backup_url) && first.backup_url.length > 0) {
        durlUrl = first.backup_url[0]
      }
    }

    // Also extract from dash
    let dashVideoUrl = ''
    let dashAudioUrl = ''
    try {
      if (data.dash?.video?.length) {
        dashVideoUrl = data.dash.video[0].base_url || data.dash.video[0].baseUrl || ''
      }
      if (data.dash?.audio?.length) {
        dashAudioUrl = data.dash.audio[0].base_url || data.dash.audio[0].baseUrl || ''
      }
    } catch {}

    return Response.json({
      success: true,
      data,
      directUrl: durlUrl,
      dashVideoUrl,
      dashAudioUrl,
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}