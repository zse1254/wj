import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { extractBilibiliBvid, fetchBilibiliVideoInfo, fetchBilibiliSeries, fetchBilibiliHtmlFallback } from '@/lib/bilibili'

export async function POST(request: NextRequest) {
  let bvid = ''
  try {
    await requireAdmin()
    const { url } = await request.json()
    if (!url) {
      return Response.json({ success: false, error: '请输入 Bilibili 链接' }, { status: 400 })
    }

    const extracted = extractBilibiliBvid(url)
    if (!extracted) {
      return Response.json({ success: false, error: '无法识别 Bilibili 链接格式' }, { status: 400 })
    }
    bvid = extracted

    type VideoInfoResult = { video: { bvid: string; title: string; description: string; cover_url: string; duration: number }; season_id?: number }
    let videoInfo: VideoInfoResult
    try {
      videoInfo = await fetchBilibiliVideoInfo(bvid)
    } catch {
      const fallback = await fetchBilibiliHtmlFallback(bvid)
      videoInfo = { video: fallback.video, season_id: fallback.season_id }
      if (fallback.series) {
        return Response.json({
          success: true,
          data: { video: fallback.video, series: fallback.series },
        })
      }
    }

    let series = null
    if (videoInfo.season_id) {
      try {
        series = await fetchBilibiliSeries(videoInfo.season_id)
      } catch {
        const fallback = await fetchBilibiliHtmlFallback(bvid)
        series = fallback.series || null
      }
    }

    return Response.json({
      success: true,
      data: {
        video: videoInfo.video,
        series: series || undefined,
      },
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg, bvid }, { status: 500 })
  }
}
