export function extractBilibiliBvid(url: string): string | null {
  const patterns = [
    /bilibili\.com\/video\/(BV[a-zA-Z0-9]+)/,
    /b23\.tv\/([a-zA-Z0-9]+)/,
    /bili_(BV[a-zA-Z0-9]+)/,
  ]
  for (const p of patterns) {
    const m = url.match(p)
    if (m) return m[1]
  }
  return null
}

export function getBilibiliEmbedUrl(bvid: string): string {
  return `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=0&danmaku=0`
}

export function getBilibiliCleanEmbedHtml(bvid: string): string {
  return `
    <iframe
      src="https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=0&danmaku=0"
      scrolling="no"
      frameborder="0"
      allowfullscreen="true"
      sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation"
      style="border:none;width:100%;height:100%;position:absolute;top:0;left:0;"
    ></iframe>
  `
}

export function getBilibiliCoverUrl(bvid: string): string {
  return `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
}
