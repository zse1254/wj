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

function bilibiliHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com',
  }
}

export interface BilibiliVideo {
  bvid: string
  title: string
  description: string
  cover_url: string
  duration: number
}

export interface BilibiliSeries {
  season_id: number
  title: string
  videos: BilibiliVideo[]
}

export async function fetchBilibiliVideoInfo(bvid: string): Promise<{
  video: BilibiliVideo
  season_id?: number
}> {
  const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`
  const res = await fetch(apiUrl, { headers: bilibiliHeaders() })
  if (!res.ok) throw new Error(`Bilibili API error: ${res.status}`)
  const json = await res.json()
  if (json.code !== 0) {
    throw new Error(json.message || 'Bilibili API returned error')
  }
  const d = json.data
  const video: BilibiliVideo = {
    bvid: d.bvid,
    title: d.title || '',
    description: (d.desc || '').slice(0, 500),
    cover_url: d.pic || '',
    duration: d.duration || 0,
  }
  let season_id: number | undefined
  if (d.ugc_season?.id) {
    season_id = d.ugc_season.id
  }
  return { video, season_id }
}

export async function fetchBilibiliSeries(seasonId: number): Promise<BilibiliSeries> {
  const apiUrl = `https://api.bilibili.com/x/web-interface/season/season?season_id=${seasonId}`
  const res = await fetch(apiUrl, { headers: bilibiliHeaders() })
  if (!res.ok) throw new Error(`Bilibili series API error: ${res.status}`)
  const json = await res.json()
  if (json.code !== 0) {
    throw new Error(json.message || 'Bilibili series API returned error')
  }
  const d = json.data
  const videos: BilibiliVideo[] = (d.episodes || []).map((ep: Record<string, unknown>) => ({
    bvid: ep.bvid,
    title: ep.title || '',
    description: '',
    cover_url: ep.cover || '',
    duration: ep.duration || 0,
  }))
  return {
    season_id: seasonId,
    title: d.title || '',
    videos,
  }
}

export async function fetchBilibiliHtmlFallback(bvid: string): Promise<{
  video: BilibiliVideo
  season_id?: number
  series?: BilibiliSeries
}> {
  const pageUrl = `https://www.bilibili.com/video/${bvid}`
  const res = await fetch(pageUrl, { headers: bilibiliHeaders() })
  if (!res.ok) throw new Error(`Bilibili page error: ${res.status}`)
  const html = await res.text()

  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*({.*?});/)
  if (!match) throw new Error('Cannot parse Bilibili page data')

  const data = JSON.parse(match[1])
  const vd = data.videoData
  if (!vd) throw new Error('No video data found')

  const video: BilibiliVideo = {
    bvid: vd.bvid || bvid,
    title: vd.title || '',
    description: (vd.desc || '').slice(0, 500),
    cover_url: vd.pic || '',
    duration: vd.duration || 0,
  }

  let season_id: number | undefined
  let series: BilibiliSeries | undefined

  if (data.ugcSeason?.id) {
    season_id = data.ugcSeason.id
    series = {
      season_id: data.ugcSeason.id,
      title: data.ugcSeason.title || '',
      videos: (data.ugcSeason.episodes || []).map((ep: Record<string, unknown>) => ({
        bvid: ep.bvid,
        title: ep.title || '',
        description: '',
        cover_url: ep.cover || '',
        duration: ep.duration || 0,
      })),
    }
  }

  return { video, season_id, series }
}
