export function isBilibiliUrl(url: string | null): boolean {
  if (!url) return false
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host.endsWith('bilibili.com') || host === 'b23.tv'
  } catch { return false }
}

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

function generateBuvid3(): string {
  const hex = () => Math.random().toString(16).slice(2, 10)
  return `${hex()}-${hex().slice(0,4)}-${hex().slice(0,4)}-${hex().slice(0,4)}-${hex()}${hex().slice(0,4)}infoc`
}

export function bilibiliHeaders(referer?: string) {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': referer || 'https://www.bilibili.com',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cookie': `buvid3=${generateBuvid3()}`,
  }
}

function bilibiliHtmlHeaders() {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
    'Origin': 'https://www.bilibili.com',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    'Cookie': `buvid3=${generateBuvid3()}`,
  }
}

// ---------- Wbi 签名 (直接从 Deno 代理移植) ----------

function md5Sync(input: string): string {
  function rotL(x: number, n: number) { return (x << n) | (x >>> (32 - n)) }
  const bytes: number[] = []
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i)
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) { bytes.push(0xc0 | (code >> 6)); bytes.push(0x80 | (code & 0x3f)) }
    else { bytes.push(0xe0 | (code >> 12)); bytes.push(0x80 | ((code >> 6) & 0x3f)); bytes.push(0x80 | (code & 0x3f)) }
  }
  const bitLen = bytes.length * 8
  bytes.push(0x80)
  while ((bytes.length + 8) % 64 !== 0) bytes.push(0)
  const lenArr = [bitLen & 0xff, (bitLen >>> 8) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 24) & 0xff, 0, 0, 0, 0]
  for (const b of lenArr) bytes.push(b)
  const padded = new Uint8Array(bytes)
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), true)
  dv.setUint32(padded.length - 4, bitLen >>> 0, true)
  const K = [
    0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
    0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
    0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
    0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
    0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
    0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
    0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
    0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391,
  ]
  const S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21]
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < padded.length; off += 64) {
    const M = new Array(16)
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true)
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + K[i] + M[g]) >>> 0
      A = D; D = C; C = B
      B = (B + rotL(F, S[i])) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const toHex = (n: number) => { let h = ''; for (let i = 0; i < 4; i++) h += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2,'0'); return h }
  return toHex(a0) + toHex(b0) + toHex(c0) + toHex(d0)
}

let mixKeyCache: string | null = null
let mixKeyCacheTs = 0
async function getMixKey(): Promise<string> {
  if (mixKeyCache && (Date.now() - mixKeyCacheTs) < 3600_000) return mixKeyCache
  const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: bilibiliHeaders() })
  const navJson = await navRes.json()
  if (navJson.code !== 0) throw new Error('nav 接口失败: ' + (navJson.message || 'unknown'))
  const img = navJson.data.wbi_img || navJson.data?.wbi_img?.img_url || ''
  const sub = navJson.data.wbi_img || navJson.data?.wbi_img?.sub_url || ''
  const imgKey = (typeof img === 'string' ? img : '').split('/').pop()?.split('.')[0] || ''
  const subKey = (typeof sub === 'string' ? sub : '').split('/').pop()?.split('.')[0] || ''
  mixKeyCache = subKey.substring(0,4) + imgKey.substring(0,4)
  mixKeyCacheTs = Date.now()
  return mixKeyCache
}

