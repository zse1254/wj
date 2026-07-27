import { query, execute } from './db'
import { fetchPlayurl } from './deno-proxy'

const CACHE_MINUTES = 50 // CDN deadline is ~60min, refresh 10min before
const TABLE = 'bvid_playurl_cache'

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