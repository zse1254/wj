import { NextRequest } from 'next/server'

// 把 B站 CDN 的 m4s 请求代理过来: 服务端加 Referer/UA 让 B站 CDN 接受
// 用法: GET /api/stream/[id]/proxy?u=<原始B站 m4s URL>
//
// dash.js 在 BaseURL 是相对 URL 时, 会把 query 字段保留, 然后用 byte-range header 请求,
// 我们在这里 fetch 一次再以 ReadableStream 透传出去.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get('u')
    if (!target || !/^https:\/\/[\w.-]+(\.bilivideo\.com|\.akamaized\.net)\//.test(target)) {
      return new Response('Bad target', { status: 400 })
    }

    // 把浏览器送来的 Range 头透传到 B站 CDN
    const fwdHeaders = new Headers()
    const range = request.headers.get('range')
    if (range) fwdHeaders.set('range', range)
    // Referer 是 B站 CDN 校验的关键, 必须 bilibili.com
    fwdHeaders.set('referer', 'https://www.bilibili.com')
    fwdHeaders.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    fwdHeaders.set('accept', '*/*')
    fwdHeaders.set('accept-encoding', 'identity')
    fwdHeaders.set('accept-language', 'zh-CN,zh;q=0.9,en;q=0.8')
    fwdHeaders.set('origin', 'https://www.bilibili.com')

    const upstream = await fetch(target, {
      headers: fwdHeaders,
      // 不带 cache, 让 byte-range 请求每次都打到 B站 CDN
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new Response(`Upstream ${upstream.status}`, { status: upstream.status })
    }

    const respHeaders = new Headers()
    // 把 B站 CDN 返回的 Range 相关头透传给浏览器
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control']) {
      const v = upstream.headers.get(h)
      if (v) respHeaders.set(h, v)
    }
    respHeaders.set('access-control-allow-origin', '*')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    })
  } catch (e: any) {
    return new Response(`Proxy error: ${e?.message || e}`, { status: 500 })
  }
}
