import { NextRequest } from 'next/server'
import { fetchPlayurl } from '@/lib/deno-proxy'

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
    const pageParam = parseInt(request.nextUrl.searchParams.get('p') || '0', 10)

    let cid: number | undefined
    if (pageParam > 1) {
      try {
        const infoRes = await fetch(`${request.nextUrl.origin}/api/bvid/${bvid}`)
        if (infoRes.ok) {
          const infoJson = await infoRes.json()
          if (infoJson.success && infoJson.data?.pages?.length) {
            const page = infoJson.data.pages.find((p: { page: number; cid: number }) => p.page === pageParam)
            if (page?.cid) cid = page.cid
          }
        }
      } catch {}
    }

    let data: any = null
    try {
      data = await fetchPlayurl(bvid, cid || undefined, 80)
    } catch (err: any) {
      return Response.json({ success: false, error: err.message }, { status: 502 })
    }

    if (!data) {
      return Response.json({ success: false, error: 'No data from Bilibili' }, { status: 502 })
    }

    const hls = data.hls
    if (hls?.master_url) {
      return Response.json({
        success: true,
        url: hls.master_url,
        quality: hls.quality || [],
      })
    }

    return Response.json({ success: false, error: 'No HLS stream available' }, { status: 404 })
  } catch (err: any) {
    return Response.json({ success: false, error: err.message }, { status: 500 })
  }
}
