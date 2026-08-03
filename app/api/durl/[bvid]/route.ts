import { NextRequest } from 'next/server'
import { getCachedPlayurl, loadAndCachePlayurl } from '@/lib/bvid-cache'
import { DENO_PROXIES } from '@/lib/deno-proxy'

export const dynamic = 'force-dynamic'

// 手机/任意浏览器：<video src="/api/durl/[bvid]?p=1"> 直接播放完整 mp4
// Deno 仅 1 次代理请求/视频（durl 已在 playurl 缓存里，50分钟刷新1次）
export async function GET(
  request: NextRequest,
  context: any
) {
  try {
    const { bvid } = await context.params
    if (!/^BV[a-zA-Z0-9]+$/.test(bvid)) {
      return new Response('Invalid bvid', { status: 400 })
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

    // 1. D1 缓存（若无 durl 字段说明是旧缓存，强制刷新）
    let data = await getCachedPlayurl(bvid, page)
    if (!data?.durl || !Array.isArray(data.durl) || !data.durl.length) {
      try {
        data = await loadAndCachePlayurl(bvid, cid, 80, page)
      } catch (err: any) {
        console.error('[durl] playurl error:', err.message)
        return new Response('Failed to fetch from Bilibili', { status: 502 })
      }
    }

    if (!data?.durl || !Array.isArray(data.durl) || !data.durl.length) {
      console.error('[durl] no durl in playurl data, keys:', Object.keys(data || {}).join(','))
      return new Response('No durl available', { status: 502 })
    }

    // Pick main URL or backup_url, rotating by `i` (CDN 换源，0 额外 Deno 请求)
    // 源已由 loadAndCachePlayurl 探测重排：健康源在最前（i=0 即健康源），
    // 坏源被排到 backup 尾部，直接打开直链也始终能播。
    const i = Math.max(0, parseInt(request.nextUrl.searchParams.get('i') || '0', 10) || 0)
    const first = data.durl[0]
    const candidates: string[] = []
    if (first.url) candidates.push(first.url)
    if (Array.isArray(first.backup_url)) candidates.push(...first.backup_url.filter(Boolean))
    if (!candidates.length) {
      return new Response('No mp4 url', { status: 502 })
    }
    const mp4Url = candidates[i % candidates.length]

    // 2. 默认 302 → Deno /proxy?u=mp4 (Deno 加 Referer 转发，浏览器直接流式播放)
    // 但注意：浏览器 <video> 请求跨域 302 时会剥离 Range 头，导致 Deno 无法按字节区间返回。
    // 所以播放页应使用 ?json=1 拿到直连 URL 后直接设置 video.src（不经 302），保证 Range 正常。
    const proxy = DENO_PROXIES[Math.floor(Math.random() * DENO_PROXIES.length)]
    const streamUrl = `${proxy}/proxy?u=${encodeURIComponent(mp4Url)}`

    // ?json=1: 返回直连 URL（播放页 <video> 使用，避免跨域 302 丢 Range）
    if (request.nextUrl.searchParams.get('json') === '1') {
      return Response.json({ success: true, url: streamUrl })
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: streamUrl,
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err: any) {
    console.error('[durl] error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