async function wbiSign(params: Record<string, string>): Promise<Record<string, string>> {
  const mix = await getMixKey()
  const ts = Math.floor(Date.now() / 1000)
  const chrFilter = /[!'()*]/g
  const paramsWithWts: Record<string, string> = { ...params, wts: String(ts) }
  const sorted = Object.keys(paramsWithWts).sort()
  const query = sorted.map(k => {
    const v = (paramsWithWts as Record<string, string>)[k].replace(chrFilter, '')
    return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
  }).join('&')
  const wRid = md5Sync(query + mix)
  return { ...params, wts: String(ts), w_rid: wRid }
}

// ---------- Playurl 接口 (直调 B站) ----------

export interface DashStream {
  id: number; baseUrl: string; backupUrl?: string[]; base_url?: string; backup_url?: string[]
  bandwidth?: number; bandWidth?: number; codecs?: string; width?: number; height?: number
  segment_base?: { initialization?: string; index_range?: string }; SegmentBase?: { initialization?: string; indexRange?: string }
}

export interface PlayurlResult {
  bvid: string; cid: number; quality: number
  accept_quality: number[]; accept_qn: number[]
  video_duration: number
  dash: { video: DashStream[]; audio: DashStream[]; duration?: number }
  durl?: any; endpoint?: string
}

export async function fetchBilibiliPlayurl(bvid: string, cid?: number, qn?: number): Promise<PlayurlResult> {
  const hdrs = bilibiliHeaders(`https://www.bilibili.com/video/${bvid}`)

  // 无 cid → pagelist 取第一页
  let resolvedCid = cid
  if (!resolvedCid) {
    const plRes = await fetch(`https://api.bilibili.com/x/player/pagelist?bvid=${bvid}`, { headers: hdrs })
    const plJson = await plRes.json()
    if (plJson.code !== 0 || !plJson.data?.length) throw new Error('获取 cid 失败: ' + (plJson.message || 'no pages'))
    resolvedCid = plJson.data[0].cid
  }

  const targetQn = qn || 80
  const commonParams = `bvid=${bvid}&cid=${resolvedCid}&qn=${targetQn}&fnval=4048&fourk=1`

  // 策略1: 旧版 /x/player/playurl (不需要 wbi, 匿名也能返 DASH)
  try {
    const res = await fetch(`https://api.bilibili.com/x/player/playurl?${commonParams}`, { headers: hdrs })
    const json = await res.json()
    if (json.code === 0 && json.data?.dash) {
      return {
        bvid, cid: Number(resolvedCid), quality: json.data.quality,
        accept_quality: json.data.accept_quality || [], accept_qn: json.data.accept_qn || [],
        video_duration: json.data.dash?.duration || 0,
        dash: json.data.dash,
        durl: json.data.durl || null,
        endpoint: 'playurl',
      }
    }
  } catch {}

  // 策略2: wbi/v2 (匿名可能只返 preview, 但带上签名至少能返数据)
  const unsigned: Record<string, string> = { bvid, cid: String(resolvedCid), qn: String(targetQn), fnval: '4048', fourk: '1' }
  const signed = await wbiSign(unsigned)
  const query = Object.entries(signed).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const res = await fetch(`https://api.bilibili.com/x/player/wbi/v2?${query}`, { headers: hdrs })
  const json = await res.json()
  if (json.code !== 0) throw new Error('playurl wbi/v2 失败: ' + (json.message || 'unknown'))
  if (!json.data?.dash) throw new Error('无登录态无法获取 DASH: ' + (json.data?.preview_toast || 'no dash'))

  return {
    bvid, cid: Number(resolvedCid), quality: json.data.quality,
    accept_quality: json.data.accept_quality || [], accept_qn: json.data.accept_qn || [],
    video_duration: json.data.dash?.duration || 0,
    dash: json.data.dash,
    durl: json.data.durl || null,
    endpoint: 'wbi/v2',
  }
}

export interface BilibiliVideo {
  bvid: string
  title: string
  description: string
  cover_url: string
  duration: number
  page?: number
  cid?: number
}

export interface BilibiliSeries {
  season_id: number
  title: string
  videos: BilibiliVideo[]
}

export interface BilibiliPage {
  cid: number
  page: number
  part: string
  duration: number
}

export async function fetchBilibiliVideoInfo(bvid: string): Promise<{
  video: BilibiliVideo
  season_id?: number
  pages: BilibiliPage[]
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
  const pages: BilibiliPage[] = (d.pages || []).map((p: Record<string, unknown>) => ({
    cid: Number(p.cid) || 0,
    page: Number(p.page) || 0,
    part: (p.part as string) || '',
    duration: Number(p.duration) || 0,
  }))
  return { video, season_id, pages }
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

export interface BilibiliHtmlData {
  video: BilibiliVideo
  season_id?: number
  series?: BilibiliSeries
}

export function parseBilibiliHtml(html: string, bvid: string): BilibiliHtmlData {
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

  // pages[] 含每 P 的准确 duration，按 page 序号匹配到 series 各项
  const pagesByPage: Record<number, number> = {}
  for (const p of (vd.pages || []) as Record<string, unknown>[]) {
    const pageNum = Number(p.page) || 0
    const dur = Number(p.duration) || 0
    if (pageNum) pagesByPage[pageNum] = dur
  }

  if (data.ugcSeason?.id) {
    season_id = data.ugcSeason.id
    series = {
      season_id: data.ugcSeason.id,
      title: data.ugcSeason.title || '',
      videos: (data.ugcSeason.episodes || []).map((ep: Record<string, unknown>, i: number) => {
        const pageNum = Number(ep.page) || (i + 1)
        return {
          bvid: ep.bvid,
          title: ep.title || '',
          description: '',
          cover_url: ep.cover || '',
          page: pageNum,
          duration: pagesByPage[pageNum] || 0,
        }
      }),
    }
  }

  return { video, season_id, series }
}

export async function fetchBilibiliHtmlFallback(bvid: string): Promise<BilibiliHtmlData> {
  const pageUrl = `https://www.bilibili.com/video/${bvid}`
  const res = await fetch(pageUrl, { headers: bilibiliHtmlHeaders() })
  if (!res.ok) throw new Error(`Bilibili page error: ${res.status}`)
  const html = await res.text()
  return parseBilibiliHtml(html, bvid)
}

// ---------- 推荐/排行/热门/搜索 (直调 B站 API, 不走 Deno) ----------

function fixPic(pic: string): string {
  if (!pic) return ''
  if (pic.startsWith('//')) return 'https:' + pic
  if (pic.startsWith('http://')) return 'https://' + pic.slice(7)
  return pic
}

export interface FeedItem {
  bvid: string; title: string; author: string; duration: number
  cover_url: string; play: number; danmaku: number; pts?: number
}

export async function fetchRcmd(): Promise<FeedItem[]> {
  const res = await fetch('https://api.bilibili.com/x/web-interface/index/top/feed/rcmd', { headers: bilibiliHeaders() })
  const json = await res.json()
  if (json.code !== 0) throw new Error(json.message || '推荐获取失败')
  return (json.data?.item || []).map((r: any) => ({
    bvid: r.bvid, title: r.title || '', author: r.owner?.name || r.author_name || '',
    duration: r.duration || 0, cover_url: fixPic(r.pic),
    play: r.stat?.view || 0, danmaku: r.stat?.danmaku || 0,
  }))
}

export async function fetchRanking(rid?: number): Promise<{ items: FeedItem[]; name: string }> {
  const res = await fetch(`https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rid || 0}&type=all`, { headers: bilibiliHeaders() })
  const json = await res.json()
  if (json.code !== 0) throw new Error(json.message || '排行获取失败')
  const items = (json.data?.list || []).map((r: any) => ({
    bvid: r.bvid, title: r.title || '', author: r.owner?.name || r.author || '',
    duration: r.duration || 0, cover_url: fixPic(r.pic),
    play: r.stat?.view || 0, danmaku: r.stat?.danmaku || 0, pts: r.pts || 0,
  }))
  return { items, name: json.data?.name || '' }
}

export async function fetchPopular(pn?: number): Promise<FeedItem[]> {
  const res = await fetch(`https://api.bilibili.com/x/web-interface/popular?pn=${pn || 1}&ps=20`, { headers: bilibiliHeaders() })
  const json = await res.json()
  if (json.code !== 0) throw new Error(json.message || '热门获取失败')
  return (json.data?.list || []).map((r: any) => ({
    bvid: r.bvid, title: r.title || '', author: r.owner?.name || r.author || '',
    duration: r.duration || 0, cover_url: fixPic(r.pic),
    play: r.stat?.view || 0, danmaku: r.stat?.danmaku || 0,
  }))
}

// 搜索：必须用 /x/web-interface/wbi/search/type（旧版 /search/default 已废弃只返回推荐词）
// Wbi 签名已在 fetchBilibiliPlayurl 里实现，此处只调用
export async function fetchSearch(keyword: string): Promise<FeedItem[]> {
  const unsigned: Record<string, string> = { keyword, search_type: 'video' }
  const signed = await wbiSign(unsigned)
  const query = Object.entries(signed).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const res = await fetch(`https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`, { headers: bilibiliHeaders() })
  const json = await res.json()
  if (json.code !== 0) throw new Error(json.message || '搜索失败')
  return (json.data?.result || []).map((r: any) => ({
    bvid: r.bvid, title: r.title?.replace(/<em class=["']keyword["']>/g,'').replace(/<\/em>/g,'') || r.title || '',
    author: r.author || r.owner?.name || '', duration: r.duration || 0,
    cover_url: fixPic(r.pic),
    play: r.play || r.stat?.view || 0,
    danmaku: r.danmaku || r.stat?.danmaku || 0,
  }))
}

function fixCoverUrl(url: string): string {
  if (!url) return ''
  if (url.startsWith('//')) return 'https:' + url
  if (url.startsWith('http://')) return 'https://' + url.slice(7)
  return url
}

export { fixCoverUrl }
