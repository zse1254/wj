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

  // 将所有相对路径改写为绝对路径
  html = html.replace(/(src|href)="\/(?!\/)/g, '$1="https://player.bilibili.com/')

  // 清洗：移除 B 站 logo、水印、跳转链接等非播放控制元素
  html = html
    // 移除 logo/header 区域
    .replace(/<div[^>]*?bpx-player-top[^>]*?>[\s\S]*?<\/div>/gi, '')
    // 移除 B 站水印（带 bilibili-watermark 或类似特征的元素）
    .replace(/<div[^>]*?watermark[^>]*?>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*?bpx-player-video-info[^>]*?>[\s\S]*?<\/div>/gi, '')
    // 移除链接到 bilibili.com 的 <a> 标签（保留内容）
    .replace(/<a[^>]*?href="https?:\/\/(?:www\.)?bilibili\.com[^"]*"[^>]*?>([\s\S]*?)<\/a>/gi, '$1')
    // 移除带 "打开" + "哔哩哔哩" 的按钮/提示
    .replace(/<[^>]*?[\u6253\u5f00][^>]*?[\u54d7\u54e9\u54d7\u54e9][^>]*?>[\s\S]*?<\/[^>]+>/gi, '')
    // 移除 bpx-player-state-browser 等覆盖层（提示打开 app）
    .replace(/<div[^>]*?bpx-player-state[^>]*?>[\s\S]*?<\/div>/gi, '')

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'X-Robots-Tag': 'noindex' },
  })
}
