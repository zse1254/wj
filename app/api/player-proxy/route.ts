import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const bvid = request.nextUrl.searchParams.get('bvid')
  const p = request.nextUrl.searchParams.get('p')
  if (!bvid) return new Response('Missing bvid', { status: 400 })

  const playerUrl = `https://player.bilibili.com/player.html?bvid=${bvid}${p ? `&p=${p}` : ''}&high_quality=1&autoplay=1&danmaku=0`

  // 尝试直接抓取 B 站播放器页面
  let html: string | null = null
  try {
    const res = await fetch(playerUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.bilibili.com' },
      signal: AbortSignal.timeout(10000),
    })
    if (res.ok) html = await res.text()
  } catch {}

  // 回退：通过 Deno 代理抓取
  if (!html) {
    try {
      const proxyRes = await fetch('https://rustic-mayfly-8854.zse1254.deno.net/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: playerUrl }),
        signal: AbortSignal.timeout(15000),
      })
      if (proxyRes.ok) html = await proxyRes.text()
    } catch {}
  }

  // 回退：通过 CORS 代理抓取
  if (!html) {
    for (const proxy of [
      `https://api.allorigins.cn/raw?url=${encodeURIComponent(playerUrl)}`,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(playerUrl)}`,
    ]) {
      try {
        const res = await fetch(proxy, { signal: AbortSignal.timeout(10000) })
        if (res.ok) { html = await res.text(); break }
      } catch {}
    }
  }

  if (!html) return new Response('Player unavailable', { status: 502 })

  // 将所有相对路径改写为绝对路径，确保资源从 B 站 CDN 加载
  html = html.replace(/(src|href)="\/(?!\/)/g, '$1="https://player.bilibili.com/')

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'X-Robots-Tag': 'noindex' },
  })
}
