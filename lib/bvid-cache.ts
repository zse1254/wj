import { query, execute } from './db'
import { fetchPlayurl, DENO_PROXIES } from './deno-proxy'

const CACHE_MINUTES = 50 // CDN deadline is ~60min, refresh 10min before
const TABLE = 'bvid_playurl_cache'

// 探测一个 CDN 源是否健康（B站 CDN 会对代理出口间歇返回 514/403 限流）。
// 通过 Deno /proxy 发 1 字节 Range 请求，返回 200/206 视为健康。
async function probeSource(u: string): Promise<string | null> {
  for (let p = 0; p < DENO_PROXIES.length; p++) {
    const pr = DENO_PROXIES[p]
    try {
      const r = await fetch(`${pr}/proxy?u=${encodeURIComponent(u)}`, {
        headers: { Range: 'bytes=0-0' },
        signal: AbortSignal.timeout(6000),
      })
      if (r.status === 200 || r.status === 206) return pr
    } catch {}
  }
  return null
}

// 重排 durl 候选源：健康的排最前，坏的排最后。
// 只在 playurl 缓存刷新时探测一次（50分钟/集），探测结果随缓存保存，
// 之后 50 分钟内 durl 直链直接命中健康源，0 额外 Deno 请求。
async function orderDurlSources(data: any): Promise<any> {
  const first = data?.durl?.[0]
  if (!first) return data
  const candidates: string[] = []
  if (first.url) candidates.push(first.url)
  if (Array.isArray(first.backup_url)) candidates.push(...first.backup_url.filter(Boolean))
  if (!candidates.length) return data

  const probed = await Promise.all(candidates.map(async (u) => ({ u, healthy: !!(await probeSource(u)) })))
  const healthy = probed.filter((x) => x.healthy).map((x) => x.u)
  const broken = probed.filter((x) => !x.healthy).map((x) => x.u)
  first.url = healthy[0] || candidates[0]
  first.backup_url = [...healthy.slice(1), ...broken]
  return data
}

async function ensureTable() {
  try {
    await execute(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      bvid TEXT NOT NULL,
      page INTEGER NOT NULL DEFAULT 1,
      playurl_json TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      PRIMARY KEY (bvid, page)
    )`)
  } catch {}
}

export async function getCachedPlayurl(bvid: string, page: number = 1): Promise<any | null> {
  await ensureTable()
  const rows = await query(
    `SELECT playurl_json, expires_at FROM ${TABLE} WHERE bvid = ? AND page = ?`,
    [bvid, page]
  ).catch(() => [])
  if (!rows.length) return null
  const row = rows[0]
  const expires = new Date(row.expires_at as string).getTime()
  if (Date.now() > expires) return null
  try {
    return JSON.parse(row.playurl_json as string)
  } catch {
    return null
  }
}

export async function loadAndCachePlayurl(bvid: string, cid?: number, qn: number = 80, page: number = 1): Promise<any> {
  await ensureTable()
  const data = await fetchPlayurl(bvid, cid, qn)
  if (!data?.dash) throw new Error('playurl 返回无效数据')

  // 探测候选源并重排健康源到最前（只在刷新时一次，随后缓存 50 分钟）
  const ordered = await orderDurlSources(data)

  // Calculate expiration from CDN deadline (typically ~1hr)
  let expiresMs = Date.now() + CACHE_MINUTES * 60 * 1000
  try {
    const video = data.dash.video?.[0]
    const baseUrl = video?.baseUrl || video?.base_url || ''
    if (baseUrl) {
      const dl = new URL(baseUrl).searchParams.get('deadline')
      if (dl) {
        const dlMs = Number(dl) * 1000
        if (dlMs > Date.now() + 5 * 60 * 1000) {
          expiresMs = dlMs - 5 * 60 * 1000
        }
      }
    }
  } catch {}

  await execute(
    `INSERT OR REPLACE INTO ${TABLE} (bvid, page, playurl_json, expires_at) VALUES (?, ?, ?, ?)`,
    [bvid, page, JSON.stringify(data), new Date(expiresMs).toISOString()]
  ).catch(() => {})

  return data
}

export async function clearExpiredCache() {
  await ensureTable()
  await execute(
    `DELETE FROM ${TABLE} WHERE expires_at < ?`,
    [new Date().toISOString()]
  ).catch(() => {})
}