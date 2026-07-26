import { NextRequest } from 'next/server'

// CDN 代理: 服务端设 Referer/UA 让 B站 CDN 接受 (浏览器直连会被 Referer 校验拒绝)
// 用法: GET /api/cdn-proxy?u=<B站 m4s URL>
// 部署在 CF Workers 上, 不消耗 Deno 额度
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const target = request.nextUrl.searchParams.get('u')
    if (!target || !/^https:\/\/[\w.-]+(\.bilivideo\.com|\.akamaized\.net)\//.test(target)) {
      return new Response('Bad target', { status: 400 })
    }

    // 把浏览器的 Range 头透传到 B站 CDN
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
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new Response(`Upstream ${upstream.status}`, { status: upstream.status })
    }

    const respHeaders = new Headers()
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
