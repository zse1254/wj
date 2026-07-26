import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

function genBuvid3(): string {
  const h = () => Math.random().toString(16).slice(2, 10)
  return `${h()}-${h().slice(0, 4)}-${h().slice(0, 4)}-${h().slice(0, 4)}-${h()}${h().slice(0, 4)}infoc`
}

function isValidCdnUrl(target: string): boolean {
  try {
    const u = new URL(target)
    if (u.protocol !== 'https:') return false
    const h = u.hostname
    return (
      h.endsWith('.bilivideo.com') ||
      h.endsWith('.bilivideo.cn') ||
      h.endsWith('.akamaized.net') ||
      h.endsWith('.bilibili.com') ||
      h.endsWith('.hdslb.com')
    )
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  return handleProxyRequest(request)
}

export async function HEAD(request: NextRequest) {
  return handleProxyRequest(request, true)
}

async function handleProxyRequest(request: NextRequest, isHead = false) {
  try {
    const target = request.nextUrl.searchParams.get('u')
    if (!target) {
      return new Response('Missing u parameter', { status: 400 })
    }

    if (!isValidCdnUrl(target)) {
      return new Response('Invalid CDN URL domain', { status: 400 })
    }

    const fwdHeaders = new Headers()
    const range = request.headers.get('range')
    if (range) fwdHeaders.set('range', range)
    if (request.headers.get('if-range')) fwdHeaders.set('if-range', request.headers.get('if-range')!)
    if (request.headers.get('if-none-match')) fwdHeaders.set('if-none-match', request.headers.get('if-none-match')!)
    fwdHeaders.set('referer', 'https://www.bilibili.com')
    fwdHeaders.set('origin', 'https://www.bilibili.com')
    fwdHeaders.set('user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36')
    fwdHeaders.set('accept', '*/*')
    fwdHeaders.set('accept-encoding', 'identity')
    fwdHeaders.set('accept-language', 'zh-CN,zh;q=0.9,en;q=0.8')
    fwdHeaders.set('cookie', `buvid3=${genBuvid3()}; b_nut=100`)

    const upstream = await fetch(target, {
      method: isHead ? 'GET' : 'GET',
      headers: fwdHeaders,
      redirect: 'follow',
    })

    if (isHead) {
      const respHeaders = new Headers()
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control', 'last-modified']) {
        const v = upstream.headers.get(h)
        if (v) respHeaders.set(h, v)
      }
      respHeaders.set('access-control-allow-origin', '*')
      respHeaders.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
      respHeaders.set('access-control-allow-headers', 'Range')
      return new Response(null, { status: upstream.ok ? 200 : upstream.status, headers: respHeaders })
    }

    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream ${upstream.status}`, {
        status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      })
    }

    const respHeaders = new Headers()
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'cache-control', 'last-modified']) {
      const v = upstream.headers.get(h)
      if (v) respHeaders.set(h, v)
    }
    respHeaders.set('access-control-allow-origin', '*')
    respHeaders.set('access-control-allow-methods', 'GET, HEAD, OPTIONS')
    respHeaders.set('access-control-allow-headers', 'Range')

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    })
  } catch (e: any) {
    return new Response(`Proxy error: ${e?.message || e}`, { status: 500 })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': 'Range',
      'access-control-max-age': '86400',
    },
  })
}
