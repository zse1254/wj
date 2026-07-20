import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, execute } from '@/lib/db'
import { extractBilibiliBvid } from '@/lib/bilibili'
import { DENO_PROXIES } from '@/lib/deno-proxy'

export async function POST(
  _request: NextRequest,
  context: any
) {
  try {
    await requireAdmin()
    const { id } = await context.params

    let articles = await query('SELECT bilibili_url FROM articles WHERE id = ?', [id]).catch(() => [])
    if (!articles.length) {
      try { await query("ALTER TABLE articles ADD COLUMN stream_data TEXT", []) } catch {}
      try { await query("ALTER TABLE articles ADD COLUMN stream_expires_at TEXT", []) } catch {}
      articles = await query('SELECT bilibili_url FROM articles WHERE id = ?', [id])
    }
    if (!articles.length) {
      return Response.json({ success: false, error: 'Not found' }, { status: 404 })
    }
    const bilibiliUrl = (articles[0] as any).bilibili_url
    if (!bilibiliUrl) {
      return Response.json({ success: false, error: 'No bilibili URL' }, { status: 400 })
    }

    const bvid = extractBilibiliBvid(bilibiliUrl)
    if (!bvid) {
      return Response.json({ success: false, error: 'Invalid bilibili URL' }, { status: 400 })
    }

    let success = false
    for (const proxyUrl of DENO_PROXIES) {
      try {
        const res = await fetch(proxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'playurl', bvid }),
          signal: AbortSignal.timeout(15000),
        })
        if (!res.ok) continue
        const data = await res.json()
        if (!data.success) continue
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        await execute('UPDATE articles SET stream_data = ?, stream_expires_at = ? WHERE id = ?', [
          JSON.stringify(data.data), expiresAt, id,
        ])
        success = true
        break
      } catch {}
    }

    if (success) {
      return Response.json({ success: true, message: '直链已刷新' })
    }
    return Response.json({ success: false, error: '所有 Deno 代理均失败' }, { status: 502 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return Response.json({ success: false, error: msg }, { status: 500 })
  }
}
