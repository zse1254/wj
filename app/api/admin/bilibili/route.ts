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

    type VideoInfoResult = { video: { bvid: string; title: string; description: string; cover_url: string; duration: number }; season_id?: number; pages?: { cid: number; page: number; part: string; duration: number }[] }
    let videoInfo: VideoInfoResult | null = null
    try {
      videoInfo = await fetchBilibiliVideoInfo(bvid)
    } catch {
      try {
        const fallback = await fetchBilibiliHtmlFallback(bvid)
        videoInfo = { video: fallback.video, season_id: fallback.season_id }
        if (fallback.series) {
          return Response.json({
            success: true,
            data: { video: fallback.video, series: fallback.series },
          })
        }
      } catch {
        // Both direct API and HTML fallback failed (e.g. CF IP blocked by Bilibili).
        // Deno proxy removed: 已冻结且费额度，改为直接报错，前端会自动用 CORS proxies 兜底。
        // fall through to 500 below
      }
    }

    // Build series from pages[] (each P = one episode, with exact duration).
    // 单集视频（分集数 == 1）不构建合集：只返回 video 元数据，前端保持单视频类型（无连播、不要时长）
    let series = null as null | { title: string; videos: { bvid: string; title: string; cover_url: string; page: number; duration: number; cid: number }[] }
    const pages = videoInfo?.pages || []
    if (videoInfo && pages.length > 1) {
      series = {
        title: videoInfo.video.title,
        videos: pages.map(p => ({
          bvid: videoInfo.video.bvid,
          title: p.part || `${videoInfo.video.title} P${p.page}`,
          cover_url: videoInfo.video.cover_url,
          page: p.page,
          duration: p.duration,
          cid: p.cid,
        })),
      }
    }

    // If it's a UGC season, prefer the season's episode list (multi-bvid) but keep page durations if available
    if (videoInfo?.season_id && (!series || series.videos.length <= 1)) {
      try {
        const seasonSeries = await fetchBilibiliSeries(videoInfo.season_id)
        if (seasonSeries?.videos?.length) {
          series = {
            title: seasonSeries.title,
            videos: seasonSeries.videos.map(v => ({
              bvid: v.bvid,
              title: v.title,
              cover_url: v.cover_url,
              page: v.page || 1,
              duration: v.duration || 0,
              cid: 0,
            })),
          }
        }
      } catch {
        const fallback = await fetchBilibiliHtmlFallback(bvid)
        if (fallback.series) {
          series = {
            title: fallback.series.title,
            videos: fallback.series.videos.map(v => ({
              bvid: v.bvid,
              title: v.title,
              cover_url: v.cover_url,
              page: v.page || 1,
              duration: v.duration || 0,
              cid: 0,
            })),
          }
        }
      }
    }

    if (!videoInfo) {
      return Response.json({ success: false, error: '无法获取 Bilibili 视频信息（CF IP 被封，代理也失败）', bvid }, { status: 502 })
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
