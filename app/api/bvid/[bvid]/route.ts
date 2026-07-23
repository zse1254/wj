import { NextRequest } from 'next/server'
import { fetchBilibiliInfo, fixCoverUrl } from '@/lib/deno-proxy'

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

    try {
      const data = await fetchBilibiliInfo(`https://www.bilibili.com/video/${bvid}`)
      const v = data.video
      let cover = fixCoverUrl(v.cover_url || '')
      if (cover.startsWith('//')) cover = 'https:' + cover
      else if (cover.startsWith('http://')) cover = 'https://' + cover.slice(7)
      if (data.series?.videos?.length) {
        pages = data.series.videos.map((sv: { cid?: number; page?: number; title?: string; cover_url?: string; duration?: number }) => ({
          cid: sv.cid || 0, page: sv.page || 1, part: sv.title || '',
          cover_url: fixCoverUrl(sv.cover_url || ''), duration: sv.duration || 0,
        })).filter((p: { cid: number }) => p.cid)
      }
      return Response.json({
        success: true,
        data: { bvid: v.bvid || bvid, title: v.title || '', cover_url: cover, duration: v.duration || 0, description: v.description || '', pages },
      })
    } catch (err: any) {
      return Response.json({ success: false, error: '视频信息获取失败: ' + (err.message || '网络错误') }, { status: 502 })
    }
  } catch (err: any) {
    return Response.json({ success: false, error: err.message || 'Server error' }, { status: 500 })
  }
}