import { extractBilibiliBvid } from '@/lib/bilibili'

const BILIBILI_HOSTS = ['bilibili.com', 'www.bilibili.com', 'b23.tv', 'player.bilibili.com', 'm.bilibili.com']

export function isValidBilibiliUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    return BILIBILI_HOSTS.includes(host) || host.endsWith('.bilibili.com')
  } catch {
    return false
  }
}

export function isValidSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,30}$/.test(slug)
}

export interface BilibiliMeta {
  bvid: string
  title: string
  cover: string
  duration: number
}

export async function fetchBilibiliMeta(url: string): Promise<BilibiliMeta | null> {
  const bvid = extractBilibiliBvid(url)
  if (!bvid) return null
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 9000)
  try {
    const res = await fetch('https://rustic-mayfly-8854.zse1254.deno.net', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://www.bilibili.com/video/${bvid}` }),
      signal: controller.signal,
    })
    const data = await res.json()
    if (data?.success && data?.data?.video) {
      const v = data.data.video
      return {
        bvid,
        title: v.title || `B站视频 ${bvid}`,
        cover: v.cover_url || '',
        duration: Number(v.duration) || 0,
      }
    }
  } catch {
    // ignore
  } finally {
    clearTimeout(t)
  }
  return null
}
