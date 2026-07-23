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

// B站官方字符重排表（64 项，生成 mixinKey 时只用前 32 项取字符）
const MIXIN_KEY_ENC_TAB = [
  46,47,18, 2,53, 8,23,32,15,50,10,31,58, 3,45,35,
  27,43, 5,49,33, 9,42,19,29,28,14,39,12,38,41,13,
  37,48, 7,16,24,55,40,61,26,17, 0, 1,60,51,30, 4,
  22,25,54,21,56,59, 6,63,57,62,11,36,20,34,44,52,
]

function getMixinKey(imgKey: string, subKey: string): string {
  const raw = imgKey + subKey  // imgKey 在前，总长 64
  return MIXIN_KEY_ENC_TAB.map(n => raw[n]).join('').slice(0, 32)
}

let mixKeyCache: string | null = null
let mixKeyCacheTs = 0
async function getMixKey(): Promise<string> {
  if (mixKeyCache && (Date.now() - mixKeyCacheTs) < 3600_000) return mixKeyCache
  const navRes = await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: bilibiliHeaders() })
  const navJson = await navRes.json()
  // nav 未登录时返回 code=-101，但 wbi_img 仍然有效，可直接取用
  const data = navJson.data || navJson
  const img = data?.wbi_img?.img_url || ''
  const sub = data?.wbi_img?.sub_url || ''
  if (!img || !sub) throw new Error('获取 Wbi 密钥失败: ' + (navJson.message || JSON.stringify(navJson).slice(0,100)))
  const imgKey = img.split('/').pop()?.split('.')[0] || ''
  const subKey = sub.split('/').pop()?.split('.')[0] || ''
  mixKeyCache = getMixinKey(imgKey, subKey)
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

// Playurl 接口已迁移到 lib/deno-proxy.ts (通过 Deno 代理调用 B站 API)

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

// ---------- 推荐/排行/热门/搜索 ----------
// 已迁移到 lib/deno-proxy.ts (通过 Deno 代理调用 B站 API)
// FeedItem 类型和 cover URL 修复也移至 deno-proxy.ts
