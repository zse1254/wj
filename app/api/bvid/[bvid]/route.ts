import { NextRequest } from 'next/server'
import { fetchBilibiliVideoInfo, fixCoverUrl } from '@/lib/bilibili'

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

    // 直接从 B站 API 调 (CF Workers 能调 api.bilibili.com)
    try {
      const data = await fetchBilibiliVideoInfo(bvid)
      const v = data.video
      let cover = fixCoverUrl(v.cover_url)
      if (cover.startsWith('//')) cover = 'https:' + cover
      else if (cover.startsWith('http://')) cover = 'https://' + cover.slice(7)
      if (data.pages?.length) {
        pages = data.pages.map((p) => ({
          cid: p.cid || 0, page: p.page || 1, part: p.part || '',
          cover_url: fixCoverUrl(cover), duration: p.duration || 0,
        })).filter((p) => p.cid)
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