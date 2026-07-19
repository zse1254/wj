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
        // Fall back to the Deno proxy, which can reach Bilibili from a different IP.
        try {
          const c = new AbortController()
          const t = setTimeout(() => c.abort(), 8000)
          const proxyRes = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: `https://www.bilibili.com/video/${bvid}` }),
            signal: c.signal,
          }).finally(() => clearTimeout(t))
          const proxyData = await proxyRes.json()
          if (proxyData.success && proxyData.data?.video) {
            const pv = proxyData.data.video
            const videos = Array.isArray(proxyData.data.series?.videos)
              ? (proxyData.data.series.videos as Array<{ bvid?: string; title?: string; cover_url?: string; page?: number; duration?: number; cid?: number }>)
              : []
            const pagesByPage: Record<number, number> = {}
            for (const v of videos) {
              if (v.page && v.duration) pagesByPage[v.page] = v.duration
            }
            const pages = (pv.pages || []) as Array<{ cid: number; page: number; part: string; duration: number }>
            const mappedPages = pages.length
              ? pages.map(p => ({ cid: p.cid, page: p.page, part: p.part, duration: pagesByPage[p.page] || 0 }))
              : (videos.length
                  ? videos.map((v, i) => ({ cid: v.cid || 0, page: v.page || i + 1, part: v.title || `${pv.title} P${v.page || i + 1}`, duration: v.duration || 0 }))
                  : [])
            const series = mappedPages.length
              ? {
                  title: pv.title,
                  videos: mappedPages.map(p => ({
                    bvid: bvid,
                    title: p.part || `${pv.title} P${p.page}`,
                    cover_url: pv.cover_url,
                    page: p.page,
                    duration: p.duration,
                    cid: p.cid,
                  })),
                }
              : null
            return Response.json({
              success: true,
              data: {
                video: { bvid: bvid, title: pv.title, description: pv.description || '', cover_url: pv.cover_url, duration: pv.duration },
                series: series || undefined,
              },
            })
          }
        } catch {
          // ignore, fall through to 500 below
        }
      }
    }

    // Build series from pages[] (each P = one episode, with exact duration)
    let series = null as null | { title: string; videos: { bvid: string; title: string; cover_url: string; page: number; duration: number; cid: number }[] }
    const pages = videoInfo?.pages || []
    if (videoInfo && pages.length >= 1) {
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
